import {
  escapeEmailHtml,
  formatEmailExpiry,
  getEmailDeliveryMode,
  sendTransactionalEmail,
} from "./email-delivery.js";

export type EmailTwoFactorCodeInput = {
  email: string;
  code: string;
  expiresAt: Date;
};

export async function sendEmailTwoFactorCode(
  input:
    EmailTwoFactorCodeInput
): Promise<void> {
  const mode =
    getEmailDeliveryMode(
      "TWO_FACTOR_DELIVERY_MODE"
    );

  if (
    mode ===
    "console"
  ) {
    if (
      process.env.NODE_ENV ===
      "production"
    ) {
      throw new Error(
        "Console 2FA delivery is disabled in production."
      );
    }

    console.log("");
    console.log(
      "========================================"
    );
    console.log(
      "XYZ HUB — DEVELOPMENT 2FA CODE"
    );
    console.log(
      `Email: ${input.email}`
    );
    console.log(
      `Code: ${input.code}`
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
    const expiry =
      formatEmailExpiry(
        input.expiresAt
      );

    await sendTransactionalEmail({
      to:
        input.email,
      subject:
        "Your XYZ Hub verification code",
      text:
        `Your XYZ Hub verification code is ${input.code}. It expires ${expiry}. If you did not try to sign in, you can ignore this email.`,
      html:
        `<p>Your XYZ Hub verification code is:</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${escapeEmailHtml(input.code)}</p><p>It expires ${escapeEmailHtml(expiry)}.</p><p>If you did not try to sign in, you can ignore this email.</p>`,
    });

    return;
  }

  throw new Error(
    "2FA email delivery is not configured."
  );
}
