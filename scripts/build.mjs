// Builds dist/: one SVG per brand in logos/catalog.json, the best any source
// has, plus index.json (what the app reads) and CREDITS.md.
//
//   node scripts/build.mjs
//
// Sources are pinned, and every download is cached in .cache/, so a rebuild
// is offline and gives the same files.
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { ROOT } from "./lib.mjs";
import simpleIcons from "./sources/simple-icons.mjs";
import svgLogos from "./sources/svg-logos.mjs";
import thesvg from "./sources/thesvg.mjs";

/**
 * Most preferred first. A brand takes the first logo that passes the checks:
 * full colour (curated, then the wide catalogue), then single colour (the
 * consistent set, then the wide catalogue). A new source goes in here.
 */
const SOURCES = [svgLogos, thesvg({ colour: "full" }), simpleIcons, thesvg({ colour: "any" })];

/** Wider than this reads as a wordmark, not a mark: unreadable in a small square. */
const MAX_ASPECT = 1.6;
const MAX_BYTES = 32 * 1024;
const CONCURRENCY = 8;

const DIST = join(ROOT, "dist");

const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
const catalog = JSON.parse(await readFile(join(ROOT, "logos", "catalog.json"), "utf8")).brands;

checkShape(catalog);

// One brand per image name and per namespace: a second claim is a catalog mistake.
const brandOfName = {};
const brandOfNamespace = {};
for (const [brand, entry] of Object.entries(catalog)) {
  for (const name of entry.image.names ?? []) {
    if (brandOfName[name]) throw new Error(`image "${name}" is listed under both ${brandOfName[name]} and ${brand}`);
    brandOfName[name] = brand;
  }
  for (const namespace of entry.image.namespaces ?? []) {
    if (namespace.includes("/") || namespace.includes("*")) throw new Error(`namespace "${namespace}": a bare publisher name, like "ubuntu"`);
    if (brandOfNamespace[namespace]) throw new Error(`namespace "${namespace}" is claimed by both ${brandOfNamespace[namespace]} and ${brand}`);
    brandOfNamespace[namespace] = brand;
  }
}

/** Stops on a misspelt or misplaced field, which would otherwise just be ignored. */
function checkShape(brands) {
  const allowed = {
    entry: ["name", "image", "sources"],
    image: ["names", "namespaces"],
    sources: ["slug", ...new Set(SOURCES.map((s) => s.catalogKey))],
  };
  const unknown = (where, object) => Object.keys(object).filter((key) => !allowed[where].includes(key));
  for (const [brand, entry] of Object.entries(brands)) {
    const bad = [
      ...unknown("entry", entry),
      ...unknown("image", entry.image ?? {}).map((k) => `image.${k}`),
      ...unknown("sources", entry.sources ?? {}).map((k) => `sources.${k}`),
    ];
    if (bad.length) throw new Error(`${brand}: unknown ${bad.join(", ")}`);
    if (!entry.name) throw new Error(`${brand}: no name`);
    if (!entry.image?.names?.length && !entry.image?.namespaces?.length) throw new Error(`${brand}: no image names or namespaces`);
  }
}

/** The SVG reduced to the drawing, or why it can't be used. */
function clean(raw) {
  let svg = raw
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(title|desc|metadata)\b[\s\S]*?<\/\1>/gi, "")
    .trim();
  const start = svg.indexOf("<svg");
  if (start < 0 || !svg.endsWith("</svg>")) return { reason: "not a single SVG document" };
  svg = svg.slice(start).replace(/>\s+</g, "><");

  // Drawn as an <img> in the app, where none of this runs; refused anyway, so nothing here ever could.
  if (/<script|<foreignObject|<image\b|\son[a-z]+\s*=|(?:xlink:)?href\s*=\s*["'](?!#)/i.test(svg)) {
    return { reason: "scripts, images or external links" };
  }

  const root = svg.slice(0, svg.indexOf(">") + 1);
  const viewBox = root.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  const size = viewBox ?? [null, root.match(/\swidth\s*=\s*["']([\d.]+)/i)?.[1], root.match(/\sheight\s*=\s*["']([\d.]+)/i)?.[1]];
  const [w, h] = [Number(size[1]), Number(size[2])];
  if (!w || !h) return { reason: "no size" };
  if (w / h > MAX_ASPECT) return { reason: `wordmark (${w}×${h})` };

  // Size comes from the viewBox, so the app can scale it freely.
  let head = root.replace(/\s(width|height)\s*=\s*["'][^"']*["']/gi, "");
  if (!viewBox) head = head.replace("<svg", `<svg viewBox="0 0 ${w} ${h}"`);
  svg = head + svg.slice(root.length);

  if (Buffer.byteLength(svg) > MAX_BYTES) return { reason: `too large (${Math.round(Buffer.byteLength(svg) / 1024)} KB)` };
  return { svg };
}

/** The name `source` knows the brand by: its own override, else the shared slug, else the brand id. */
function nameIn(source, brand, sources = {}) {
  return sources[source.catalogKey] ?? (source.explicitOnly ? null : (sources.slug ?? brand));
}

async function pick(brand, entry) {
  const rejected = [];
  for (const source of SOURCES) {
    const name = nameIn(source, brand, entry.sources);
    if (!name) continue;
    const found = await source.logo(name);
    if (!found) continue;
    const { svg, reason } = clean(found.svg);
    if (reason) {
      rejected.push(`${source.id}: ${reason}`);
      continue;
    }
    return { brand, svg, source, found, rejected };
  }
  return { brand, rejected };
}

// A few at a time: polite to the sources on a cold cache.
const brands = Object.entries(catalog);
const results = [];
for (let i = 0; i < brands.length; i += CONCURRENCY) {
  results.push(...(await Promise.all(brands.slice(i, i + CONCURRENCY).map(([brand, entry]) => pick(brand, entry)))));
}

await rm(DIST, { recursive: true, force: true });
await mkdir(join(DIST, "logos"), { recursive: true });

const index = {
  /** The release (tag `v<version>`) these files belong to; the app fetches logos from that tag. */
  version: pkg.version,
  sources: SOURCES.filter((s, i) => SOURCES.findIndex((o) => o.name === s.name) === i).map((s) => ({
    name: s.name,
    version: s.version,
    license: s.license,
    homepage: s.homepage,
  })),
  // Looked up most specific first: the image's whole path, then its last
  // component (the product), then its namespace (the publisher).
  image: {
    /** Image name (last path component, or a whole path) → brand. */
    names: {},
    /** Publisher (the first path component) → brand, for its images no name matches. */
    namespaces: {},
  },
  /** Brand → its logo. `colour: "mono"` logos are painted in `hex`; `hash` changes when the file does. */
  brands: {},
};

const credits = [];
const missing = [];
for (const r of results) {
  if (!r.svg) {
    missing.push(`${r.brand}${r.rejected.length ? ` (${r.rejected.join("; ")})` : ""}`);
    continue;
  }
  await writeFile(join(DIST, "logos", `${r.brand}.svg`), r.svg);
  index.brands[r.brand] = {
    name: catalog[r.brand].name,
    file: `logos/${r.brand}.svg`,
    hash: createHash("sha256").update(r.svg).digest("hex").slice(0, 12),
    colour: r.found.colour,
    ...(r.found.hex && { hex: r.found.hex }),
    source: r.source.name,
    license: r.found.license,
  };
  credits.push(`| ${catalog[r.brand].name} | ${r.source.name} ${r.source.version} | ${r.found.license} | ${r.found.url} |`);
}
for (const [name, brand] of Object.entries(brandOfName).sort(([a], [b]) => a.localeCompare(b))) {
  if (index.brands[brand]) index.image.names[name] = brand;
}
for (const [namespace, brand] of Object.entries(brandOfNamespace).sort(([a], [b]) => a.localeCompare(b))) {
  if (index.brands[brand]) index.image.namespaces[namespace] = brand;
}

await writeFile(join(DIST, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
await writeFile(
  join(DIST, "CREDITS.md"),
  [
    "# Credits",
    "",
    "Logos are the trademarks of their owners, shown only to identify the software an image runs.",
    "Each file keeps the licence of its source:",
    "",
    "| Brand | Source | Licence | Original |",
    "|---|---|---|---|",
    ...credits.sort(),
    "",
  ].join("\n"),
);

const bySource = {};
for (const b of Object.values(index.brands)) bySource[`${b.source} (${b.colour})`] = (bySource[`${b.source} (${b.colour})`] ?? 0) + 1;
console.log(
  `${Object.keys(index.brands).length}/${brands.length} brands, ${Object.keys(index.image.names).length} image names, ${Object.keys(index.image.namespaces).length} namespaces`,
);
for (const [k, n] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`);
const fellBack = results.filter((r) => r.svg && r.rejected.length).map((r) => `${r.brand} (${r.rejected.join("; ")})`);
if (fellBack.length) console.log(`fell back: ${fellBack.join(", ")}`);
if (missing.length) console.log(`no logo: ${missing.join(", ")}`);
