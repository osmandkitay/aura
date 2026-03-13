# AURA

Agent-Usable Resource Assertion.
This repo is the small AURA 2.0 core for deriving, validating, and publishing the machine-actionable surface of a site from local machine-readable inputs.
AURA 2.0 is the mainline.
It keeps semantic action keys clean and publishes durable action locators for the open web.
It is a small open compiler, not a hosted product or framework.

The repo stays a one-package workspace on purpose: the releasable core lives in `packages/aura-protocol`, while docs, examples, and scenario tests stay at the root.

## Consume Published AURA

Consumers do not need this repo or package.
If a site publishes AURA, fetch `/.well-known/aura.json` and the linked action detail files directly from the web.

## Contributor Flow In This Repo

On March 13, 2026, npm still exposes only the `aura-protocol` 1.x line (`1.0.0` through `1.0.5`).
That means plain `npx aura-protocol` does not yet match this repo's `2.0.0-alpha.1` source state.

For this repo state, build and run the local CLI:

```bash
pnpm install
pnpm build

node packages/aura-protocol/dist/cli/aura-protocol.js derive examples/minimal-site/source/openapi.json
node packages/aura-protocol/dist/cli/aura-protocol.js publish examples/minimal-site/.derived/aura-v2.json --out examples/minimal-site/dist
node packages/aura-protocol/dist/cli/aura-protocol.js validate examples/minimal-site/dist/.well-known/aura.json
```

`derive` writes a sibling `.derived/aura-v2.json` by default.
`publish` writes `dist/.well-known/aura.json` plus one detail file per action under `dist/.well-known/aura/actions/`.
Source inputs are finalized by the core during derive.
Existing AURA 2.0 input is accepted only if its `actions[]` order and `id` values already match the core's canonical finalized result; `publish` preserves that truth and does not rescue malformed documents.
Generated `.derived/` and `dist/` output is local and ignored.

When a 2.0 package release exists, pin the exact version instead of relying on an unpinned `latest` tag:

```bash
npx aura-protocol@2.0.0-alpha.1 derive <input>
npx aura-protocol@2.0.0-alpha.1 publish <derived-aura-v2.json> --out <dir>
```

Those exact-version commands are the intended package story, but they are not valid on npm yet in this repo state.

## Supported Inputs Today

- local OpenAPI JSON
- existing local AURA 2.0 JSON that already uses canonical finalized action order and canonical finalized IDs

## What This Repo Does

- derives an action-first AURA 2.0 document
- keeps semantic `key` separate from stable locator `id`
- publishes colliding actions through `key__<hash>` locators derived from source identity facts, not renumbered suffixes
- preserves portable provenance in `aliases` and `origin`
- omits local repo file paths such as `source.file` and `origin.file` from default derived and published artifacts
- validates derived and published artifacts with JSON Schema
- enforces canonical finalized action order and canonical finalized IDs for existing AURA 2.0 input instead of silently repairing them
- publishes a small well-known index and per-action detail files
- writes deterministic, human-readable JSON artifacts for clean diffs

## What This Repo Does Not Do

- it does not crawl the web
- it does not automate browsers
- it does not host a bridge, index, or signing service
- it does not ship a demo server or demo client
- it does not add remote runtimes or placeholder extension systems

## Historical Note

Earlier manifest formats are part of AURA history, not part of the active 2.0 core contract.
The original rewrite log is kept in `docs/migration/v1-to-v2-plan.md`.

## Docs

- `docs/spec/aura-v2-core.md`
- `docs/rationale/semantic-normalization.md`
- `docs/rationale/architecture-seams.md`
- `docs/migration/v1-to-v2-plan.md`

## License

MIT
