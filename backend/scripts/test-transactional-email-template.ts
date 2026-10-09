/// <reference types="node" />

import assert from "node:assert/strict";

import {
  renderBrandedTransactionalEmail,
} from "../src/services/transactional-email-template.js";

function main() {
  console.log(
    "Starting transactional email template tests..."
  );

  const html =
    renderBrandedTransactionalEmail({
      preheader:
        "Security notification",
      eyebrow:
        "Account security",
      title:
        "Finish signing in",
      greeting:
        "Hi <Admin> & Team,",
      intro:
        "Use the secure information below to continue.",
      action: {
        label:
          "Continue securely",
        url:
          "https://portal.example.test/reset?token=a&source=email",
      },
      code:
        "123456",
      details: [
        {
          label:
            "Expires",
          value:
            "Sep 29, 2026, 8:30 AM CDT",
        },
      ],
      notice:
        "Never share this code with anyone.",
    });

  assert.ok(
    html.includes(
      "XYZ Management"
    )
  );

  assert.ok(
    html.includes(
      "Finish signing in"
    )
  );

  assert.ok(
    html.includes(
      "123456"
    )
  );

  assert.ok(
    html.includes(
      "Continue securely"
    )
  );

  assert.ok(
    html.includes(
      "Sep 29, 2026, 8:30 AM CDT"
    )
  );

  assert.ok(
    html.includes(
      "Never share this code with anyone."
    )
  );

  console.log(
    "✓ branded header, action, code, details and security notice render"
  );

  assert.ok(
    html.includes(
      'bgcolor="#f5f3ee"'
    )
  );

  assert.ok(
    html.includes(
      'background:#f5f3ee'
    )
  );

  assert.equal(
    html.includes(
      "Tap and hold the code to copy it."
    ),
    false
  );

  assert.ok(
    html.includes(
      ">123456</div>"
    )
  );

  assert.ok(
    html.includes(
      "@media screen and (max-width: 600px)"
    )
  );

  console.log(
    "✓ soft neutral outer background and mobile copy-ready verification code render"
  );

  assert.ok(
    html.includes(
      "Hi &lt;Admin&gt; &amp; Team,"
    )
  );

  assert.equal(
    html.includes(
      "Hi <Admin>"
    ),
    false
  );

  assert.ok(
    html.includes(
      "token=a&amp;source=email"
    )
  );

  console.log(
    "✓ dynamic email content is HTML-escaped"
  );

  assert.ok(
    html.includes(
      "If the button does not work"
    )
  );

  assert.ok(
    html.includes(
      "This is an automated message from XYZ Management."
    )
  );

  console.log(
    "✓ secure-link fallback and automated-message footer render"
  );

  assert.equal(
    html.includes(
      "XYZ Hub"
    ),
    false
  );

  console.log(
    "✓ legacy XYZ Hub branding is absent from the shared template"
  );

  console.log("");
  console.log(
    "All transactional email template tests passed."
  );
}

main();
