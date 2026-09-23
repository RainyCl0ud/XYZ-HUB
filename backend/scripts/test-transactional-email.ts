/// <reference types="node" />

import "dotenv/config";

import assert from "node:assert/strict";

import {
  sendTransactionalEmail,
} from "../src/services/transactional-email.js";

type FetchCall = {
  url: string;
  init?: RequestInit;
};

async function main() {
  console.log(
    "Starting transactional-email tests..."
  );

  const originalFetch =
    globalThis.fetch;

  const originalProvider =
    process.env.EMAIL_PROVIDER;

  const originalApiKey =
    process.env.RESEND_API_KEY;

  const originalFrom =
    process.env.EMAIL_FROM;

  try {
    process.env.EMAIL_PROVIDER =
      "resend";

    process.env.RESEND_API_KEY =
      "re_test_secret";

    process.env.EMAIL_FROM =
      "XYZ Hub <no-reply@example.com>";

    const calls:
      FetchCall[] = [];

    globalThis.fetch =
      async (
        input:
          string | URL | Request,
        init?:
          RequestInit
      ) => {
        calls.push({
          url:
            String(input),
          init,
        });

        return new Response(
          JSON.stringify({
            id:
              "email_test_123",
          }),
          {
            status: 200,
            headers: {
              "Content-Type":
                "application/json",
            },
          }
        );
      };

    await sendTransactionalEmail({
      to:
        "person@example.com",
      subject:
        "Test subject",
      text:
        "Plain text",
      html:
        "<p>Plain text</p>",
      tag:
        "login_2fa",
    });

    assert.equal(
      calls.length,
      1
    );

    assert.equal(
      calls[0]?.url,
      "https://api.resend.com/emails"
    );

    const headers =
      calls[0]?.init
        ?.headers as Record<
          string,
          string
        >;

    assert.equal(
      headers.Authorization,
      "Bearer re_test_secret"
    );

    const body =
      JSON.parse(
        String(
          calls[0]?.init
            ?.body
        )
      );

    assert.equal(
      body.from,
      "XYZ Hub <no-reply@example.com>"
    );

    assert.deepEqual(
      body.to,
      [
        "person@example.com",
      ]
    );

    assert.equal(
      body.tags[0].value,
      "login_2fa"
    );

    console.log(
      "✓ Resend request is constructed correctly"
    );

    globalThis.fetch =
      async () =>
        new Response(
          JSON.stringify({
            message:
              "provider failure",
          }),
          {
            status: 422,
          }
        );

    await assert.rejects(
      () =>
        sendTransactionalEmail({
          to:
            "person@example.com",
          subject:
            "Test",
          text:
            "Test",
          html:
            "<p>Test</p>",
        }),
      /provider rejected/
    );

    console.log(
      "✓ provider failures are surfaced"
    );

    delete process.env
      .RESEND_API_KEY;

    await assert.rejects(
      () =>
        sendTransactionalEmail({
          to:
            "person@example.com",
          subject:
            "Test",
          text:
            "Test",
          html:
            "<p>Test</p>",
        }),
      /RESEND_API_KEY is not configured/
    );

    console.log(
      "✓ missing provider secrets fail closed"
    );

    process.env.EMAIL_PROVIDER =
      "unsupported";

    await assert.rejects(
      () =>
        sendTransactionalEmail({
          to:
            "person@example.com",
          subject:
            "Test",
          text:
            "Test",
          html:
            "<p>Test</p>",
        }),
      /provider is not configured/
    );

    console.log(
      "✓ unsupported provider fails closed"
    );

    console.log("");
    console.log(
      "All transactional-email tests passed."
    );
  } finally {
    globalThis.fetch =
      originalFetch;

    if (
      originalProvider ===
      undefined
    ) {
      delete process.env
        .EMAIL_PROVIDER;
    } else {
      process.env.EMAIL_PROVIDER =
        originalProvider;
    }

    if (
      originalApiKey ===
      undefined
    ) {
      delete process.env
        .RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY =
        originalApiKey;
    }

    if (
      originalFrom ===
      undefined
    ) {
      delete process.env
        .EMAIL_FROM;
    } else {
      process.env.EMAIL_FROM =
        originalFrom;
    }
  }
}

main().catch(
  (
    error
  ) => {
    console.error(
      "Transactional-email tests failed:",
      error
    );

    process.exit(1);
  }
);
