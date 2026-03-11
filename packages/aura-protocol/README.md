# aura-protocol

`aura-protocol` is the small AURA 2.0 core package in this repo.
It derives, validates, and publishes action surfaces from local files.
It is an open compiler, not a hosted runtime or platform framework.

## Repo-local usage

This repo tracks `aura-protocol@2.0.0-alpha.1`.
Use the repo-local CLI from the repo root:

```bash
pnpm install
pnpm build

node packages/aura-protocol/dist/cli/aura-protocol.js derive examples/minimal-site/source/openapi.json
node packages/aura-protocol/dist/cli/aura-protocol.js publish examples/minimal-site/.derived/aura-v2.json --out examples/minimal-site/dist
node packages/aura-protocol/dist/cli/aura-protocol.js validate examples/minimal-site/dist/.well-known/aura.json
```

Generated `.derived/` and `dist/` output is local and ignored.

## Supported inputs

- local OpenAPI JSON
- local AURA v1 JSON
- existing local AURA 2.0 JSON

## Release truth

This repo is tagged `v2.0.0-alpha.1`.
The 2.0 schema URLs are pinned to that Git tag so generated artifacts resolve against this exact schema release.
The npm package may still resolve older 1.x code until the 2.0 package line is published, so plain `npx aura-protocol` may not match this repo state yet.

## Package assets

- `dist/aura-v2.schema.json`
- `dist/aura-action.schema.json`
- `dist/aura-publish.schema.json`

## Scope

This package does not crawl, automate browsers, or host remote services.
It only derives, validates, and publishes the machine-actionable surface described by local input files.
Future crawl, bridge, index, or signing systems should consume these artifacts from separate repos.
