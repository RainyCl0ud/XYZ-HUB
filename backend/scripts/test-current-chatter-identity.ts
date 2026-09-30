/// <reference types="node" />

import assert from "node:assert/strict";

import {
  rewriteCurrentChatterNames,
} from "../src/middleware/current-chatter-identity.js";

function main() {
  console.log(
    "Starting current chatter identity presentation tests..."
  );

  const occurredAt =
    new Date(
      "2026-09-25T08:40:00.000Z"
    );

  const payload = {
    data: [
      {
        id: "chatter-a",
        name: "Legacy QA Name",
        createdAt:
          occurredAt,
        incidents: [
          {
            id: "incident-a",
            chatter: {
              id: "chatter-a",
              name: "Legacy QA Name",
            },
            occurredAt,
          },
        ],
      },
    ],
  };

  const rewritten =
    rewriteCurrentChatterNames(
      payload,
      new Map([
        [
          "chatter-a",
          "Arthur Morgan",
        ],
      ])
    ) as typeof payload;

  assert.equal(
    rewritten.data[0].name,
    "Arthur Morgan"
  );

  assert.equal(
    rewritten.data[0]
      .incidents[0]
      .chatter.name,
    "Arthur Morgan"
  );

  assert.equal(
    rewritten.data[0].createdAt,
    occurredAt
  );

  assert.equal(
    rewritten.data[0]
      .incidents[0]
      .occurredAt,
    occurredAt
  );

  assert.ok(
    rewritten.data[0].createdAt instanceof
      Date
  );

  console.log(
    "✓ linked chatter names are rewritten while native Date values remain intact"
  );

  const unlinked =
    rewriteCurrentChatterNames(
      {
        id: "chatter-b",
        name: "Standalone QA Chatter",
        createdAt:
          occurredAt,
      },
      new Map()
    ) as {
      id: string;
      name: string;
      createdAt: Date;
    };

  assert.equal(
    unlinked.name,
    "Standalone QA Chatter"
  );

  assert.equal(
    unlinked.createdAt,
    occurredAt
  );

  console.log(
    "✓ unlinked chatter identity and Date values remain unchanged"
  );

  console.log("");
  console.log(
    "All current chatter identity presentation tests passed."
  );
}

main();
