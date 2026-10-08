import {
  API_BASE_URL,
} from "./api";

const MAX_SOURCE_BYTES =
  5 * 1024 * 1024;

const TARGET_SIZE =
  512;

const ALLOWED_SOURCE_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

export function getCurrentUserAvatarUrl(
  avatarUpdatedAt:
    string |
    null |
    undefined
) {
  if (!avatarUpdatedAt) {
    return null;
  }

  return `${API_BASE_URL}/api/auth/avatar?v=${encodeURIComponent(
    avatarUpdatedAt
  )}`;
}

export function getPersonAvatarUrl(
  userId:
    string,
  avatarUpdatedAt:
    string |
    null |
    undefined
) {
  if (
    !userId ||
    !avatarUpdatedAt
  ) {
    return null;
  }

  return `${API_BASE_URL}/api/people/${encodeURIComponent(
    userId
  )}/avatar?v=${encodeURIComponent(
    avatarUpdatedAt
  )}`;
}

export async function prepareProfileAvatar(
  file:
    File
): Promise<Blob> {
  if (
    !ALLOWED_SOURCE_TYPES.has(
      file.type
    )
  ) {
    throw new Error(
      "Choose a JPEG, PNG, or WebP image."
    );
  }

  if (
    file.size >
    MAX_SOURCE_BYTES
  ) {
    throw new Error(
      "Profile pictures must be 5 MB or smaller."
    );
  }

  let bitmap:
    ImageBitmap;

  try {
    bitmap =
      await createImageBitmap(
        file
      );
  } catch {
    throw new Error(
      "The selected file could not be read as an image."
    );
  }

  try {
    if (
      bitmap.width <
        1 ||
      bitmap.height <
        1
    ) {
      throw new Error(
        "The selected image is invalid."
      );
    }

    const canvas =
      document.createElement(
        "canvas"
      );

    canvas.width =
      TARGET_SIZE;

    canvas.height =
      TARGET_SIZE;

    const context =
      canvas.getContext(
        "2d"
      );

    if (!context) {
      throw new Error(
        "This browser could not prepare the profile picture."
      );
    }

    const cropSize =
      Math.min(
        bitmap.width,
        bitmap.height
      );

    const sourceX =
      (
        bitmap.width -
        cropSize
      ) /
      2;

    const sourceY =
      (
        bitmap.height -
        cropSize
      ) /
      2;

    context.drawImage(
      bitmap,
      sourceX,
      sourceY,
      cropSize,
      cropSize,
      0,
      0,
      TARGET_SIZE,
      TARGET_SIZE
    );

    const blob =
      await new Promise<
        Blob | null
      >(
        (
          resolve
        ) => {
          canvas.toBlob(
            resolve,
            "image/webp",
            0.86
          );
        }
      );

    if (!blob) {
      throw new Error(
        "This browser could not prepare the profile picture."
      );
    }

    return blob;
  } finally {
    bitmap.close();
  }
}
