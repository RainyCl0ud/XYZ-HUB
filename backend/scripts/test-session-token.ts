/// <reference types="node" />

import assert from "node:assert/strict";

import {
  generateSessionToken,
  hashSessionToken,
} from "../src/services/session-token.js";

function runTests() {
  console.log(
    "Starting session-token tests..."
  );

  const token =
    generateSessionToken();

  const hash =
    hashSessionToken(token);

  assert.ok(token.length > 30);

  console.log(
    "✓ secure session token generated"
  );

  assert.notEqual(
    token,
    hash
  );

  console.log(
    "✓ raw token differs from stored hash"
  );

  assert.equal(
    hashSessionToken(token),
    hash
  );

  console.log(
    "✓ same token produces same hash"
  );

  const secondToken =
    generateSessionToken();

  assert.notEqual(
    token,
    secondToken
  );

  console.log(
    "✓ generated tokens are unique"
  );

  assert.notEqual(
    hashSessionToken(
      secondToken
    ),
    hash
  );

  console.log(
    "✓ different tokens produce different hashes"
  );

  console.log("");

  console.log(
    "All session-token tests passed."
  );
}

runTests();