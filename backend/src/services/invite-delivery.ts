import {
  renderEmailTemplate,
} from "./email-template.js";

import {
  sendTransactionalEmail,
} from "./transactional-email.js";

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

function getInviteUrl(
  token: string
): string {
  return (
    `${getFrontendUrl()}/invite#token=` +
    encodeURIComponent(
      token
    )
  );
}

export async function sendAccountInvite(
  input: AccountInviteDeliveryInput
): Promise<void> {
  const mode =
    process.env.INVITE_DELIVERY_MODE;

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
      getInviteUrl(
        input.token
      );

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

  if (mode === "email") {
    const inviteUrl =
      getInviteUrl(
        input.token
      );

    const message =
      renderEmailTemplate({
        eyebrow:
          "Account invitation",

        title:
          "You're invited to XYZ Hub",

        greeting:
          `Hi ${input.name},`,

        paragraphs: [
          "An XYZ Hub account has been prepared for you.",
          "Use the secure link below to choose your password and finish setting up your account.",
          `This invitation expires at ${input.expiresAt.toISOString()}.`,
        ],

        actionLabel:
          "Set up your account",

        actionUrl:
          inviteUrl,

        footer:
          "If you were not expecting this invitation, you can ignore this email.",
      });

    await sendTransactionalEmail({
      to: input.email,
      subject:
        "You're invited to XYZ Hub",
      text:
        message.text,
      html:
        message.html,
      tag:
        "account_invite",
    });

    return;
  }

  throw new Error(
    "Account invite email delivery is not configured."
  );
}
