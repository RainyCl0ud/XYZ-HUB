import nodemailer from "nodemailer";

import {
  JWT,
} from "google-auth-library";

export type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

const GMAIL_SEND_SCOPE =
  "https://www.googleapis.com/auth/gmail.send";

function requiredEnv(
  key: string
): string {
  const value =
    process.env[key]?.trim();

  if (!value) {
    throw new Error(
      `${key} is not configured.`
    );
  }

  return value;
}

function normalizePrivateKey(
  value: string
): string {
  return value.replace(
    /\\n/g,
    "\n"
  );
}

function encodeBase64Url(
  value: Buffer
): string {
  return value
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function assertSafeHeaderValue(
  value: string,
  name: string
): void {
  if (
    value.includes("\r") ||
    value.includes("\n")
  ) {
    throw new Error(
      `${name} contains invalid characters.`
    );
  }
}

async function createRawMessage(
  email: TransactionalEmail,
  from: string
): Promise<string> {
  assertSafeHeaderValue(
    from,
    "EMAIL_FROM"
  );

  assertSafeHeaderValue(
    email.to,
    "Recipient"
  );

  assertSafeHeaderValue(
    email.subject,
    "Subject"
  );

  /*
   * Nodemailer is only used here to construct
   * a standards-compliant MIME message.
   *
   * It does not connect to an SMTP server.
   */
  const transport =
    nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: "windows",
    });

  const result =
    await transport.sendMail({
      from,
      to:
        email.to,
      subject:
        email.subject,
      text:
        email.text,
      html:
        email.html,

      disableFileAccess:
        true,
      disableUrlAccess:
        true,
    });

  const message =
    Buffer.isBuffer(
      result.message
    )
      ? result.message
      : Buffer.from(
          String(
            result.message
          ),
          "utf8"
        );

  return encodeBase64Url(
    message
  );
}

async function getGmailAccessToken(): Promise<string> {
  const serviceAccountEmail =
    requiredEnv(
      "GOOGLE_SERVICE_ACCOUNT_EMAIL"
    );

  const privateKey =
    normalizePrivateKey(
      requiredEnv(
        "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"
      )
    );

  const workspaceUser =
    requiredEnv(
      "GOOGLE_WORKSPACE_USER"
    );

  const client =
    new JWT({
      email:
        serviceAccountEmail,

      key:
        privateKey,

      scopes: [
        GMAIL_SEND_SCOPE,
      ],

      subject:
        workspaceUser,
    });

  const tokenResult =
    await client.getAccessToken();

  const token =
    typeof tokenResult ===
    "string"
      ? tokenResult
      : tokenResult?.token;

  if (!token) {
    throw new Error(
      "Google Workspace access token could not be created."
    );
  }

  return token;
}

async function sendWithGmailApi(
  email: TransactionalEmail
): Promise<void> {
  const from =
    requiredEnv(
      "EMAIL_FROM"
    );

  const raw =
    await createRawMessage(
      email,
      from
    );

  const accessToken =
    await getGmailAccessToken();

  const response =
    await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method:
          "POST",

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            raw,
          }),
      }
    );

  if (!response.ok) {
    const responseText =
      await response.text();

    throw new Error(
      `Gmail API rejected the message (${response.status}): ${responseText.slice(
        0,
        500
      )}`
    );
  }
}

export function getEmailDeliveryMode(
  specificVariable: string
): string {
  return (
    process.env[
      specificVariable
    ]?.trim() ||
    process.env
      .EMAIL_DELIVERY_MODE
      ?.trim() ||
    ""
  ).toLowerCase();
}

export function escapeEmailHtml(
  value: string
): string {
  return value
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#39;"
    );
}

export function formatEmailExpiry(
  value: Date
): string {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        "America/Chicago",

      month:
        "short",

      day:
        "numeric",

      year:
        "numeric",

      hour:
        "numeric",

      minute:
        "2-digit",

      timeZoneName:
        "short",
    }
  ).format(
    value
  );
}

export async function sendTransactionalEmail(
  email: TransactionalEmail
): Promise<void> {
  await sendWithGmailApi(
    email
  );
}