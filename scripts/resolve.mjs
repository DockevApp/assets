// Which logo an image gets, by the same rules the app uses:
//
//   node scripts/resolve.mjs ubuntu/squid ghcr.io/acme/api:1.2 bitnami/redis
//
// Reads dist/index.json, so build first.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ROOT } from "./lib.mjs";

const index = JSON.parse(await readFile(join(ROOT, "dist", "index.json"), "utf8"));

/** `ghcr.io/acme/api:1.2@sha256:…` → `acme/api`; `library/nginx` → `nginx`. */
export function repoPath(image) {
  let ref = image.split("@")[0];
  const colon = ref.lastIndexOf(":");
  if (colon > ref.lastIndexOf("/")) ref = ref.slice(0, colon);
  const parts = ref.split("/");
  // A first component with a dot or a port, or `localhost`, is a registry host.
  if (parts.length > 1 && (/[.:]/.test(parts[0]) || parts[0] === "localhost")) parts.shift();
  if (parts[0] === "library") parts.shift();
  return parts.join("/").toLowerCase();
}

/** Most specific first: the whole path, the product (last component), the publisher (first component). */
export function resolve(image) {
  const path = repoPath(image);
  const parts = path.split("/");
  const tries = [
    ["path", index.image.names[path]],
    ["product", index.image.names[parts.at(-1)]],
    ["publisher", parts.length > 1 ? index.image.namespaces[parts[0]] : undefined],
  ];
  const hit = tries.find(([, brand]) => brand);
  return hit ? { image, path, by: hit[0], brand: hit[1], ...index.brands[hit[1]] } : { image, path, brand: null };
}

for (const image of process.argv.slice(2)) {
  const r = resolve(image);
  console.log(r.brand ? `${image}  →  ${r.brand} (by ${r.by}; ${r.colour}, ${r.source})` : `${image}  →  no logo (the list's own icon)`);
}
