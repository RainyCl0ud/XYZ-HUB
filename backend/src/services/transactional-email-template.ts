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
  action?: BrandedEmailAction;
  code?: string;
  details?: BrandedEmailDetail[];
  notice?: string;
};

const BRAND_NAME =
  "XYZ Management";

const BRAND_SUBTITLE =
  "Management Hub";

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
          <td style="padding:8px 0;color:#8d8d96;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.45;vertical-align:top;width:110px;">${escapeEmailHtml(
          detail.label
        )}</td>
          <td style="padding:8px 0;color:#e9e9ed;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:600;line-height:1.45;vertical-align:top;">${escapeEmailHtml(
          detail.value
        )}</td>
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

  const greeting =
    input.greeting
      ? `<p style="margin:0 0 12px;color:#f4f4f6;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;line-height:1.6;">${escapeEmailHtml(
          input.greeting
        )}</p>`
      : "";

  const intro =
    escapeEmailHtml(
      input.intro
    );

  const action =
    input.action
      ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:22px auto 0;">
          <tr>
            <td align="center" bgcolor="#e8d8b2" style="border-radius:8px;">
              <a href="${escapeEmailHtml(
                input.action.url
              )}" style="display:inline-block;padding:13px 22px;color:#18181b;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:800;line-height:1;text-decoration:none;">${escapeEmailHtml(
                input.action.label
              )}</a>
            </td>
          </tr>
        </table>
        <p style="margin:18px 0 0;color:#797982;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1.55;text-align:center;">If the button does not work, copy and paste this secure link into your browser:</p>
        <p style="margin:6px 0 0;color:#b9aa85;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1.55;text-align:center;word-break:break-all;">${escapeEmailHtml(
          input.action.url
        )}</p>`
      : "";

  const code =
    input.code
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0 0;">
          <tr>
            <td align="center" style="padding:18px;border:1px solid #3b3933;border-radius:10px;background:#161618;">
              <div style="margin:0 0 7px;color:#8d8d96;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;">Verification code</div>
              <div class="email-verification-code" dir="ltr" style="-webkit-user-select:all;user-select:all;color:#e8d8b2;font-family:'Courier New',Courier,monospace;font-size:32px;font-weight:700;letter-spacing:6px;line-height:1.2;white-space:nowrap;">${escapeEmailHtml(
                input.code
              )}</div>
              <div style="margin-top:10px;color:#73737b;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1.45;">On mobile, tap and hold the code to copy it.</div>
            </td>
          </tr>
        </table>`
      : "";

  const details =
    input.details &&
    input.details.length >
      0
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0 0;padding-top:8px;border-top:1px solid #303034;">
          ${detailRows(
            input.details
          )}
        </table>`
      : "";

  const notice =
    input.notice
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0 0;">
          <tr>
            <td style="padding:12px 14px;border-left:3px solid #e8d8b2;background:#202023;color:#aaaab2;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;">${escapeEmailHtml(
              input.notice
            )}</td>
          </tr>
        </table>`
      : "";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${title}</title>
    <style>
      @media only screen and (max-width: 600px) {
        .email-outer-cell {
          padding: 20px 10px !important;
        }

        .email-card-header {
          padding: 24px 20px 19px !important;
        }

        .email-card-body {
          padding: 25px 20px 24px !important;
        }

        .email-verification-code {
          font-size: 29px !important;
          letter-spacing: 4px !important;
        }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;background:#ffffff;">
      <tr>
        <td class="email-outer-cell" align="center" bgcolor="#ffffff" style="padding:34px 14px;background:#ffffff;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;border:1px solid #303034;border-radius:14px;background:#1b1b1e;overflow:hidden;">
            <tr>
              <td class="email-card-header" align="center" style="padding:28px 28px 22px;border-bottom:1px solid #303034;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" valign="middle" style="width:48px;height:48px;border:1px solid #49463e;border-radius:999px;background:#232326;color:#e8d8b2;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:800;letter-spacing:1px;">
                      XYZ
                    </td>
                  </tr>
                </table>

                <div style="margin-top:12px;color:#f5f5f6;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">${BRAND_NAME}</div>
                <div style="margin-top:4px;color:#777780;font-family:Arial,Helvetica,sans-serif;font-size:9px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;">${BRAND_SUBTITLE}</div>
              </td>
            </tr>

            <tr>
              <td class="email-card-body" style="padding:30px 30px 28px;">
                <div style="margin:0 0 9px;color:#e8d8b2;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;">${eyebrow}</div>
                <h1 style="margin:0;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:700;letter-spacing:-0.4px;line-height:1.25;">${title}</h1>

                <div style="margin-top:19px;">
                  ${greeting}
                  <p style="margin:0;color:#b7b7bf;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.7;">${intro}</p>
                </div>

                ${code}
                ${action}
                ${details}
                ${notice}
              </td>
            </tr>

            <tr>
              <td align="center" style="padding:18px 24px;border-top:1px solid #303034;background:#171719;">
                <div style="color:#777780;font-family:Arial,Helvetica,sans-serif;font-size:9px;line-height:1.55;">${BRAND_NAME} · ${BRAND_SUBTITLE}</div>
                <div style="margin-top:4px;color:#5f5f67;font-family:Arial,Helvetica,sans-serif;font-size:9px;line-height:1.55;">This is an automated account and security message.</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
