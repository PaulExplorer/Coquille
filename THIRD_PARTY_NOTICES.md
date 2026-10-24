# Third-party notices

## Grammalecte engine

This extension vendors the JavaScript build of the Grammalecte engine
(spelling checker, grammar rules, dictionaries, conjugation and morphology
data), produced from the Grammalecte source tree by its own build scripts
and unmodified apart from bundling.

- Project: <https://grammalecte.net/>
- Copyright: © Olivier R. and the Grammalecte project.
- License: GNU GPL-3.0-or-later (files `graphspell/dawg.py` and related
  build helpers in upstream carry MPL-2.0 headers).
- Vendored content: `src/engine/grammalecte/` (JavaScript), and
  `public/grammalecte/` (dictionary and morphology JSON data). The generated
  `engine_bundle.js` is a concatenation of the engine files in the import
  order of upstream's `gce_worker.js`, with stub modules satisfying
  bundler-side resolution of upstream's Node-only CommonJS fallbacks.
- Upstream acknowledgements are mentioned in the Thank you file of the
  Grammalecte project.

This extension's own code is licensed GPL-3.0-or-later for compatibility.

## Harper (lint framework concepts)

The in-page rendering approach was written for this project while drawing on
the architecture of Harper's `lint-framework` package: mirror elements to
measure text offsets inside form fields, viewport-rect box clipping, and
popover positioning behaviour.

- Project: <https://github.com/Automattic/harper>
- Copyright: © 2024 Automattic Inc.
- License: Apache-2.0. Concepts were reimplemented; no Apache-licensed code
  is reproduced in this repository.

## web-ext

Development-time Firefox add-on packaging tool, used as a devDependency for
AMO-ready zips and linting.

- Copyright: Mozilla contributors, MPL-2.0.
- Used at build time only; not distributed in the extension package.
