import { Prisma } from "@prisma/client";
import { hasPermission, isOwner, type AccessContext } from "./access-control.js";

export type CreatorAccountErrorCode =
  | "CREATOR_ACCOUNT_OWNER_REQUIRED"
  | "CREATOR_ACCOUNT_PERMISSION_REQUIRED"
  | "CREATOR_ROLE_REQUIRED"
  | "CREATOR_PROFILE_NOT_FOUND"
  | "CREATOR_PROFILE_ALREADY_LINKED"
  | "CREATOR_NAME_NEEDS_LINK"
  | "CREATOR_NAME_INVALID"
  | "CREATOR_ACCOUNT_CONFLICT";

export class CreatorAccountError extends Error {
  constructor(readonly code: CreatorAccountErrorCode, message: string) {
    super(message);
    this.name = "CreatorAccountError";
  }
}

const profileSelect = { id: true, name: true, creatorUserId: true } as const;

/** Called inside the same transaction as the role change/invitation. Ownership
 * is distinct from staff assignments: never claim an existing creator by name. */
export async function ensureCreatorAccount(
  tx: Prisma.TransactionClient,
  user: { id: string; name: string },
  roles: { systemKey: string | null }[],
  selectedModelId: string | null | undefined,
  access: AccessContext,
) {
  const selectedId = selectedModelId?.trim() || null;
  const hasCreatorRole = roles.some((role) => role.systemKey === "MODEL");
  if (!hasCreatorRole) {
    if (selectedId) {
      throw new CreatorAccountError("CREATOR_ROLE_REQUIRED", "Assign the Creator role before linking a creator profile.");
    }
    // Removing a role must not erase a creator's staff or historical records.
    return null;
  }
  if (!isOwner(access)) {
    throw new CreatorAccountError("CREATOR_ACCOUNT_OWNER_REQUIRED", "Only an Owner can connect a creator account.");
  }

  const current = await tx.agencyModel.findUnique({
    where: { creatorUserId: user.id }, select: profileSelect,
  });
  if (current) {
    if (selectedId && current.id !== selectedId) {
      throw new CreatorAccountError("CREATOR_PROFILE_ALREADY_LINKED", "This account is already connected to a different creator. Its existing profile has been kept.");
    }
    return current;
  }

  try {
    if (selectedId) {
      if (!hasPermission(access, "models.edit")) {
        throw new CreatorAccountError("CREATOR_ACCOUNT_PERMISSION_REQUIRED", "You need Edit Creators permission to connect an existing creator profile.");
      }
      const selected = await tx.agencyModel.findUnique({ where: { id: selectedId }, select: profileSelect });
      if (!selected) {
        throw new CreatorAccountError("CREATOR_PROFILE_NOT_FOUND", "The selected creator profile no longer exists.");
      }
      if (selected.creatorUserId) {
        throw new CreatorAccountError("CREATOR_PROFILE_ALREADY_LINKED", "That creator profile is already connected to another account.");
      }
      // The conditional claim prevents concurrent requests from replacing an owner.
      const claim = await tx.agencyModel.updateMany({
        where: { id: selected.id, creatorUserId: null },
        data: { creatorUserId: user.id },
      });
      if (claim.count !== 1) {
        throw new CreatorAccountError("CREATOR_ACCOUNT_CONFLICT", "That creator profile was connected by another request. Refresh and try again.");
      }
      return { ...selected, creatorUserId: user.id };
    }

    if (!hasPermission(access, "models.create")) {
      throw new CreatorAccountError("CREATOR_ACCOUNT_PERMISSION_REQUIRED", "You need Create Creators permission to create this account's creator profile.");
    }
    const name = user.name.trim();
    if (!name || name.length > 120) {
      throw new CreatorAccountError("CREATOR_NAME_INVALID", "Use an account name between 1 and 120 characters for the creator profile.");
    }
    const conflict = await tx.agencyModel.findFirst({
      where: { name: { equals: name, mode: "insensitive" } }, select: { id: true },
    });
    if (conflict) {
      throw new CreatorAccountError("CREATOR_NAME_NEEDS_LINK", "A creator with this name already exists. Select the existing creator profile to connect it, or use a different account name.");
    }
    return await tx.agencyModel.create({
      data: { name, creatorUserId: user.id }, select: profileSelect,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new CreatorAccountError("CREATOR_ACCOUNT_CONFLICT", "The creator name or account was connected by another request. Refresh and select the existing profile.");
    }
    throw error;
  }
}
