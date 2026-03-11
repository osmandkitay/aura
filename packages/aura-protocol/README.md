# aura-protocol

`aura-protocol` is the small core package in this repo.
It derives AURA 2.0 action documents from local source files and publishes a small action index plus per-action detail files.
It is the compiler and publish surface for this repo, not a hosted runtime or platform framework.

## Repo-local usage

This repo currently tracks the unreleased `aura-protocol@2.0.0-alpha.1` line.
Use the repo-local CLI build from the repo root:

```bash
pnpm install
pnpm build

node packages/aura-protocol/dist/cli/aura-protocol.js derive examples/upgrade-from-v1/source/aura-v1.json
node packages/aura-protocol/dist/cli/aura-protocol.js publish examples/upgrade-from-v1/.derived/aura-v2.json --out examples/upgrade-from-v1/dist
node packages/aura-protocol/dist/cli/aura-protocol.js validate examples/upgrade-from-v1/dist/.well-known/aura.json
```

## Package usage

The matching 2.0 alpha package is not assumed to be published yet.
Until it is, plain `npx aura-protocol` may resolve an older 1.x registry release instead of this repo state.

## Supported inputs

- AURA v1 manifest JSON
- local OpenAPI JSON
- existing AURA 2.0 JSON

## Package assets

- `dist/aura-v2.schema.json`
- `dist/aura-action.schema.json`
- `dist/aura-publish.schema.json`

The derived documents currently use repo-hosted schema URLs so the schema identifiers match what this repo actually ships today.

## Scope

This package does not crawl, automate browsers, or host remote services.
It only derives, validates, and publishes the machine-actionable surface described by local input files.
Future crawl, bridge, index, or signing systems should consume these artifacts from separate repos.
