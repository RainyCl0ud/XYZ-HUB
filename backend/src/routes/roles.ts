import {
  RoleDataScope,
} from "@prisma/client";

import {
  Router,
} from "express";

import type {
  Response,
} from "express";

import {
  z,
} from "zod";

import {
  type AuthenticatedRequest,
  requireAuth,
  requireOwner,
  requirePermission,
} from "../middleware/access.js";

import {
  archiveRole,
  createRole,
  getRoleBuilderData,
  reactivateRole,
  RoleManagementError,
  updateRole,
} from "../services/role-management.js";

const router =
  Router();

const roleInputSchema =
  z.object({
    name:
      z
        .string()
        .trim()
        .min(1)
        .max(120),

    description:
      z
        .string()
        .trim()
        .max(500)
        .nullable()
        .optional(),

    rank:
      z
        .number()
        .int()
        .min(1)
        .max(999)
        .nullable(),

    dataScope:
      z.nativeEnum(
        RoleDataScope
      ),

    permissionIds:
      z
        .array(
          z
            .string()
            .min(1)
        )
        .default([]),
  });

function getParam(
  value:
    string |
    string[] |
    undefined
) {
  return Array.isArray(
    value
  )
    ? value[0]
    : value;
}

function handleRoleError(
  error:
    unknown,
  res:
    Response
) {
  if (
    !(error instanceof
      RoleManagementError)
  ) {
    return false;
  }

  switch (
    error.code
  ) {
    case "ROLE_MANAGEMENT_REQUIRED":
    case "OWNER_REQUIRED":
      res.status(403).json({
        error:
          error.code,

        message:
          error.message,
      });

      return true;

    case "ROLE_NOT_FOUND":
      res.status(404).json({
        error:
          error.code,

        message:
          error.message,
      });

      return true;

    case "ROLE_NAME_IN_USE":
    case "OWNER_ROLE_IMMUTABLE":
    case "SYSTEM_ROLE_ARCHIVE_FORBIDDEN":
    case "ROLE_ARCHIVED":
    case "ROLE_NOT_ARCHIVED":
      res.status(409).json({
        error:
          error.code,

        message:
          error.message,
      });

      return true;

    case "INVALID_ROLE_RANK":
    case "INVALID_PERMISSIONS":
      res.status(400).json({
        error:
          error.code,

        message:
          error.message,
      });

      return true;
  }
}

const roleReadGuards = [
  requireAuth,

  requirePermission(
    "roles.access"
  ),
] as const;


const roleWriteGuards = [
  requireAuth,

  requirePermission(
    "roles.manage"
  ),
] as const;

router.get(
  "/",

  ...roleReadGuards,

  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    if (!req.access) {
      res.status(401).json({
        error:
          "UNAUTHENTICATED",
      });

      return;
    }

    try {
      const data =
        await getRoleBuilderData(
          req.access
        );

      res.status(200).json(
        data
      );
    } catch (
      error
    ) {
      if (
        handleRoleError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Load Role Builder request failed:",
        error
      );

      res.status(500).json({
        error:
          "LOAD_ROLES_FAILED",

        message:
          "Unable to load Role Builder data.",
      });
    }
  }
);

router.post(
  "/",

  ...roleWriteGuards,

  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    if (!req.access) {
      res.status(401).json({
        error:
          "UNAUTHENTICATED",
      });

      return;
    }

    const parsed =
      roleInputSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      res.status(400).json({
        error:
          "INVALID_REQUEST",

        message:
          "A valid role name, rank, data scope and permission list are required.",
      });

      return;
    }

    try {
      const role =
        await createRole(
          parsed.data,
          req.access
        );

      res.status(201).json({
        status:
          "ROLE_CREATED",

        role,
      });
    } catch (
      error
    ) {
      if (
        handleRoleError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Create role request failed:",
        error
      );

      res.status(500).json({
        error:
          "CREATE_ROLE_FAILED",

        message:
          "Unable to create the role.",
      });
    }
  }
);

router.put(
  "/:roleId",

  ...roleWriteGuards,

  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    if (!req.access) {
      res.status(401).json({
        error:
          "UNAUTHENTICATED",
      });

      return;
    }

    const roleId =
      getParam(
        req.params.roleId
      );

    if (!roleId) {
      res.status(400).json({
        error:
          "INVALID_ROLE_ID",
      });

      return;
    }

    const parsed =
      roleInputSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      res.status(400).json({
        error:
          "INVALID_REQUEST",

        message:
          "A valid role name, rank, data scope and permission list are required.",
      });

      return;
    }

    try {
      const role =
        await updateRole(
          roleId,
          parsed.data,
          req.access
        );

      res.status(200).json({
        status:
          "ROLE_UPDATED",

        role,
      });
    } catch (
      error
    ) {
      if (
        handleRoleError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Update role request failed:",
        error
      );

      res.status(500).json({
        error:
          "UPDATE_ROLE_FAILED",

        message:
          "Unable to update the role.",
      });
    }
  }
);

router.post(
  "/:roleId/archive",

  requireAuth,
  requireOwner,

  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    if (!req.access) {
      res.status(401).json({
        error:
          "UNAUTHENTICATED",
      });

      return;
    }

    const roleId =
      getParam(
        req.params.roleId
      );

    if (!roleId) {
      res.status(400).json({
        error:
          "INVALID_ROLE_ID",
      });

      return;
    }

    try {
      const role =
        await archiveRole(
          roleId,
          req.access
        );

      res.status(200).json({
        status:
          "ROLE_ARCHIVED",

        role,
      });
    } catch (
      error
    ) {
      if (
        handleRoleError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Archive role request failed:",
        error
      );

      res.status(500).json({
        error:
          "ARCHIVE_ROLE_FAILED",

        message:
          "Unable to archive the role.",
      });
    }
  }
);

router.post(
  "/:roleId/reactivate",

  requireAuth,
  requireOwner,

  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    if (!req.access) {
      res.status(401).json({
        error:
          "UNAUTHENTICATED",
      });

      return;
    }

    const roleId =
      getParam(
        req.params.roleId
      );

    if (!roleId) {
      res.status(400).json({
        error:
          "INVALID_ROLE_ID",
      });

      return;
    }

    try {
      const role =
        await reactivateRole(
          roleId,
          req.access
        );

      res.status(200).json({
        status:
          "ROLE_REACTIVATED",

        role,
      });
    } catch (
      error
    ) {
      if (
        handleRoleError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Reactivate role request failed:",
        error
      );

      res.status(500).json({
        error:
          "REACTIVATE_ROLE_FAILED",

        message:
          "Unable to reactivate the role.",
      });
    }
  }
);

export default router;
