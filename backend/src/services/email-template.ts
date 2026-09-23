function escapeHtml(
  value: string
): string {
  return value
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}

export type EmailTemplateInput = {
  eyebrow?: string;
  title: string;
  greeting?: string;
  paragraphs: string[];
  actionLabel?: string;
  actionUrl?: string;
  code?: string;
  footer?: string;
};

export function renderEmailTemplate(
  input: EmailTemplateInput
): {
  html: string;
  text: string;
} {
  const textParts = [
    input.eyebrow,
    input.title,
    input.greeting,
    ...input.paragraphs,
    input.code
      ? `Code: ${input.code}`
      : undefined,
    input.actionLabel &&
    input.actionUrl
      ? `${input.actionLabel}: ${input.actionUrl}`
      : undefined,
    input.footer,
  ].filter(
    (
      value
    ): value is string =>
      Boolean(value)
  );

  const paragraphs =
    input.paragraphs
      .map(
        (paragraph) =>
          `<p style="margin:0 0 16px;color:#c8ccd8;line-height:1.6;">${escapeHtml(
            paragraph
          )}</p>`
      )
      .join("");

  const codeBlock =
    input.code
      ? `
        <div style="margin:24px 0;padding:18px 20px;border:1px solid #303649;border-radius:12px;background:#111522;text-align:center;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8f96aa;margin-bottom:8px;">Verification code</div>
          <div style="font-size:30px;font-weight:700;letter-spacing:0.22em;color:#ffffff;">${escapeHtml(
            input.code
          )}</div>
        </div>
      `
      : "";

  const actionBlock =
    input.actionLabel &&
    input.actionUrl
      ? `
        <div style="margin:26px 0;">
          <a href="${escapeHtml(
            input.actionUrl
          )}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#ffffff;color:#11131a;text-decoration:none;font-weight:700;">${escapeHtml(
            input.actionLabel
          )}</a>
        </div>
        <p style="margin:0 0 16px;color:#8f96aa;line-height:1.6;font-size:13px;word-break:break-all;">${escapeHtml(
          input.actionUrl
        )}</p>
      `
      : "";

  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0b0e14;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:620px;margin:0 auto;padding:40px 20px;">
      <div style="padding:28px;border:1px solid #252b3a;border-radius:16px;background:#151924;">
        <div style="font-size:18px;font-weight:700;color:#ffffff;margin-bottom:28px;">XYZ Hub</div>
        ${input.eyebrow
          ? `<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8f96aa;margin-bottom:10px;">${escapeHtml(
              input.eyebrow
            )}</div>`
          : ""}
        <h1 style="margin:0 0 20px;color:#ffffff;font-size:26px;line-height:1.25;">${escapeHtml(
          input.title
        )}</h1>
        ${input.greeting
          ? `<p style="margin:0 0 16px;color:#ffffff;line-height:1.6;">${escapeHtml(
              input.greeting
            )}</p>`
          : ""}
        ${paragraphs}
        ${codeBlock}
        ${actionBlock}
        <div style="margin-top:30px;padding-top:20px;border-top:1px solid #252b3a;color:#747c91;font-size:12px;line-height:1.6;">
          ${escapeHtml(
            input.footer ??
              "This is an automated XYZ Hub security email."
          )}
        </div>
      </div>
    </div>
  </body>
</html>
  `.trim();

  return {
    html,
    text:
      textParts.join(
        "\n\n"
      ),
  };
}
