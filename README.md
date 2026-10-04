# ScenarioSeed

A local, no-account tool for generating synthetic API request fixtures and boundary cases from a small JSON Schema subset. Created for LovHack Season 3 during its September 26–October 4, 2026 build period. This is a prototype, not a full OpenAPI/JSON Schema implementation.

## Run

From this directory, run `python3 -m http.server 8765` and open `http://localhost:8765/`. No install or network connection is required after the files are present.

## Workflow

Choose a preset or edit the contract JSON. Generate cases, select a case to see its payload and local validation result, then download JSON or CSV. No entered data leaves the browser. The presets use synthetic identifiers.

Supported schema keywords: `type` (`object`, `array`, `string`, `integer`, `number`, `boolean`), `properties`, `required`, `items`, `enum`, `minLength`, `maxLength`, `minimum`, `maximum`, `minItems`, and `maxItems`. Unsupported keywords are not checked. Object properties are allowed beyond those declared; `additionalProperties` is not implemented. Nested schemas are limited to four levels. The output is deterministic except for the download timestamp.

Generation includes a valid baseline and mutations for missing/optional fields, wrong primitive types, string length bounds, numeric bounds, array size, and enum membership. The included subset validator checks each payload; it is not a separate standards-compliance oracle. Review expected outcomes before using fixtures in production tests.

String lengths count Unicode code points. Numeric bounds may be negative, and all numeric values must be finite so JSON export preserves the payload. Integer baselines respect fractional bounds; numeric boundary mutations are emitted only when a finite outside value is representable. Enums compare JSON values structurally, not by object identity. When a Boolean enum contains both values, no same-type outside-enum case exists. Nested cases visit fields present in the chosen baseline; this is not exhaustive enum or combinatorial coverage. Enum values have a maximum nesting depth of eight. Malformed supported keywords are rejected; unsupported keywords remain unchecked.

## Development checks

The app itself has no package dependency. With Node.js 18 or newer, run `node --test engine.test.mjs` for the engine regression checks. The optional browser export test has a separate development dependency: install Playwright from its official npm package (`npm install --no-save playwright` and `npx playwright install chromium`) before running `node --test browser-export.test.mjs`. Those installations are for a developer's own environment, not needed to open or use the app. No private machine path is required.

## Development disclosure

The product idea, code, interface, and tests were created for this event with OpenAI Codex assistance. No prior project code was reused; only the standard browser and Python static server are needed. The interface was designed from a generated UI concept image, retained in the review folder. This is a distinct developer testing tool and has no contest submission or account registration yet.
