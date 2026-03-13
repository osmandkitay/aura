# aura-protocol

`aura-protocol` is the small AURA 2.0 core package in this repo.
AURA 2.0 is the mainline.
It derives, validates, and publishes action surfaces from local files.
It keeps semantic keys clean and publishes durable action locators from source identity facts.
It is a compiler and publisher, not a hosted runtime or framework.

## Consume AURA Without The Package

Published AURA is web-native.
Consumers fetch `/.well-known/aura.json` and the linked action detail files directly from a site; they do not need to install `aura-protocol`.

## Package Release Truth

This source tree tracks `aura-protocol@2.0.0-alpha.1`.
On March 13, 2026, npm still exposes only the 1.x line (`1.0.0` through `1.0.5`), so plain `npx aura-protocol` does not yet run this 2.0 code.

When a 2.0 package release exists, pin the exact version:

```bash
npx aura-protocol@2.0.0-alpha.1 derive <input>
npx aura-protocol@2.0.0-alpha.1 publish <derived-aura-v2.json> --out <dir>
npx aura-protocol@2.0.0-alpha.1 validate <file>
```

Those exact-version commands describe the intended package distribution path, but they are not valid on npm yet for this repo state.

## Repo-Local Build For This Repo State

```bash
pnpm install
pnpm build

node packages/aura-protocol/dist/cli/aura-protocol.js derive examples/minimal-site/source/openapi.json
node packages/aura-protocol/dist/cli/aura-protocol.js publish examples/minimal-site/.derived/aura-v2.json --out examples/minimal-site/dist
node packages/aura-protocol/dist/cli/aura-protocol.js validate examples/minimal-site/dist/.well-known/aura.json
```

Generated `.derived/` and `dist/` output is local and ignored.
Source inputs are finalized by the core during derive.
Existing AURA 2.0 input is accepted only if its `actions[]` order and `id` values already match the canonical finalized result; `publish` preserves that truth and does not repair malformed documents.

## Supported Inputs

- local OpenAPI JSON
- existing local AURA 2.0 JSON that already uses canonical finalized action order and canonical finalized IDs

## Package Assets

- `dist/aura-v2.schema.json`
- `dist/aura-action.schema.json`
- `dist/aura-publish.schema.json`

## Scope

This package does not crawl, automate browsers, or host remote services.
It only derives, validates, and publishes the machine-actionable surface described by local input files.
Collision groups publish through `key__<hash>` locators derived from stable source identity facts rather than numeric renumbering or full representation hashes.
Existing AURA 2.0 documents are treated as already-finalized truth only when their action order and ids already match the core's canonical stable finalization rules.
Default derived and published artifacts are repo-path-free: they keep portable provenance, but omit local file traces such as `source.file` and `origin.file`.
Future crawl, bridge, index, or signing systems should consume these artifacts from separate repos.

Earlier manifest formats are part of AURA history, not part of the active 2.0 core contract.
