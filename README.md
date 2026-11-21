# Dockev assets

The brand logos Dockev shows for well-known images (nginx, postgres, redis, …),
built from pinned open sources into a small, versioned set the app downloads
on demand. Hosting them here means the app depends on no one else's repo
staying up.

## Layout

```
logos/catalog.json     brand → its name, the images that show it, where its logo comes from (edit this)
scripts/build.mjs      picks each brand's best logo, writes dist/
scripts/resolve.mjs    which logo an image gets, by the app's rules
scripts/format.mjs     rewrites the catalog: sorted, one brand per line
scripts/sources/*.mjs  one module per source
scripts/lib.mjs        cached downloads, shared checks
dist/                  the published output (committed)
  index.json           image name / namespace → brand, brand → name, logo file, hash, colour, licence
  logos/<brand>.svg    one cleaned SVG per brand
  CREDITS.md           source and licence of every logo
.cache/                downloads (ignored; makes rebuilds offline)
.github/workflows/     Build and release: checks dist/, tags and publishes releases
```

## Build

```sh
npm run build        # or: node scripts/build.mjs
```

Node 20+, no dependencies. It prints how many brands each source supplied,
which brands fell back to a later source and why, and which have no logo.

## How a logo is chosen

Each brand takes the first logo that passes the checks, trying the sources in
the order of `SOURCES` in `scripts/build.mjs`:

1. **SVG Logos** (full colour, CC0) — only where the catalog names a file (`sources.svgLogos`).
2. **theSVG** (full colour, licence per logo) — only genuinely multi-colour logos.
3. **Simple Icons** (single colour, CC0) — painted in the brand colour.
4. **theSVG** (single colour) — for brands Simple Icons doesn't have.

A logo is refused (and the next source tried) when it is:
- a **wordmark**: wider than 1.6 : 1, unreadable in a small square;
- **over 32 KB**;
- not a plain drawing: scripts, embedded images or external links;
- under a licence that doesn't allow redistribution (theSVG: only CC0, MIT,
  Apache-2.0, BSD and ISC are taken).

Kept logos are stripped of titles, comments and fixed sizes, so they scale.

## Add a brand

Add a line to `logos/catalog.json`, then `npm run format` to sort it in:

```json
"valkey": { "name": "Valkey", "image": { "names": ["valkey/valkey"] } },
"ubuntu": { "name": "Ubuntu", "image": { "names": ["ubuntu"], "namespaces": ["ubuntu"] } },
"kafka":  { "name": "Apache Kafka", "image": { "names": ["kafka"] }, "sources": { "slug": "apachekafka", "svgLogos": "kafka-icon" } }
```

- **The key** is the brand id: the product's plain name. It's also the logo's
  file name (`dist/logos/kafka.svg`).
- **`name`** is how the brand is shown (CREDITS.md, the app).
- **`image`** says which images show the logo. These are OCI image names, so
  they match the same way on Docker, Podman, Apple container or Kubernetes:
  - `names`: the last path component (`redis`), or the whole path for a
    namespaced image (`langgenius/dify-api`). A name belongs to one brand
    only; the build stops on a duplicate.
  - `namespaces` (optional): publishers, the first path component. With
    `"namespaces": ["ubuntu"]`, `ubuntu/squid` shows Ubuntu. Bare names only,
    no wildcards, since loose matching shows wrong brands (`*squid*` would hit
    TurboSquid). A brand can have namespaces and no names.
- **`sources`** (optional) says where the logo comes from, when the brand id
  isn't enough:
  - `slug`: the name theSVG and Simple Icons know it by (`apachekafka`,
    `nodedotjs`). Both use Simple Icons' slugs.
  - `svgLogos`: the SVG Logos file. That source is only used when this is set,
    because its file names follow no scheme.
  - `thesvg` / `simpleIcons`: a name for just that source, when it differs
    from `slug`.

The build stops on a misspelt field or a brand with no `name`.

Then build, look at the new file in `dist/logos/`, and check images resolve:

```sh
node scripts/resolve.mjs ubuntu/squid bitnami/redis ghcr.io/acme/api:1.2
```

## How an image finds its logo

The app strips the registry host, tag, digest and `library/`
(`docker.io/library/postgres:16` → `postgres`), then tries, most specific first:

1. the **whole path** in `image.names` (`langgenius/dify-api`);
2. the **last component** in `image.names`, the product (`bitnami/redis` → redis,
   `ubuntu/nginx` → nginx);
3. the **first component** in `image.namespaces`, the publisher (`ubuntu/squid` → Ubuntu);
4. otherwise no logo: the app shows the list's own icon.

`scripts/resolve.mjs` is the reference for these rules; the app follows it.

## Add a source

Write `scripts/sources/<name>.mjs` exporting an object (or a function
returning one) with:

```js
{
  id, name, homepage, version, license,   // shown in index.json and CREDITS.md
  catalogKey,                             // field in `sources` that names the brand for it
  explicitOnly,                           // optional: only when the catalog names it
  async logo(name) {                      // null when the source has no such logo
    return { svg, colour: "full" | "mono", hex, license, url };
  },
}
```

Pin it to a release, tag or commit, download through `fetchCached`, and add it
to `SOURCES` in the order it should be preferred.

## Publish

1. Bump `version` in `package.json`:
   - **minor or patch** (`1.0.0` → `1.1.0`) for new brands, image names or
     better logos;
   - **major** (`1.x` → `2.0.0`) only when `index.json` changes in a way
     installed apps can't read: a field removed, renamed or changed in meaning.
2. `npm run format && npm run build`, and check `dist/`.
3. Commit and push to `main`.

The `Build and release` workflow (`.github/workflows/build-and-release.yml`) does the rest:
- **check**, on every pull request and push: fails if the catalog isn't
  formatted or `dist/` isn't exactly what the build makes, so `dist/` never
  drifts from the catalog.
- **release**, on a push to `main` whose version has no tag yet: tags
  `v<version>`, publishes a GitHub release, and asks jsDelivr to pick it up
  right away. A push without a version bump releases nothing.

Never move or delete a published tag: apps fetch logos by tag.

**How the app picks a release.** It asks jsDelivr for the newest release of
its major version, `https://cdn.jsdelivr.net/gh/DockevApp/assets@1/dist/index.json`,
so a `v1.x.x` tag reaches users without an app update, and a `v2.0.0` never
reaches apps built for `1`. Logos then come from the exact tag in that index
(`@v1.1.0/dist/logos/…`). If jsDelivr is down, the app uses GitHub
(`raw.githubusercontent.com/DockevApp/assets/v<version>/dist/…`) at the last
release it knows. Neither is the GitHub API, so there's no API rate limit.

- **When users see a release:** within a day, since the app asks for a newer
  index once a day (the release job has already refreshed jsDelivr). A logo is only
  downloaded again when its `hash` changes.
- **A failed or broken download** never blanks the icons: the app keeps its
  last good `index.json`.

## Licences

The build scripts are yours to license. The logos keep their sources'
licences (see `dist/CREDITS.md`) and are trademarks of their owners, shown
only to identify the software an image runs.
