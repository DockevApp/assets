// Simple Icons: single-colour marks with an official brand colour, CC0. Pinned by npm version.
import { fetchCached, normalize } from "../lib.mjs";

const VERSION = "16.35.0";
const CDN = `https://cdn.jsdelivr.net/npm/simple-icons@${VERSION}`;

let hexBySlug;

export default {
  id: "simple-icons",
  name: "Simple Icons",
  homepage: "https://simpleicons.org",
  version: VERSION,
  license: "CC0-1.0",
  catalogKey: "simpleIcons",

  async logo(name) {
    if (!hexBySlug) {
      const data = JSON.parse(await fetchCached(`simple-icons/${VERSION}/data.json`, `${CDN}/data/simple-icons.json`));
      hexBySlug = new Map(data.map((icon) => [icon.slug ?? normalize(icon.title), icon.hex]));
    }
    const hex = hexBySlug.get(name);
    if (!hex) return null;
    const url = `${CDN}/icons/${name}.svg`;
    const svg = await fetchCached(`simple-icons/${VERSION}/${name}.svg`, url);
    // The file has no colour of its own: paint it the brand colour, so it draws as is.
    return svg && { svg: svg.replace("<svg ", `<svg fill="#${hex}" `), colour: "mono", hex: `#${hex}`, license: this.license, url };
  },
};
