import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Buttons that a page hides with the hidden attribute (for people without
// the permission) must really disappear. Classes such as .primary-button set
// display: inline-flex, which beats the browser's own [hidden] style, so the
// global stylesheet forces it with !important. That holds unless a later
// rule sets a visible display with !important on the same element, so this
// also checks that no such rule targets the classes those buttons use.

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
const cssRules = files
  .filter((path) => path.endsWith(".css"))
  .flatMap((file) => [...strip(read(file)).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({
    file: relative(src, file).replace(/\\/g, "/"),
    selectors: selectors.trim().split(",").map((s) => s.trim()).filter(Boolean),
    displays: [...body.matchAll(/display:\s*([^;]+);/g)].map(([, value]) => value.trim()),
  })));
const visible = (value) => !/^none\b/.test(value);

// 1. The global rule.
const index = strip(read(join(src, "index.css")));
const rule = index.match(/(?:^|\n)\[hidden\]\s*\{([^}]*)\}/);
assert.ok(rule, "index.css has a top-level [hidden] rule");
assert.match(rule[1], /display:\s*none\s*!important;/, "It hides with !important, so plain display rules (like .primary-button's) can't override it");
pass("index.css forces [hidden] to display: none");

// 2. Nothing un-hides hidden elements directly.
for (const { file, selectors, displays } of cssRules) {
  for (const selector of selectors) {
    // :not([hidden]) styles visible elements, which is fine.
    if (!/\[hidden\]/.test(selector.replace(/:not\(\[hidden\]\)/g, ""))) continue;
    for (const value of displays) assert.ok(!visible(value), `${file}: ${selector} must not show hidden elements (display: ${value})`);
  }
}
pass("No stylesheet gives [hidden] elements a visible display");

// 3. No !important display rule targets a class that a hidden button uses.
// Reads each <button …> tag to its closing ">" outside {…}, so handlers like
// onClick={() => …} don't cut it short.
const buttonTags = (code) => {
  const tags = [];
  for (const match of code.matchAll(/<button\b/g)) {
    let depth = 0;
    for (let i = match.index; i < code.length; i += 1) {
      if (code[i] === "{") depth += 1;
      else if (code[i] === "}") depth -= 1;
      else if (code[i] === ">" && depth === 0) {
        tags.push(code.slice(match.index, i + 1));
        break;
      }
    }
  }
  return tags;
};
const hiddenButtonClasses = new Map();
for (const file of files.filter((path) => path.endsWith(".tsx"))) {
  for (const tag of buttonTags(read(file))) {
    if (!/\shidden(?:=|\s|>)/.test(tag)) continue;
    const classes = tag.match(/className="([^"]+)"/)?.[1].split(/\s+/) ?? [];
    for (const name of classes) hiddenButtonClasses.set(name, [...(hiddenButtonClasses.get(name) ?? []), relative(src, file).replace(/\\/g, "/")]);
  }
}
assert.ok(hiddenButtonClasses.has("primary-button") && hiddenButtonClasses.has("secondary-button"), "Pages hide primary and secondary buttons with the hidden attribute (the case this fix is for)");
for (const { file, selectors, displays } of cssRules) {
  if (!displays.some((value) => visible(value) && /!important/.test(value))) continue;
  for (const selector of selectors) {
    // The element the rule styles is its last compound selector.
    const target = selector.split(/[\s>+~]+/).pop() ?? "";
    for (const [name, pages] of hiddenButtonClasses) {
      assert.ok(!new RegExp(`\\.${name}(?![\\w-])`).test(target), `${file}: ${selector} sets a visible display with !important on .${name}, which would show the hidden button on ${[...new Set(pages)].join(", ")}`);
    }
  }
}
pass(`No !important display rule can bring back a hidden button (${hiddenButtonClasses.size} classes checked)`);

console.log(`${passed} hidden-control groups passed.`);
