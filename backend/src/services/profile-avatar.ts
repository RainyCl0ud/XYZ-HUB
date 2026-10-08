import {
  prisma,
} from "../lib/prisma.js";

export const PROFILE_AVATAR_MIME_TYPE =
  "image/webp";

export const PROFILE_AVATAR_SIZE =
  512;

export const PROFILE_AVATAR_MAX_BYTES =
  512 * 1024;

export type ProfileAvatarErrorCode =
  | "INVALID_AVATAR_TYPE"
  | "INVALID_AVATAR_IMAGE"
  | "AVATAR_TOO_LARGE";

export class ProfileAvatarError extends Error {
  code:
    ProfileAvatarErrorCode;

  constructor(
    code:
      ProfileAvatarErrorCode,
    message:
      string
  ) {
    super(
      message
    );

    this.name =
      "ProfileAvatarError";

    this.code =
      code;
  }
}

function readUInt24LE(
  buffer:
    Buffer,
  offset:
    number
) {
  return (
    buffer[offset] |
    (
      buffer[offset + 1] <<
      8
    ) |
    (
      buffer[offset + 2] <<
      16
    )
  );
}

function readWebpDimensions(
  buffer:
    Buffer
):
  | {
      width: number;
      height: number;
    }
  | null {
  if (
    buffer.length <
      30 ||
    buffer
      .subarray(
        0,
        4
      )
      .toString(
        "ascii"
      ) !==
      "RIFF" ||
    buffer
      .subarray(
        8,
        12
      )
      .toString(
        "ascii"
      ) !==
      "WEBP"
  ) {
    return null;
  }

  const declaredRiffSize =
    buffer.readUInt32LE(
      4
    );

  if (
    declaredRiffSize +
      8 !==
    buffer.length
  ) {
    return null;
  }

  let canvasDimensions:
    | {
        width: number;
        height: number;
      }
    | null =
    null;

  let offset =
    12;

  while (
    offset + 8 <=
    buffer.length
  ) {
    const type =
      buffer
        .subarray(
          offset,
          offset + 4
        )
        .toString(
          "ascii"
        );

    const chunkSize =
      buffer.readUInt32LE(
        offset + 4
      );

    const dataStart =
      offset + 8;

    const dataEnd =
      dataStart +
      chunkSize;

    if (
      dataEnd >
      buffer.length
    ) {
      return null;
    }

    if (
      type ===
        "VP8X" &&
      chunkSize >=
        10
    ) {
      canvasDimensions =
        {
          width:
            readUInt24LE(
              buffer,
              dataStart + 4
            ) + 1,

          height:
            readUInt24LE(
              buffer,
              dataStart + 7
            ) + 1,
        };
    }

    if (
      type ===
        "VP8 " &&
      chunkSize >=
        10
    ) {
      if (
        buffer[dataStart + 3] !==
          0x9d ||
        buffer[dataStart + 4] !==
          0x01 ||
        buffer[dataStart + 5] !==
          0x2a
      ) {
        return null;
      }

      const dimensions =
        {
          width:
            buffer.readUInt16LE(
              dataStart + 6
            ) &
            0x3fff,

          height:
            buffer.readUInt16LE(
              dataStart + 8
            ) &
            0x3fff,
        };

      if (
        canvasDimensions &&
        (
          canvasDimensions.width !==
            dimensions.width ||
          canvasDimensions.height !==
            dimensions.height
        )
      ) {
        return null;
      }

      return dimensions;
    }

    if (
      type ===
        "VP8L" &&
      chunkSize >=
        5
    ) {
      if (
        buffer[dataStart] !==
        0x2f
      ) {
        return null;
      }

      const bits =
        buffer.readUInt32LE(
          dataStart + 1
        );

      const dimensions =
        {
          width:
            (
              bits &
              0x3fff
            ) + 1,

          height:
            (
              (
                bits >>>
                14
              ) &
              0x3fff
            ) + 1,
        };

      if (
        canvasDimensions &&
        (
          canvasDimensions.width !==
            dimensions.width ||
          canvasDimensions.height !==
            dimensions.height
        )
      ) {
        return null;
      }

      return dimensions;
    }

    offset =
      dataEnd +
      (
        chunkSize %
        2
      );
  }

  return null;
}

export function validateProfileAvatar(
  body:
    unknown,
  contentType:
    string | undefined
): Buffer {
  if (
    !contentType
      ?.toLowerCase()
      .startsWith(
        PROFILE_AVATAR_MIME_TYPE
      )
  ) {
    throw new ProfileAvatarError(
      "INVALID_AVATAR_TYPE",
      "Profile pictures must be uploaded as a WebP image."
    );
  }

  if (
    !Buffer.isBuffer(
      body
    ) ||
    body.length ===
      0
  ) {
    throw new ProfileAvatarError(
      "INVALID_AVATAR_IMAGE",
      "The uploaded profile picture is invalid."
    );
  }

  if (
    body.length >
    PROFILE_AVATAR_MAX_BYTES
  ) {
    throw new ProfileAvatarError(
      "AVATAR_TOO_LARGE",
      "The processed profile picture is too large."
    );
  }

  const dimensions =
    readWebpDimensions(
      body
    );

  if (
    !dimensions ||
    dimensions.width !==
      PROFILE_AVATAR_SIZE ||
    dimensions.height !==
      PROFILE_AVATAR_SIZE
  ) {
    throw new ProfileAvatarError(
      "INVALID_AVATAR_IMAGE",
      `Profile pictures must be ${PROFILE_AVATAR_SIZE} × ${PROFILE_AVATAR_SIZE} pixels.`
    );
  }

  return body;
}

export async function saveProfileAvatar(
  userId:
    string,
  image:
    Buffer
) {
  const now =
    new Date();

  return prisma.user.update({
    where: {
      id:
        userId,
    },

    data: {
      avatarImage:
        image,

      avatarMimeType:
        PROFILE_AVATAR_MIME_TYPE,

      avatarUpdatedAt:
        now,
    },

    select: {
      avatarUpdatedAt:
        true,
    },
  });
}

export async function removeProfileAvatar(
  userId:
    string
) {
  await prisma.user.update({
    where: {
      id:
        userId,
    },

    data: {
      avatarImage:
        null,

      avatarMimeType:
        null,

      avatarUpdatedAt:
        null,
    },
  });
}

export async function getProfileAvatar(
  userId:
    string
) {
  return prisma.user.findUnique({
    where: {
      id:
        userId,
    },

    select: {
      avatarImage:
        true,

      avatarMimeType:
        true,

      avatarUpdatedAt:
        true,
    },
  });
}
