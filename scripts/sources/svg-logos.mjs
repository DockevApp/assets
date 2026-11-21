// SVG Logos (gilbarbara/logos): full-colour marks, CC0. No releases, so a commit pins it.
import { fetchCached } from "../lib.mjs";

const COMMIT = "b9edc65f8946027cb5e2fe6c772e914cf3649fba";

export default {
  id: "svg-logos",
  name: "SVG Logos",
  homepage: "https://github.com/gilbarbara/logos",
  version: COMMIT.slice(0, 7),
  license: "CC0-1.0",
  /** Only brands the catalog names here (`sources.svgLogos`): its file names follow no scheme. */
  catalogKey: "svgLogos",
  explicitOnly: true,

  async logo(name) {
    const url = `https://raw.githubusercontent.com/gilbarbara/logos/${COMMIT}/logos/${name}.svg`;
    const svg = await fetchCached(`svg-logos/${COMMIT}/${name}.svg`, url);
    return svg && { svg, colour: "full", license: this.license, url };
  },
};
