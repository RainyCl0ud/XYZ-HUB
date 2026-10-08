-- Add optional profile-picture storage to Login Gate users.
-- Existing accounts remain unchanged and continue to fall back to initials.
ALTER TABLE "User"
ADD COLUMN "avatarImage" BYTEA,
ADD COLUMN "avatarMimeType" TEXT,
ADD COLUMN "avatarUpdatedAt" TIMESTAMP(3);
