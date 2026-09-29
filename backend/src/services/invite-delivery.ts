import {
  formatEmailExpiry,
  getEmailDeliveryMode,
  sendTransactionalEmail,
} from "./email-delivery.js";

import {
  renderBrandedTransactionalEmail,
} from "./transactional-email-template.js";

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
      "XYZ MANAGEMENT — DEVELOPMENT ACCOUNT INVITE"
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
        "Set up your XYZ Management account",
      text:
        `Hi ${input.name},\n\nYou have been invited to XYZ Management. Use the secure one-time link below to create your password and activate your account.\n\nSet up your account:\n${inviteUrl}\n\nExpires: ${expiry}\n\nIf you were not expecting this invitation, you can ignore this email. Do not forward or share this invitation link.`,
      html:
        renderBrandedTransactionalEmail({
          preheader:
            "You have been invited to XYZ Management.",
          eyebrow:
            "Account invitation",
          title:
            "Set up your account",
          greeting:
            `Hi ${input.name},`,
          intro:
            "You have been invited to XYZ Management. Use the secure one-time link below to create your password and activate your account.",
          action: {
            label:
              "Set up your account",
            url:
              inviteUrl,
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
            "If you were not expecting this invitation, you can ignore this email. Do not forward or share this invitation link.",
        }),
    });

    return;
  }

  throw new Error(
    "Account invite email delivery is not configured."
  );
}
