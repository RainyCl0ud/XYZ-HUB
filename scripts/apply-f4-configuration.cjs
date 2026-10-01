const fs = require("node:fs");
const path = require("node:path");

const file = path.join(
  process.cwd(),
  "frontend/src/pages/ConfigurationPage.tsx"
);

const original = fs.readFileSync(
  file,
  "utf8"
);

function replaceOnce(
  source,
  oldText,
  newText,
  label
) {
  const first = source.indexOf(
    oldText
  );
  const last = source.lastIndexOf(
    oldText
  );

  if (first < 0) {
    throw new Error(
      `F.4 configuration codemod could not find: ${label}`
    );
  }

  if (first !== last) {
    throw new Error(
      `F.4 configuration codemod found multiple matches for: ${label}`
    );
  }

  return source.slice(0, first) +
    newText +
    source.slice(
      first + oldText.length
    );
}

try {
  let source = original;

  source = replaceOnce(
    source,
    `                <strong>\n                  {\n                    currentLadder.steps.length\n                  }\n                </strong>`,
    `                <strong>\n                  {\n                    Math.max(\n                      0,\n                      currentLadder.steps.length - 1\n                    )\n                  }\n                </strong>`,
    "visible ladder step count"
  );

  source = replaceOnce(
    source,
    `                  <p>\n                    Active-strike numbers\n                    are assigned by the\n                    system. The 0-strike\n                    base and its 0%\n                    deduction are fixed.\n                  </p>`,
    `                  <p>\n                    Configure the standing\n                    and deduction applied\n                    at each active-strike\n                    level.\n                  </p>`,
    "hidden baseline editor copy"
  );

  fs.writeFileSync(
    file,
    source,
    "utf8"
  );

  console.log(
    "✓ Strike Ladder presentation hides the system baseline consistently."
  );
} catch (error) {
  fs.writeFileSync(
    file,
    original,
    "utf8"
  );

  console.error(
    "F.4 configuration codemod aborted; source was restored."
  );
  throw error;
}
