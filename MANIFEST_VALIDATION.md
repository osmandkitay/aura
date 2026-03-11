# AURA Validation

This repo validates two AURA 2.0 artifacts:

- a full derived document
- a published action index under `/.well-known/aura.json`

## Repo-local CLI

```bash
pnpm build
node packages/aura-protocol/dist/cli/aura-protocol.js derive examples/minimal-site/source/openapi.json
node packages/aura-protocol/dist/cli/aura-protocol.js validate examples/minimal-site/.derived/aura-v2.json
node packages/aura-protocol/dist/cli/aura-protocol.js publish examples/minimal-site/.derived/aura-v2.json --out examples/minimal-site/dist
node packages/aura-protocol/dist/cli/aura-protocol.js validate examples/minimal-site/dist/.well-known/aura.json
```

Use the repo-local CLI here.
The generated `.derived/` and `dist/` output is local and ignored.
The matching 2.0 package line is not assumed to be published yet.

## Schemas

- `packages/aura-protocol/schema/aura-v2.schema.json`
- `packages/aura-protocol/schema/aura-action.schema.json`
- `packages/aura-protocol/schema/aura-publish.schema.json`

## What validation checks

- the action-first document shape
- semantic key and action id format
- publish index shape
- per-action detail file shape

## What validation does not do

- crawl remote sites
- infer missing auth flows
- prove server behavior matches the action surface
