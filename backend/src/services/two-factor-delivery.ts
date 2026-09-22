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

  /*
   * Temporary development/staging delivery.
   *
   * This must be explicitly enabled through:
   *
   * TWO_FACTOR_DELIVERY_MODE=console
   *
   * We do NOT default to console mode because
   * accidentally logging real 2FA codes in
   * production would be unsafe.
   */
  if (mode === "console") {
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

  throw new Error(
    "2FA email delivery is not configured."
  );
}