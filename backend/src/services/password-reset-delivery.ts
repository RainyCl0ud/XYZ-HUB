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
    process.env
      .PASSWORD_RESET_DELIVERY_MODE;

  /*
   * Temporary LOCAL development delivery.
   *
   * Real email delivery belongs to a later
   * implementation stage.
   */
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

    /*
     * Keep the secret token in the fragment.
     *
     * Browser fragments are not normally
     * included in the HTTP request sent to
     * the frontend server.
     */
    const resetUrl =
      `${getFrontendUrl()}/reset-password#token=${encodeURIComponent(
        input.token
      )}`;

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

  throw new Error(
    "Password-reset email delivery is not configured."
  );
}