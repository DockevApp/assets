// Shared helpers for the sources and the build: cached downloads and SVG checks.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache");
/** A cached 404, so a missing file isn't asked for again. */
const NOT_FOUND = "<!-- 404 -->";

/**
 * GET `url` as text, cached under .cache/<key> (sources are pinned, so a
 * cached copy never goes stale). `null` on 404.
 */
export async function fetchCached(key, url) {
  const file = join(CACHE, key);
  try {
    const hit = await readFile(file, "utf8");
    return hit === NOT_FOUND ? null : hit;
  } catch {}
  const res = await fetch(url, { headers: { "User-Agent": "dockev-assets" } });
  if (res.status === 404) {
    await save(file, NOT_FOUND);
    return null;
  }
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const text = await res.text();
  await save(file, text);
  return text;
}

async function save(file, text) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
}

/** Lower-case letters and digits only: how brand names are compared across sources. */
export const normalize = (name) =>
  name
    .toLowerCase()
    .replaceAll("+", "plus")
    .replaceAll(".", "dot")
    .replaceAll("&", "and")
    .normalize("NFD")
    .replace(/[^a-z0-9]/g, "");

/** How many distinct colours an SVG paints with; gradients count as many. */
export function colourCount(svg) {
  const s = svg.toLowerCase();
  if (s.includes("gradient")) return Infinity;
  const found = s.matchAll(/(?:fill|stop-color)\s*[:=]\s*"?\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\)|[a-z]+)/g);
  const colours = new Set([...found].map((m) => m[1]));
  for (const ignored of ["none", "currentcolor", "inherit", "transparent"]) colours.delete(ignored);
  return colours.size;
}
