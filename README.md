# AURA

Agent-Usable Resource Assertion.
This repo is the small AURA 2.0 core for deriving, validating, and publishing the machine-actionable surface of a site from existing local machine-readable inputs.
It is a small open compiler, not a hosted platform or heavy framework.

The repo stays a one-package workspace on purpose: docs, examples, and scenario tests live at the root, while the releasable core stays isolated in `packages/aura-protocol`.

## Two-command flow

```bash
pnpm install
pnpm build

node packages/aura-protocol/dist/cli/aura-protocol.js derive examples/minimal-site/source/openapi.json
node packages/aura-protocol/dist/cli/aura-protocol.js publish examples/minimal-site/.derived/aura-v2.json --out examples/minimal-site/dist
```

`derive` writes a sibling `.derived/aura-v2.json` by default.
`publish` writes `dist/.well-known/aura.json` plus one detail file per action under `dist/.well-known/aura/actions/`.
The committed examples keep only source inputs; generated `.derived/` and `dist/` output is local and ignored.

## Supported inputs today

- local OpenAPI JSON
- local AURA v1 JSON
- existing local AURA 2.0 JSON

## What this repo does

- derives a small AURA 2.0 document centered on `actions[]`
- normalizes ugly source names into stable semantic keys such as `post.publish` and `session.login`
- keeps semantic `key` stable and adds a collision-safe `id` when two source actions normalize to the same meaning
- preserves raw source names under `aliases` and `origin`
- validates derived and published output with JSON Schema
- publishes a small well-known index plus per-action detail files

## Examples

- `examples/minimal-site`: local OpenAPI input
- `examples/upgrade-from-v1`: local AURA v1 input

## What this repo does not do

- it does not crawl the web
- it does not automate browsers
- it does not host a remote bridge or index
- it does not sign published surfaces
- it does not ship a demo server or demo client

## Release truth

This repo is tagged `v2.0.0-alpha.1` and the package version is `aura-protocol@2.0.0-alpha.1`.
The schema identifiers are pinned to that Git tag, so derived and published artifacts resolve against this exact 2.0 alpha schema release even as `main` moves.
The npm package may still resolve the older 1.x line until the 2.0 package release is published, so use the repo-local CLI build for this repo state.

## For v1 users

AURA v1 treated `resources` and `capabilities` as the authored center.
AURA 2.0 does not.

In this repo now:

- v1 manifests are accepted as migration input, not the primary authored form
- `resources` and `capabilities` are converted into `actions[]`
- `AURA-State` is no longer a central repo concept
- the public semantic key is normalized instead of copied raw from `capabilityId` or `operationId`

The migration log for this refactor is in `docs/migration/v1-to-v2-plan.md`.

## Docs

- `docs/spec/aura-v2-core.md`: compact action-first shape note
- `docs/rationale/semantic-normalization.md`: normalization rules
- `docs/rationale/architecture-seams.md`: where the core stops
- `docs/migration/v1-to-v2-plan.md`: refactor log

## Validate locally

Run the two-command flow first so the generated files exist.

```bash
node packages/aura-protocol/dist/cli/aura-protocol.js validate examples/minimal-site/.derived/aura-v2.json
node packages/aura-protocol/dist/cli/aura-protocol.js validate examples/minimal-site/dist/.well-known/aura.json
```

## Why this changed

Earlier repo shapes mixed v1-centered concepts with demo-platform weight.
This repo now stays smaller and more truthful: derive action semantics from local machine-readable inputs, validate them, publish a compact well-known action surface, and leave heavier systems to separate repos.

## License

MIT
