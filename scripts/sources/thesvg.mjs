// theSVG (glincker/thesvg): the widest catalogue, licence per logo. Pinned by release tag.
// Served from GitHub, not jsDelivr: the repo is over jsDelivr's size limit and fails at random.
import { colourCount, fetchCached, normalize } from "../lib.mjs";

const TAG = "thesvg@4.0.14";
const RAW = `https://raw.githubusercontent.com/glincker/thesvg/${encodeURIComponent(TAG)}`;

/** Only logos whose own licence lets us redistribute them as is. */
const ALLOWED_LICENSES = new Set(["CC0-1.0", "MIT", "Apache-2.0", "BSD-3-Clause", "BSD-2-Clause", "ISC"]);

let byName;

/**
 * `colour: "full"` only takes genuinely multi-colour logos (most of theSVG's
 * defaults are single-colour copies of Simple Icons); `"any"` takes either.
 */
export default function thesvg({ colour }) {
  return {
    id: colour === "full" ? "thesvg" : "thesvg-mono",
    name: "theSVG",
    homepage: "https://thesvg.org",
    version: TAG,
    license: "per logo",
    catalogKey: "thesvg",

    async logo(name) {
      if (!byName) {
        const icons = JSON.parse(await fetchCached(`thesvg/${TAG}/icons.json`, `${RAW}/src/data/icons.json`));
        byName = new Map();
        for (const icon of icons) {
          for (const alias of [icon.slug, ...(icon.aliases ?? [])]) {
            const key = normalize(String(alias));
            if (!byName.has(key)) byName.set(key, icon);
          }
        }
      }
      const icon = byName.get(normalize(name));
      if (!icon || !ALLOWED_LICENSES.has(icon.license)) return null;
      const path = icon.variants.color ?? icon.variants.default;
      if (!path) return null;
      const url = `${RAW}/public${path}`;
      const svg = await fetchCached(`thesvg/${TAG}${path}`, url);
      if (!svg) return null;
      const full = colourCount(svg) >= 2;
      if (colour === "full" && !full) return null;
      return { svg, colour: full ? "full" : "mono", hex: icon.hex ? `#${icon.hex}` : undefined, license: icon.license, url };
    },
  };
}
