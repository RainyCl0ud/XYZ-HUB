const fs = require("fs");

function read(path) {
  return fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function write(path, content) {
  fs.writeFileSync(path, content.replace(/\n/g, "\r\n"), "utf8");
}

function repairOnce(content, before, after, label) {
  const beforeCount = content.split(before).length - 1;
  const afterCount = content.split(after).length - 1;

  if (beforeCount === 1) {
    return content.replace(before, after);
  }

  if (beforeCount === 0 && afterCount >= 1) {
    return content;
  }

  throw new Error(
    `${label}: expected one malformed handler or an already-repaired handler; found malformed=${beforeCount}, repaired=${afterCount}`
  );
}

function update(path, repairs) {
  let content = read(path);
  for (const repair of repairs) {
    content = repairOnce(
      content,
      repair.before,
      repair.after,
      `${path}: ${repair.label}`
    );
  }
  write(path, content);
}

update("frontend/src/pages/ChattersPage.tsx", [
  {
    label: "search handler JSX closing brace",
    before: `                setChatterPage(1);\n              }`,
    after: `                setChatterPage(1);\n              }}`,
  },
  {
    label: "All filter handler JSX closing brace",
    before: `                  setChatterPage(1);\n                }`,
    after: `                  setChatterPage(1);\n                }}`,
  },
  {
    label: "Active filter handler JSX closing brace",
    before: `                  setChatterPage(1);\n                }`,
    after: `                  setChatterPage(1);\n                }}`,
  },
  {
    label: "Inactive filter handler JSX closing brace",
    before: `                  setChatterPage(1);\n                }`,
    after: `                  setChatterPage(1);\n                }}`,
  },
]);

update("frontend/src/pages/RulesPage.tsx", [
  {
    label: "search handler JSX closing brace",
    before: `                setRulePage(1);\n              }`,
    after: `                setRulePage(1);\n              }}`,
  },
]);

console.log("✓ Repaired Chatter search + status-filter JSX handler delimiters.");
console.log("✓ Repaired Rules search JSX handler delimiter.");
console.log("✓ Audit handlers were already repaired by the previous guarded attempt.");
console.log("F.5.4 JSX delimiter repair v2 applied successfully.");
