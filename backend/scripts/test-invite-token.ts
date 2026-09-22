/// <reference types="node" />

import assert from "node:assert/strict";

import {
  generateInviteToken,
  hashInviteToken,
} from "../src/services/invite-token.js";

function runTests() {
  console.log(
    "Starting invite-token tests..."
  );

  const token =
    generateInviteToken();

  const hash =
    hashInviteToken(
      token
    );

  assert.ok(
    token.length > 30
  );

  console.log(
    "✓ secure invite token generated"
  );

  assert.notEqual(
    token,
    hash
  );

  console.log(
    "✓ raw invite token differs from stored hash"
  );

  assert.equal(
    hashInviteToken(
      token
    ),
    hash
  );

  console.log(
    "✓ same invite token produces same hash"
  );

  const secondToken =
    generateInviteToken();

  assert.notEqual(
    token,
    secondToken
  );

  console.log(
    "✓ invite tokens are unique"
  );

  assert.notEqual(
    hashInviteToken(
      secondToken
    ),
    hash
  );

  console.log(
    "✓ different invite tokens produce different hashes"
  );

  console.log("");

  console.log(
    "All invite-token tests passed."
  );
}

runTests();