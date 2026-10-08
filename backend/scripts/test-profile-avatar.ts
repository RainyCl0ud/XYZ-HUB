import {
  PROFILE_AVATAR_MAX_BYTES,
  PROFILE_AVATAR_SIZE,
  ProfileAvatarError,
  validateProfileAvatar,
} from "../src/services/profile-avatar.js";

function assert(
  condition:
    unknown,
  message:
    string
) {
  if (!condition) {
    throw new Error(
      message
    );
  }
}

function makeVp8Webp(
  width:
    number,
  height:
    number
) {
  const payload =
    Buffer.alloc(
      12
    );

  payload[3] =
    0x9d;
  payload[4] =
    0x01;
  payload[5] =
    0x2a;

  payload.writeUInt16LE(
    width,
    6
  );

  payload.writeUInt16LE(
    height,
    8
  );

  const buffer =
    Buffer.alloc(
      12 +
      8 +
      payload.length
    );

  buffer.write(
    "RIFF",
    0,
    "ascii"
  );

  buffer.writeUInt32LE(
    buffer.length -
      8,
    4
  );

  buffer.write(
    "WEBP",
    8,
    "ascii"
  );

  buffer.write(
    "VP8 ",
    12,
    "ascii"
  );

  buffer.writeUInt32LE(
    payload.length,
    16
  );

  payload.copy(
    buffer,
    20
  );

  return buffer;
}

function expectAvatarError(
  callback:
    () => void,
  code:
    ProfileAvatarError["code"]
) {
  try {
    callback();
  } catch (error) {
    assert(
      error instanceof
        ProfileAvatarError,
      "Expected ProfileAvatarError."
    );

    if (
      error instanceof
      ProfileAvatarError
    ) {
      assert(
        error.code ===
          code,
        `Expected ${code}, received ${error.code}.`
      );
    }

    return;
  }

  throw new Error(
    `Expected ${code} to be thrown.`
  );
}

const valid =
  makeVp8Webp(
    PROFILE_AVATAR_SIZE,
    PROFILE_AVATAR_SIZE
  );

assert(
  validateProfileAvatar(
    valid,
    "image/webp"
  ) ===
    valid,
  "Valid 512x512 WebP should pass."
);

expectAvatarError(
  () =>
    validateProfileAvatar(
      valid,
      "image/png"
    ),
  "INVALID_AVATAR_TYPE"
);

expectAvatarError(
  () =>
    validateProfileAvatar(
      makeVp8Webp(
        500,
        512
      ),
      "image/webp"
    ),
  "INVALID_AVATAR_IMAGE"
);

expectAvatarError(
  () =>
    validateProfileAvatar(
      Buffer.alloc(
        PROFILE_AVATAR_MAX_BYTES +
          1
      ),
      "image/webp"
    ),
  "AVATAR_TOO_LARGE"
);

const malformed =
  Buffer.from(
    valid
  );

malformed.writeUInt32LE(
  malformed.length,
  4
);

expectAvatarError(
  () =>
    validateProfileAvatar(
      malformed,
      "image/webp"
    ),
  "INVALID_AVATAR_IMAGE"
);

console.log(
  "Profile avatar validation tests passed."
);
