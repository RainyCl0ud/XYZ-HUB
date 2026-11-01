import {
  escapeEmailHtml,
} from "./email-delivery.js";

export type BrandedEmailAction = {
  label: string;
  url: string;
};

export type BrandedEmailDetail = {
  label: string;
  value: string;
};

export type BrandedTransactionalEmailInput = {
  preheader: string;
  eyebrow: string;
  title: string;
  greeting?: string;
  intro: string;
  bodyText?: string;
  action?: BrandedEmailAction;
  code?: string;
  details?: BrandedEmailDetail[];
  notice?: string;
};

const BRAND_NAME =
  "XYZ Management";

function getBrandLogoUrl():
  string | null {
  const configuredLogoUrl =
    process.env.EMAIL_LOGO_URL?.trim();

  if (configuredLogoUrl) {
    return configuredLogoUrl;
  }

  const frontendUrl =
    process.env.FRONTEND_URL?.trim();

  if (!frontendUrl) {
    return null;
  }

  return `${frontendUrl.replace(
    /\/+$/,
    ""
  )}/xyz-management-logo.svg`;
}

function detailRows(
  details:
    BrandedEmailDetail[]
) {
  if (
    details.length ===
      0
  ) {
    return "";
  }

  return details
    .map(
      (
        detail
      ) =>
        `<tr>
          <td style="padding:7px 0;color:#d0d0d0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;vertical-align:top;">
            <span style="color:#8a8a8a;font-size:11px;text-transform:uppercase;letter-spacing:.7px;">${escapeEmailHtml(
              detail.label
            )}:</span>
            <strong style="color:#f1f1f1;font-weight:700;"> ${escapeEmailHtml(
              detail.value
            )}</strong>
          </td>
        </tr>`
    )
    .join(
      ""
    );
}

export function renderBrandedTransactionalEmail(
  input:
    BrandedTransactionalEmailInput
): string {
  const preheader =
    escapeEmailHtml(
      input.preheader
    );

  const eyebrow =
    escapeEmailHtml(
      input.eyebrow
    );

  const title =
    escapeEmailHtml(
      input.title
    );

  const logoUrl =
    getBrandLogoUrl();

  const logo =
    logoUrl
      ? `<img src="${escapeEmailHtml(
          logoUrl
        )}" width="150" alt="XYZ Management" style="display:block;width:150px;max-width:150px;height:auto;border:0;outline:none;text-decoration:none;">`
      : `<div style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;">XYZ Management</div>`;

  const greeting =
    input.greeting
      ? `<p style="margin:0 0 14px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;line-height:1.6;">${escapeEmailHtml(
          input.greeting
        )}</p>`
      : "";

  const intro =
    escapeEmailHtml(
      input.intro
    );

  const action =
    input.action
      ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 0;">
          <tr>
            <td align="center" bgcolor="#ffffff" style="background:#ffffff;border:1px solid #ffffff;">
              <a href="${escapeEmailHtml(
                input.action.url
              )}" style="display:inline-block;padding:12px 18px;color:#000000;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:800;line-height:1.2;text-decoration:none;">${escapeEmailHtml(
                input.action.label
              )}&nbsp;→</a>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;color:#777777;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1.55;">If the button does not work, open this secure link:</p>
        <p style="margin:5px 0 0;color:#bdbdbd;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1.55;word-break:break-all;"><a href="${escapeEmailHtml(
          input.action.url
        )}" style="color:#d7d7d7;text-decoration:underline;">${escapeEmailHtml(
          input.action.url
        )}</a></p>`
      : "";

  const code =
    input.code
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 0;">
          <tr>
            <td align="center" style="padding:14px 16px;border-left:3px solid #ffffff;background:#111111;text-align:center;">
              <div style="margin:0 0 7px;color:#8a8a8a;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.4px;text-align:center;text-transform:uppercase;">Verification code</div>
              <div class="xyz-verification-code" dir="ltr" style="-webkit-user-select:all;user-select:all;white-space:nowrap;color:#ffffff;font-family:'Courier New',Courier,monospace;font-size:30px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:6px;line-height:1.2;text-align:center;">${escapeEmailHtml(
                input.code
              )}</div>
            </td>
          </tr>
        </table>`
      : "";

  const details =
    input.details &&
    input.details.length >
      0
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0 0;padding-top:8px;border-top:1px solid #2a2a2a;">
          ${detailRows(
            input.details
          )}
        </table>`
      : "";

  const notice =
    input.notice
      ? `<p style="margin:22px 0 0;padding-top:16px;border-top:1px solid #2a2a2a;color:#8f8f8f;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.65;">${escapeEmailHtml(
          input.notice
        )}</p>`
      : "";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="dark">
    <meta name="supported-color-schemes" content="dark">
    <title>${title}</title>
    <style>
      @media screen and (max-width: 600px) {
        .xyz-email-outer {
          padding: 12px !important;
        }

        .xyz-email-content {
          padding: 26px 22px !important;
        }

        .xyz-email-header {
          padding: 28px 22px 0 !important;
        }

        .xyz-verification-code {
          font-size: 27px !important;
          letter-spacing: 4px !important;
        }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;background:#ffffff;">
      <tr>
        <td class="xyz-email-outer" align="center" style="padding:28px 14px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;border:1px solid #2d2d2d;background:#000000;">
            <tr>
              <td class="xyz-email-header" align="center" style="padding:30px 30px 0;">
                ${logo}
              </td>
            </tr>

            <tr>
              <td class="xyz-email-content" style="padding:30px;">
                <div style="margin:0 0 8px;color:#9a9a9a;font-family:Arial,Helvetica,sans-serif;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">${BRAND_NAME} · ${eyebrow}</div>
                <h1 style="margin:0;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:800;letter-spacing:-0.35px;line-height:1.25;">${title}</h1>

                <div style="margin:14px 0 22px;border-top:1px solid #6a6a6a;font-size:0;line-height:0;">&nbsp;</div>

                ${greeting}
                <p style="margin:0;color:#d0d0d0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.7;">${intro}</p>
                ${input.bodyText ? `<p style="margin:18px 0 0;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;">${escapeEmailHtml(input.bodyText)}</p>` : ""}

                ${code}
                ${action}
                ${details}
                ${notice}

                <p style="margin:24px 0 0;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;line-height:1.6;">— The XYZ Management Team</p>
              </td>
            </tr>

            <tr>
              <td style="padding:0 30px 24px;">
                <div style="border-top:1px solid #2d2d2d;font-size:0;line-height:0;">&nbsp;</div>
                <p style="margin:14px 0 0;color:#5d5d5d;font-family:Arial,Helvetica,sans-serif;font-size:9px;line-height:1.55;">This is an automated message from XYZ Management.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
