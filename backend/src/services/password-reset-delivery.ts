import {
  formatEmailExpiry,
  getEmailDeliveryMode,
  sendTransactionalEmail,
} from "./email-delivery.js";

import {
  renderBrandedTransactionalEmail,
} from "./transactional-email-template.js";

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
      "XYZ MANAGEMENT — DEVELOPMENT PASSWORD RESET"
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
    "gmail_api"
  ) {
    const expiry =
      formatEmailExpiry(
        input.expiresAt
      );

    await sendTransactionalEmail({
      to:
        input.email,
      subject:
        "Password reset for XYZ Management",
      text:
        `Hi ${input.name},\n\nWe received a request to reset your XYZ Management password. Use the secure one-time link below to choose a new password.\n\nReset your password:\n${resetUrl}\n\nExpires: ${expiry}\n\nIf you did not request this reset, you can ignore this email. Your current password will remain unchanged unless the reset link is completed.`,
      html:
        renderBrandedTransactionalEmail({
          preheader:
            "Password reset for your XYZ Management account.",
          eyebrow:
            "Password reset",
          title:
            "Reset your password",
          greeting:
            `Hi ${input.name},`,
          intro:
            "We received a request to reset your XYZ Management password. Use the secure one-time link below to choose a new password.",
          action: {
            label:
              "Reset password",
            url:
              resetUrl,
          },
          details: [
            {
              label:
                "Expires",
              value:
                expiry,
            },
          ],
          notice:
            "If you did not request this reset, you can ignore this email. Your current password will remain unchanged unless the reset link is completed.",
        }),
    });

    return;
  }

  throw new Error(
    "Password-reset email delivery is not configured."
  );
}
