import {
  escapeEmailHtml,
  formatEmailExpiry,
  getEmailDeliveryMode,
  sendTransactionalEmail,
} from "./email-delivery.js";

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
  input:
    AccountInviteDeliveryInput
): Promise<void> {
  const mode =
    getEmailDeliveryMode(
      "INVITE_DELIVERY_MODE"
    );

  const inviteUrl =
    `${getFrontendUrl()}/invite#token=${encodeURIComponent(
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
        "Console invite delivery is disabled in production."
      );
    }

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

  if (
    mode ===
    "smtp"
  ) {
    const safeName =
      escapeEmailHtml(
        input.name
      );

    const safeInviteUrl =
      escapeEmailHtml(
        inviteUrl
      );

    const expiry =
      formatEmailExpiry(
        input.expiresAt
      );

    await sendTransactionalEmail({
      to:
        input.email,
      subject:
        "Set up your XYZ Hub account",
      text:
        `Hi ${input.name},\n\nYou have been invited to XYZ Hub. Set your password using this one-time link:\n\n${inviteUrl}\n\nThis invitation expires ${expiry}.\n\nIf you were not expecting this invitation, you can ignore this email.`,
      html:
        `<p>Hi ${safeName},</p><p>You have been invited to <strong>XYZ Hub</strong>.</p><p><a href="${safeInviteUrl}">Set up your account</a></p><p>This one-time invitation expires ${escapeEmailHtml(expiry)}.</p><p>If you were not expecting this invitation, you can ignore this email.</p>`,
    });

    return;
  }

  throw new Error(
    "Account invite email delivery is not configured."
  );
}
