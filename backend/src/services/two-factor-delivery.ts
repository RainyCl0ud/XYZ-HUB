import {
  formatEmailExpiry,
  getEmailDeliveryMode,
  sendTransactionalEmail,
} from "./email-delivery.js";

import {
  renderBrandedTransactionalEmail,
} from "./transactional-email-template.js";

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
      "XYZ MANAGEMENT — DEVELOPMENT 2FA CODE"
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
        "Your XYZ Management verification code",
      text:
        `Use this verification code to finish signing in to XYZ Management:\n\n${input.code}\n\nExpires: ${expiry}\n\nNever share this code. If you did not try to sign in, you can ignore this email.`,
      html:
        renderBrandedTransactionalEmail({
          preheader:
            `Your XYZ Management verification code is ${input.code}.`,
          eyebrow:
            "Two-factor authentication",
          title:
            "Finish signing in",
          intro:
            "Use the verification code below to finish signing in to XYZ Management.",
          code:
            input.code,
          details: [
            {
              label:
                "Expires",
              value:
                expiry,
            },
          ],
          notice:
            "Never share this verification code. If you did not try to sign in, you can ignore this email.",
        }),
    });

    return;
  }

  throw new Error(
    "2FA email delivery is not configured."
  );
}
