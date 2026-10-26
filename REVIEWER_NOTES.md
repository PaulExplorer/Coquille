# Notes for reviewers

Thank you for reviewing Coquille. This file summarizes what submitter-facing
context you may need; it can also be pasted into the store submission notes.

## What the extension does

Coquille checks French spelling and grammar inside the text fields of any
web page (`textarea`, single-line inputs, contenteditable hosts). Detected
issues get an inline wavy underline (red for spelling, yellow for grammar,
blue for style and typography); clicking an underline opens a suggestion
popover, and a summary circle on the field opens a review panel listing all
findings. Corrections are applied through the browser's native editing
pipeline (the same path as ordinary typing, so undo works).

## Engine provenance

The checking engine is the French [Grammalecte](https://grammalecte.net/)
engine, GPL-3.0-or-later, vendored as its own JavaScript build output. The
`update_engine.py` packaging script and the bundle layout are documented in
`BUILD.md`; the engine version and the source path of the vendored build are
recorded in `public/grammalecte/ENGINE_VERSION.json`. The engine files are
unmodified upstream output; a generated `_generated/engine_bundle.js` joins
them for bundler consumption, and `_generated` stub modules only satisfy
bundler resolution of upstream's Node-only CommonJS fallbacks, which are
dead code in a browser.

## No network activity, no data collection

- The extension declares `data_collection_permissions: none` and collects
  nothing.
- All analysis is local. The engine and its dictionaries are packaged inside
  the extension; at runtime the extension makes **zero** network requests.
- There is no remote code, no eval, no analytics, no telemetry.

## Permission justification

- `<all_urls>`: the product requirement is to underline text in the text
  fields of any page where users write in French. This is the same
  requirement the original Grammalecte extension has. Nothing else on the
  page is modified.
- `storage`: persists user settings (disabled sites, ignored words, ignored
  rules) locally in the browser.

## Suggested manual check

1. Open any page with a text field and type a sentence containing French
   mistakes, for example: `Je suit content, Egallement il son partit.`
2. The field shows wavy underlines and a circle with a count at the field's
   top-right corner.
3. Click an underline: the popover offers replacements; applying one rewrites
   the field through the native editing pipeline and re-analyzes it.
4. Click the circle: the review panel lists all findings with category
   counters.
5. The toolbar icon shows the per-tab error count; the popup and the options
   page allow disabling the extension globally or per site.

## web-ext lint status

`npx web-ext lint --source-dir .output/firefox-mv3` reports 0 errors,
0 notices and 4 warnings, all accounted for:

- `KEY_FIREFOX_UNSUPPORTED_BY_MIN_VERSION` and
  `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION` (manifest.json): the
  `data_collection_permissions` key needs Firefox 142 while the declared
  `strict_min_version` is 128. This is intentional: the key is silently
  ignored by earlier Firefox versions, so the choice is full ESR
  compatibility plus forward declaration of "no data collection" rather
  than excluding Firefox ESR users.
- `UNSAFE_VAR_ASSIGNMENT` (chunks/jsx-runtime-*.js, twice): the value of
  `textContent`-like generated code paths inside React's bundled JSX
  runtime (`dangerouslySetInnerHTML` support in the framework itself, not
  in project code). The project never assigns `innerHTML`; a repository
  search for `innerHTML` outside the vendored engine shows only benign
  uses (none).

