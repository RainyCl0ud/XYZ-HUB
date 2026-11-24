import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Buttons that a page hides with the hidden attribute (for people without
// the permission) must really disappear. Classes such as .primary-button set
// display: inline-flex, which beats the browser's own [hidden] style, so the
// global stylesheet forces it.

const src = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");
const read = (path) => readFileSync(path, "utf8").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
let passed = 0;
const pass = (text) => console.log(`PASS ${++passed}: ${text}`);

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});
const files = walk(src);
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

// 1. The global rule.
const index = strip(read(join(src, "index.css")));
const rule = index.match(/(?:^|\n)\[hidden\]\s*\{([^}]*)\}/);
assert.ok(rule, "index.css has a top-level [hidden] rule");
assert.match(rule[1], /display:\s*none\s*!important;/, "It hides with !important, so no class's display can override it");
assert.ok(index.indexOf("[hidden]") < index.indexOf(".primary-button"), "It sits with the reset, before the button styles");
pass("index.css forces [hidden] to display: none");

// 2. Nothing un-hides hidden elements.
for (const file of files.filter((path) => path.endsWith(".css"))) {
  for (const [, selectors, body] of strip(read(file)).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/\[hidden\]/.test(selectors)) continue;
    const display = body.match(/display:\s*([^;!]+)/);
    assert.ok(!display || display[1].trim() === "none", `${relative(src, file)}: ${selectors.trim()} must not show hidden elements (display: ${display?.[1]})`);
  }
}
pass("No stylesheet gives [hidden] elements a visible display");

// 3. The buttons that rely on it are the styled ones the rule now covers.
const styled = /className="(?:[^"]*\s)?(?:primary-button|secondary-button|danger-button)\b/;
const users = [];
for (const file of files.filter((path) => path.endsWith(".tsx"))) {
  const code = read(file);
  for (const match of code.matchAll(/<button\b[^>]*?\shidden=\{/g)) {
    const tag = code.slice(match.index, code.indexOf(">", match.index + match[0].length) + 1);
    if (styled.test(tag)) users.push(`${relative(src, file).replace(/\\/g, "/")}`);
  }
}
for (const expected of ["pages/ModelsPage.tsx", "pages/PeoplePage.tsx", "pages/PeopleDetailPage.tsx", "pages/RulesPage.tsx", "pages/StrikeReasonsPage.tsx", "pages/StrikesPage.tsx"]) {
  assert.ok(users.includes(expected), `${expected} hides a styled button with hidden={...}`);
}
pass(`Styled buttons hidden by permission are covered (${users.length} on ${new Set(users).size} pages)`);

console.log(`${passed} hidden-control groups passed.`);
