// Rewrites logos/catalog.json in its house style: brands sorted, one per line.
//
//   npm run format
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { ROOT } from "./lib.mjs";

const FILE = join(ROOT, "logos", "catalog.json");
const COMMENT = [
  "brand id → name, which images show its logo, and where the logo comes from. See README.md.",
  "image.names: an image's last path component (redis) or whole path (langgenius/dify-api); image.namespaces: a publisher (ubuntu).",
];
const FIELD_ORDER = ["name", "image", "names", "namespaces", "sources", "slug"];

/** JSON on one line, with spaces, fields in FIELD_ORDER, lists sorted. */
function inline(value) {
  if (Array.isArray(value)) return `[${[...value].sort().map(inline).join(", ")}]`;
  if (value && typeof value === "object") {
    const rank = (key) => (FIELD_ORDER.includes(key) ? FIELD_ORDER.indexOf(key) : FIELD_ORDER.length);
    const keys = Object.keys(value).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    return `{ ${keys.map((k) => `${JSON.stringify(k)}: ${inline(value[k])}`).join(", ")} }`;
  }
  return JSON.stringify(value);
}

const { brands } = JSON.parse(await readFile(FILE, "utf8"));
const lines = Object.keys(brands)
  .sort()
  .map((brand) => `    ${JSON.stringify(brand)}: ${inline(brands[brand])}`);
await writeFile(FILE, `{\n  "$comment": [\n${COMMENT.map((c) => `    ${JSON.stringify(c)}`).join(",\n")}\n  ],\n  "brands": {\n${lines.join(",\n")}\n  }\n}\n`);
