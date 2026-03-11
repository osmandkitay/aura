# AGENTS

## Mission

Keep this repo as a small AURA core for deriving and publishing the machine-actionable surface of a site.

## Hard boundaries

Do not add:

- demo servers or demo clients
- crawl subsystems
- browser automation
- hosted bridge, index, or signing systems
- remote service wrappers
- large unfinished platform code

## Preferred workflow

1. keep changes inside `packages/aura-protocol`, `examples`, and focused docs
2. preserve the two-command story: `derive` then `publish` to a small well-known surface
3. prefer action semantics over raw endpoint naming
4. preserve provenance in `aliases` and `origin`
5. validate behavior with scenario tests before calling work done

## Required checks

```bash
pnpm install
pnpm build
pnpm test --run
```

## Docs to keep aligned

- `README.md`
- `docs/spec/aura-v2-core.md`
- `docs/rationale/semantic-normalization.md`
- `docs/rationale/architecture-seams.md`
- `docs/migration/v1-to-v2-plan.md`
