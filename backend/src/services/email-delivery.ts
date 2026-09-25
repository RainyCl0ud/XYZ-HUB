import nodemailer from "nodemailer";

export type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

let cachedTransporter:
  ReturnType<
    typeof nodemailer.createTransport
  > |
  null =
  null;

function requiredEnv(
  key:
    string
) {
  const value =
    process.env[
      key
    ]?.trim();

  if (
    !value
  ) {
    throw new Error(
      `${key} is not configured.`
    );
  }

  return value;
}

function getSmtpPort() {
  const raw =
    process.env.SMTP_PORT
      ?.trim() ??
    "587";

  const port =
    Number(
      raw
    );

  if (
    !Number.isInteger(
      port
    ) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error(
      "SMTP_PORT must be a valid TCP port."
    );
  }

  return port;
}

function getTransporter() {
  if (
    cachedTransporter
  ) {
    return cachedTransporter;
  }

  const host =
    requiredEnv(
      "SMTP_HOST"
    );

  const port =
    getSmtpPort();

  const secure =
    process.env.SMTP_SECURE ===
    "true";

  const user =
    process.env.SMTP_USER
      ?.trim();

  const pass =
    process.env.SMTP_PASSWORD;

  if (
    Boolean(
      user
    ) !==
    Boolean(
      pass
    )
  ) {
    throw new Error(
      "SMTP_USER and SMTP_PASSWORD must either both be configured or both be omitted."
    );
  }

  cachedTransporter =
    nodemailer.createTransport({
      host,
      port,
      secure,

      requireTLS:
        !secure,

      tls: {
        minVersion:
          "TLSv1.2",
      },

      ...(user &&
      pass
        ? {
            auth: {
              user,
              pass,
            },
          }
        : {}),
    });

  return cachedTransporter;
}

export function getEmailDeliveryMode(
  specificVariable:
    string
) {
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
  value:
    string
) {
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
  value:
    Date
) {
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
  email:
    TransactionalEmail
) {
  const from =
    requiredEnv(
      "SMTP_FROM"
    );

  const transporter =
    getTransporter();

  await transporter.sendMail({
    from,
    to:
      email.to,
    subject:
      email.subject,
    text:
      email.text,
    html:
      email.html,

    /*
     * XYZ Hub generates all message content itself.
     * These guards prevent future template changes
     * from accidentally reading files or remote URLs
     * through Nodemailer content nodes.
     */
    disableFileAccess:
      true,
    disableUrlAccess:
      true,
  });
}
