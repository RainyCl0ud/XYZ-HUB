const fs = require("fs");
const path = require("path");

const root = process.cwd();
const targets = {
  rolePage: "frontend/src/pages/RoleSettingsRankPage.tsx",
  configurationPage: "frontend/src/pages/ConfigurationPage.tsx",
};

const originals = new Map();
const endings = new Map();

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  const original = fs.readFileSync(fullPath, "utf8");
  originals.set(relativePath, original);
  endings.set(relativePath, original.includes("\r\n") ? "\r\n" : "\n");
  return original.replace(/\r\n/g, "\n");
}

function write(relativePath, source) {
  const eol = endings.get(relativePath) || "\n";
  fs.writeFileSync(
    path.join(root, relativePath),
    source.replace(/\n/g, eol),
    "utf8"
  );
}

function replaceOne(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`F.5.3 expected 1 match for ${label}, found ${count}`);
  }
  return source.replace(before, after);
}

try {
  let rolePage = read(targets.rolePage);
  let configurationPage = read(targets.configurationPage);

  rolePage = replaceOne(
    rolePage,
`                        >
                          Permissions
                        </button>`,
`                        >
                          Set permissions
                        </button>`,
    "classic Set permissions label"
  );

  configurationPage = replaceOne(
    configurationPage,
`              {[...currentLadder.steps]
                .sort(`,
`              {[...currentLadder.steps]
                .filter(
                  (step) =>
                    step.minActiveStrikes > 0
                )
                .sort(`,
    "current ladder implicit-clear filtering"
  );

  configurationPage = replaceOne(
    configurationPage,
`                {ladderDraftSteps.map(
                  (
                    step,
                    index
                  ) => (`,
`                {ladderDraftSteps.map(
                  (
                    step,
                    index
                  ) =>
                    index === 0
                      ? null
                      : (`,
    "ladder editor implicit-clear filtering"
  );

  configurationPage = replaceOne(
    configurationPage,
`                    const orderedSteps =
                      [...version.steps]
                        .sort(`,
`                    const orderedSteps =
                      [...version.steps]
                        .filter(
                          (step) =>
                            step.minActiveStrikes > 0
                        )
                        .sort(`,
    "ladder history implicit-clear filtering"
  );

  write(targets.rolePage, rolePage);
  write(targets.configurationPage, configurationPage);

  console.log("✓ Role Settings restored Set permissions / Edit classic text actions.");
  console.log("✓ Current Strike Ladder hides the implicit 0-strike Clear state.");
  console.log("✓ Edit Ladder hides the protected implicit base state while preserving it internally.");
  console.log("✓ Strike Ladder history hides the implicit base state.");
  console.log("F.5.3 guarded codemod applied successfully.");
} catch (error) {
  for (const [relativePath, original] of originals) {
    fs.writeFileSync(path.join(root, relativePath), original, "utf8");
  }

  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
