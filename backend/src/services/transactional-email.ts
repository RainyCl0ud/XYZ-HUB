export type TransactionalEmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
  tag?: string;
};

function getRequiredEnv(
  name: string
): string {
  const value =
    process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} is not configured.`
    );
  }

  return value;
}

async function sendWithResend(
  input: TransactionalEmailInput
): Promise<void> {
  const apiKey =
    getRequiredEnv(
      "RESEND_API_KEY"
    );

  const from =
    getRequiredEnv(
      "EMAIL_FROM"
    );

  const response =
    await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${apiKey}`,

          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          from,
          to: [input.to],
          subject:
            input.subject,
          text:
            input.text,
          html:
            input.html,
          ...(input.tag
            ? {
                tags: [
                  {
                    name:
                      "category",
                    value:
                      input.tag,
                  },
                ],
              }
            : {}),
        }),
      }
    );

  if (!response.ok) {
    const responseText =
      await response.text();

    const safeDetail =
      responseText
        .replace(
          apiKey,
          "[REDACTED]"
        )
        .slice(
          0,
          500
        );

    throw new Error(
      `Transactional email provider rejected the request (${response.status}). ${safeDetail}`
    );
  }
}

export async function sendTransactionalEmail(
  input: TransactionalEmailInput
): Promise<void> {
  const provider =
    process.env.EMAIL_PROVIDER
      ?.trim()
      .toLowerCase();

  if (provider === "resend") {
    await sendWithResend(
      input
    );

    return;
  }

  throw new Error(
    "Transactional email provider is not configured."
  );
}
