export type AccountInviteDeliveryInput = {
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

export async function sendAccountInvite(
  input: AccountInviteDeliveryInput
): Promise<void> {
  const mode =
    process.env.INVITE_DELIVERY_MODE;

  /*
   * Temporary LOCAL development delivery.
   *
   * Real staging/production delivery will
   * later use the transactional email provider.
   */
  if (mode === "console") {
    if (
      process.env.NODE_ENV ===
      "production"
    ) {
      throw new Error(
        "Console invite delivery is disabled in production."
      );
    }

    const inviteUrl =
      `${getFrontendUrl()}/invite#token=${encodeURIComponent(
        input.token
      )}`;

    console.log("");
    console.log(
      "========================================"
    );

    console.log(
      "XYZ HUB — DEVELOPMENT ACCOUNT INVITE"
    );

    console.log(
      `Name: ${input.name}`
    );

    console.log(
      `Email: ${input.email}`
    );

    console.log(
      `Invite URL: ${inviteUrl}`
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
    "Account invite email delivery is not configured."
  );
}