# Contributing

This repo is intentionally small. Contributions should keep it small.

## Scope

Prefer changes that improve the AURA core:

- action-first schema clarity
- local derive and publish workflows
- small well-known publish surfaces
- validation quality
- scenario-first tests
- honest documentation

Do not add:

- demo apps
- remote crawl stacks
- browser automation
- hosted services
- large unfinished subsystems
- roadmap placeholder code

## Development

```bash
pnpm install
pnpm build
pnpm test --run
```

## Standards

- keep code explicit and lightweight
- prefer deletion over abstraction
- prefer future seams over bundled platform code
- add scenario tests for user-facing behavior
- update docs when behavior changes

## Pull requests

- explain the user-facing change
- include tests or scenario coverage
- keep unsupported work clearly out of scope
