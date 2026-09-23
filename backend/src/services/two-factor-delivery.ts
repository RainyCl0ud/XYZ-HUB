import {
  renderEmailTemplate,
} from "./email-template.js";

import {
  sendTransactionalEmail,
} from "./transactional-email.js";

export type EmailTwoFactorCodeInput = {
  email: string;
  code: string;
  expiresAt: Date;
};

export async function sendEmailTwoFactorCode(
  input: EmailTwoFactorCodeInput
): Promise<void> {
  const mode =
    process.env.TWO_FACTOR_DELIVERY_MODE;

  if (mode === "console") {
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

  if (mode === "email") {
    const message =
      renderEmailTemplate({
        eyebrow:
          "Login verification",

        title:
          "Your XYZ Hub verification code",

        paragraphs: [
          "Enter this code to finish signing in to XYZ Hub.",
          `The code expires at ${input.expiresAt.toISOString()}.`,
        ],

        code:
          input.code,

        footer:
          "If you did not try to sign in, you can ignore this email.",
      });

    await sendTransactionalEmail({
      to: input.email,
      subject:
        "Your XYZ Hub verification code",
      text:
        message.text,
      html:
        message.html,
      tag:
        "login_2fa",
    });

    return;
  }

  throw new Error(
    "2FA email delivery is not configured."
  );
}
