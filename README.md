# AURA

AURA is the machine-actionable surface of the web.
This repo is a small core for deriving and publishing that surface from local source files.
It is action-first, schema-backed, and intentionally narrow.

The repo stays a one-package workspace on purpose: docs, examples, and scenario tests live at the root, while the releasable core stays isolated in `packages/aura-protocol`.
This repo currently tracks the unreleased `aura-protocol@2.0.0-alpha.1` line, so the supported commands below use the repo-local CLI build rather than plain `npx aura-protocol`.
The published output is a compact well-known discovery artifact: useful on its own today, and small enough for future action catalogs or read-surface tooling to consume later without those systems living here.

## Two-command quickstart

```bash
pnpm install
pnpm build

node packages/aura-protocol/dist/cli/aura-protocol.js derive examples/upgrade-from-v1/source/aura-v1.json
node packages/aura-protocol/dist/cli/aura-protocol.js publish examples/upgrade-from-v1/.derived/aura-v2.json --out examples/upgrade-from-v1/dist
```

After `publish`, the example output lives at:

- `examples/upgrade-from-v1/dist/.well-known/aura.json`
- `examples/upgrade-from-v1/dist/.well-known/aura/actions/*.json`

## What the core does

- derives a small AURA 2.0 document centered on `actions[]`
- normalizes ugly source names into stable semantic keys such as `post.publish` and `session.login`
- keeps semantic `key` stable and adds a collision-safe `id` when two source actions normalize to the same meaning
- preserves raw source names under `aliases` and `origin`
- validates derived and published output with JSON Schema
- publishes a small index plus per-action detail files

## Supported inputs today

- local AURA v1 JSON
- local OpenAPI JSON
- existing local AURA 2.0 JSON

Current scope is local-file workflows only.
Remote crawling, remote URL discovery, and browser automation are deliberately not implemented here.

## Minimal shape

```json
{
  "$schema": "https://raw.githubusercontent.com/osmandkitay/aura/main/packages/aura-protocol/schema/aura-v2.schema.json",
  "protocol": "AURA",
  "version": "2.0",
  "site": {
    "name": "Example Site"
  },
  "source": {
    "kind": "openapi"
  },
  "actions": [
    {
      "id": "post.publish",
      "key": "post.publish",
      "title": "Publish a post",
      "intent": {
        "domain": "post",
        "verb": "publish"
      },
      "entrypoint": {
        "type": "http",
        "method": "POST",
        "path": "/posts"
      },
      "origin": {
        "source": "openapi"
      },
      "confidence": {
        "label": "high",
        "score": 0.9,
        "reason": "matched publish vocabulary"
      }
    }
  ]
}
```

The published index is smaller than the derived document.
It keeps only the summary fields needed to discover actions and links each action to a detail file by `id`, so duplicate semantic keys still publish cleanly.

## Examples

- `examples/minimal-site`: local OpenAPI source plus a clean action-first document
- `examples/upgrade-from-v1`: local AURA v1 source plus the upgraded action-first document

## Validation

```bash
node packages/aura-protocol/dist/cli/aura-protocol.js validate examples/minimal-site/aura-v2.json
node packages/aura-protocol/dist/cli/aura-protocol.js validate examples/upgrade-from-v1/dist/.well-known/aura.json
```

Schemas live in `packages/aura-protocol/schema/` and are copied into `dist/` during build.
Their `$schema` identifiers currently resolve to the repo-hosted schema files because the matching 2.0 package line is not yet published.

## For v1 users

AURA v1 treated `resources` and `capabilities` as the authored center.
AURA 2.0 does not.

In this repo now:

- v1 manifests are accepted as migration input, not the primary authored form
- `resources` and `capabilities` are converted into `actions[]`
- `AURA-State` is no longer a central repo concept
- the public semantic key is normalized instead of copied raw from `capabilityId` or `operationId`

The migration log for this refactor is in `docs/migration/v1-to-v2-plan.md`.

## What this repo does not do

- it does not crawl the web
- it does not automate browsers
- it does not host a remote bridge or index
- it does not sign published surfaces
- it does not ship a demo server or demo client
- it does not pretend remote URL support already exists

## Architecture seams

This core is designed so future repos can plug in cleanly without bloating this one:

- new derive adapters can turn more local source formats into AURA 2.0 actions
- separate publish extensions can add docs generation or signing later
- separate crawl, bridge, or index repos can consume the published surface without living in this package

Those seams are documented, not implemented, in this repo.

## Standards posture

The publish surface is intentionally shaped like a web-native well-known document plus linked action detail files.
That keeps AURA compatible with the direction of machine-readable discovery and future action catalogs without claiming that this repo already ships crawling, indexing, skills, or hosted coordination.

## Repo map

- repo root: one-package workspace shell for docs, examples, tests, and CI
- `packages/aura-protocol`: core CLI, schemas, derivation, publish, and validation logic
- `docs/spec/aura-v2-core.md`: compact schema note
- `docs/rationale/semantic-normalization.md`: normalization rules
- `docs/migration/v1-to-v2-plan.md`: refactor log and acceptance notes

## Build locally

```bash
pnpm install
pnpm build
pnpm test --run
```

## Why this changed

Earlier repo shapes centered v1 `resources` and `capabilities` plus demo-oriented flows.
This repo now centers a smaller AURA 2.0 core: derive action semantics from local machine-readable inputs, validate them, and publish a compact well-known action surface.
Heavier systems such as crawling, indexing, bridges, or signing are future consumers of this core, not bundled platform weight inside it.

## License

MIT
