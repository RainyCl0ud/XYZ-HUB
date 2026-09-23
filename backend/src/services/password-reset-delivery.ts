import {
  renderEmailTemplate,
} from "./email-template.js";

import {
  sendTransactionalEmail,
} from "./transactional-email.js";

export type PasswordResetDeliveryInput = {
  name: string;
  email: string;
  token: string;
  expiresAt: Date;
};

function getFrontendUrl(): string {
  const frontendUrl =
    process.env.FRONTEND_URL?.trim();

  if (!frontendUrl) {
    throw new Error(
      "FRONTEND_URL is not configured."
    );
  }

  return frontendUrl.replace(
    /\/+$/,
    ""
  );
}

function getResetUrl(
  token: string
): string {
  return (
    `${getFrontendUrl()}/reset-password#token=` +
    encodeURIComponent(
      token
    )
  );
}

export async function sendPasswordReset(
  input:
    PasswordResetDeliveryInput
): Promise<void> {
  const mode =
    process.env
      .PASSWORD_RESET_DELIVERY_MODE;

  if (
    mode ===
    "console"
  ) {
    if (
      process.env.NODE_ENV ===
      "production"
    ) {
      throw new Error(
        "Console password-reset delivery is disabled in production."
      );
    }

    const resetUrl =
      getResetUrl(
        input.token
      );

    console.log("");
    console.log(
      "========================================"
    );

    console.log(
      "XYZ HUB — DEVELOPMENT PASSWORD RESET"
    );

    console.log(
      `Name: ${input.name}`
    );

    console.log(
      `Email: ${input.email}`
    );

    console.log(
      `Reset URL: ${resetUrl}`
    );

    console.log(
      `Expires: ${input.expiresAt.toISOString()}`
    );

    console.log(
      "========================================"
    );

    console.log("");

    return;
  }

  if (mode === "email") {
    const resetUrl =
      getResetUrl(
        input.token
      );

    const message =
      renderEmailTemplate({
        eyebrow:
          "Password reset",

        title:
          "Reset your XYZ Hub password",

        greeting:
          `Hi ${input.name},`,

        paragraphs: [
          "A password reset was requested for your XYZ Hub account.",
          "Use the secure link below to choose a new password.",
          `This link expires at ${input.expiresAt.toISOString()}.`,
        ],

        actionLabel:
          "Reset password",

        actionUrl:
          resetUrl,

        footer:
          "If you did not request a password reset, you can ignore this email.",
      });

    await sendTransactionalEmail({
      to: input.email,
      subject:
        "Reset your XYZ Hub password",
      text:
        message.text,
      html:
        message.html,
      tag:
        "password_reset",
    });

    return;
  }

  throw new Error(
    "Password-reset email delivery is not configured."
  );
}
