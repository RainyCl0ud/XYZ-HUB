import {
  escapeEmailHtml,
  formatEmailExpiry,
  getEmailDeliveryMode,
  sendTransactionalEmail,
} from "./email-delivery.js";

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

export async function sendPasswordReset(
  input:
    PasswordResetDeliveryInput
): Promise<void> {
  const mode =
    getEmailDeliveryMode(
      "PASSWORD_RESET_DELIVERY_MODE"
    );

  const resetUrl =
    `${getFrontendUrl()}/reset-password#token=${encodeURIComponent(
      input.token
    )}`;

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

  if (
    mode ===
    "smtp"
  ) {
    const safeName =
      escapeEmailHtml(
        input.name
      );

    const safeResetUrl =
      escapeEmailHtml(
        resetUrl
      );

    const expiry =
      formatEmailExpiry(
        input.expiresAt
      );

    await sendTransactionalEmail({
      to:
        input.email,
      subject:
        "Reset your XYZ Hub password",
      text:
        `Hi ${input.name},\n\nUse this one-time link to reset your XYZ Hub password:\n\n${resetUrl}\n\nThe link expires ${expiry}.\n\nIf you did not request this reset, you can ignore this email.`,
      html:
        `<p>Hi ${safeName},</p><p>Use the link below to reset your XYZ Hub password.</p><p><a href="${safeResetUrl}">Reset password</a></p><p>The one-time link expires ${escapeEmailHtml(expiry)}.</p><p>If you did not request this reset, you can ignore this email.</p>`,
    });

    return;
  }

  throw new Error(
    "Password-reset email delivery is not configured."
  );
}
