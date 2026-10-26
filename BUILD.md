# Building from source

This document explains how to rebuild the packaged extension from a source
checkout. No step fetches anything over the network beyond `npm ci`.

## Prerequisites

- Node.js 22 (or any Node LTS supported by [WXT](https://wxt.dev/))
- npm
- Python 3 with only the standard library (it packages the engine)

## Standard build

```sh
npm ci
npm run build:firefox   # .output/firefox-mv3
npm run build           # .output/chrome-mv3
```

Distribution packages:

```sh
npm run zip:firefox     # AMO-ready Firefox zip (web-ext build)
npm run zip             # Chrome zip
```

Verification used in CI:

```sh
npm run lint            # biome
npm test                # unit tests (vitest)
npm run smoke:engine    # Node-side engine round trip
npx web-ext lint --source-dir .output/firefox-mv3
```

## About the vendored engine

The French engine (rules, spell checker, dictionaries) comes from the
[Grammalecte](https://grammalecte.net/) project and is vendored as its own
JavaScript build output. It is never edited in this repository.

To refresh it:

1. Obtain a Grammalecte source tree yourself (an archive or a git checkout of
   a mirror). Nothing in this repository fetches it for you.
2. Run:

   ```sh
   python3 scripts/update_engine.py --from /path/to/grammalecte
   ```

   The script runs Grammalecte's own build, copies the JavaScript files into
   `src/engine/grammalecte/` and the runtime data into `public/grammalecte/`,
   generates `src/engine/grammalecte/_generated/engine_bundle.js` (a plain
   concatenation of the engine files in the import order of upstream's
   `gce_worker.js`, plus stub modules for upstream's Node-only CommonJS
   fallbacks, which are dead code in a browser), and records the engine
   version and provenance in `public/grammalecte/ENGINE_VERSION.json`.
3. Review the diff and commit.

## Layout notes for reviewers

- `src/engine/grammalecte/`: vendored engine. Files are unmodified upstream
  output except for the `_generated/` directory (bundle and stubs described
  above).
- `src/engine/glue/`: engine initialization (async data loading for MV3,
  replicating upstream's `gce_worker.js` steps) and the offset mapping
  between page text and the engine's normalized text.
- `src/content/`: in-page layer (field detection, mirror measurement,
  underline rendering, popover and review panel).
- `src/entrypoints/`: background (engine host, request router, toolbar
  badge), content script, popup, options page.
- The runtime reads only files packaged inside the extension; there is no
  network request at runtime.
