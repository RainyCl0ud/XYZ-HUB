/// <reference types="node" />

import assert from "node:assert/strict";

import {
  hashPassword,
  verifyPassword,
} from "../src/services/password.js";

async function runTests() {
  console.log(
    "Starting password tests..."
  );

  const password =
    "Example-Test-Password-123!";

  const hash =
    await hashPassword(
      password
    );

  assert.equal(
    hash.startsWith(
      "scrypt-v1$"
    ),
    true
  );

  assert.notEqual(
    hash,
    password
  );

  console.log(
    "✓ password is hashed"
  );

  assert.equal(
    await verifyPassword(
      password,
      hash
    ),
    true
  );

  console.log(
    "✓ correct password verifies"
  );

  assert.equal(
    await verifyPassword(
      "WrongPassword",
      hash
    ),
    false
  );

  console.log(
    "✓ incorrect password is rejected"
  );

  const secondHash =
    await hashPassword(
      password
    );

  assert.notEqual(
    hash,
    secondHash
  );

  console.log(
    "✓ identical passwords use different salts"
  );

  assert.equal(
    await verifyPassword(
      password,
      "invalid-hash"
    ),
    false
  );

  console.log(
    "✓ malformed hashes are rejected safely"
  );

  console.log("");

  console.log(
    "All password tests passed."
  );
}

runTests()
  .catch((error) => {
    console.error(
      "Password test failed:",
      error
    );

    process.exit(1);
  });