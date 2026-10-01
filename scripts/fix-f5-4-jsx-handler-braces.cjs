const fs = require("fs");

function read(path) {
  return fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function write(path, content) {
  fs.writeFileSync(path, content.replace(/\n/g, "\r\n"), "utf8");
}

function replaceExactCount(path, before, after, expectedCount, label) {
  let content = read(path);
  const matches = content.split(before).length - 1;

  if (matches !== expectedCount) {
    throw new Error(
      `${label}: expected ${expectedCount} malformed handler ending(s), found ${matches}`
    );
  }

  content = content.split(before).join(after);
  write(path, content);
}

replaceExactCount(
  "frontend/src/pages/AuditPage.tsx",
  "            setAuditPage(1);\n          }",
  "            setAuditPage(1);\n          }}",
  3,
  "AuditPage JSX handlers"
);

replaceExactCount(
  "frontend/src/pages/ChattersPage.tsx",
  "                  setChatterPage(1);\n                }",
  "                  setChatterPage(1);\n                }}",
  4,
  "ChattersPage JSX handlers"
);

replaceExactCount(
  "frontend/src/pages/RulesPage.tsx",
  "                setRulePage(1);\n              }",
  "                setRulePage(1);\n              }}",
  1,
  "RulesPage JSX handler"
);

console.log("✓ Repaired 3 Audit pagination handler delimiters.");
console.log("✓ Repaired 4 Chatter pagination handler delimiters.");
console.log("✓ Repaired 1 Rules pagination handler delimiter.");
console.log("F.5.4 JSX handler repair applied successfully.");
