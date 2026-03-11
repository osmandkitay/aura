# AURA v1 to v2 Core Refactor Plan

This note freezes the repo's starting point before the AURA 2.0 core rewrite.
It is the running checklist, black-box log, and final review record for this refactor.

## Progress

### Step 0 - Baseline and freeze the current truth

- [x] Read the current README, package layout, CLI entrypoints, schema files, validators, and tests.
- [x] Write a short `docs/migration/v1-to-v2-plan.md` describing what exists today and what will change.
- [x] Identify all places where the repo is demo-driven rather than core-driven.
- [x] Identify all places where `resources`, `capabilities`, and `AURA-State` are central.
- [x] Identify package/workspace references to `reference-server` and `reference-client`.

#### Black box notes

- Current public package(s): `aura-protocol` is the only publishable package. The workspace also contains the private demo packages `aura-reference-server` and `aura-reference-client`.
- Current CLI commands: `aura-protocol` exports only `aura-validate`. The demo client adds `agent`, `crawler`, and `test-workflow`.
- Current demo-heavy files/directories:
  - `packages/reference-server/`
  - `packages/reference-client/`
  - root `README.md` sections for local demo, production demo, OpenAI-bound client usage, and `AURA-State` demo auth flow
  - `.github/workflows/ci.yml`, which builds and boots the demo app stack
  - `TROUBLESHOOTING.md` and `CONTRIBUTING.md`, which both point back to the demo flow
- Current schema pain points:
  - the authored center is `resources` plus `capabilities`, not `actions[]`
  - `AURA-State` is treated as a core concept instead of an optional runtime hint
  - the main schema is permissive and generated indirectly from TypeScript rather than shaped around a small inspectable published artifact
  - semantic identity is raw capability naming such as `create_post`, `get_profile`, and `logout`
  - the CLI validator hard-codes v1 assumptions, including resource-to-capability cross-checks
- Current README lies or outdated claims:
  - it presents a Next.js demo and reference client as the primary way to understand AURA
  - it frames `resources`, `capabilities`, and `AURA-State` as the conceptual center
  - it suggests a broader platform story than the repo actually ships
  - it teaches demo auth setup and OpenAI client flow instead of a small core derive/publish workflow

#### Concrete delete targets

- `packages/reference-server`
- `packages/reference-client`
- demo-only README sections covering local demo, production demo, reference client, and demo auth flow
- CI steps that build, start, or test the deleted demo packages
- demo-only docs that depend on the deleted packages or their workflows

#### Concrete keep targets

- `packages/aura-protocol` as the core package name
- local-file validation as a real part of the workflow, but reshaped around AURA 2.0
- JSON Schema-based validation with Ajv
- a small CLI surface, rewritten around `derive`, `publish`, and validation
- a tiny examples set proving v1 upgrade and a minimal local source derivation path

#### Package and workspace references to remove or rewrite

- root `README.md`
- `.github/workflows/ci.yml`
- `CONTRIBUTING.md`
- `TROUBLESHOOTING.md`
- `packages/reference-server/DEPLOYMENT.md`
- `packages/reference-server/README.md`
- `packages/reference-client/README.md`
- `packages/reference-server/package.json`
- `packages/reference-client/package.json`

#### Central v1 concepts to demote or remove

- `resources` and `capabilities` are required in the root README, TypeScript interfaces, schema generation, validator CLI, and tests
- `AURA-State` is explained in the root README and implemented across the demo server and client
- capability IDs are treated as the public semantic layer in the validator, client planner, demo manifest, and tests

#### Scenario gate

- [x] There is a migration note committed before any destructive rewrite.
- [x] The migration note lists concrete delete targets and concrete keep targets.

### Step 1 - Delete the demo weight

- [x] Remove `packages/reference-server`.
- [x] Remove `packages/reference-client`.
- [x] Remove demo-only docs tied to the reference server/client.
- [x] Remove README sections that depend on the deleted demo flow.
- [x] Clean workspace/package scripts and references.
- [x] Ensure the repo still installs cleanly after deletion.

#### Black box notes

- Deleted paths:
  - `packages/reference-server/`
  - `packages/reference-client/`
  - root `TROUBLESHOOTING.md`
- Scripts removed:
  - all `pnpm --filter aura-reference-server ...` CI steps
  - all `pnpm --filter aura-reference-client ...` CI steps
  - demo server start-and-probe logic from CI
- Dependencies removed:
  - workspace dependencies reachable only from the deleted demo packages, including `next`, `react`, `react-dom`, `openai`, `axios-cookiejar-support`, `dotenv`, `tough-cookie`, `tsx`, `bcryptjs`, `cookie`, and `ajv-formats`
- README sections removed:
  - local demo quickstart
  - production demo flow
  - reference client usage
  - demo auth setup and environment variables
- What remains as the smallest usable core:
  - root workspace shell
  - `packages/aura-protocol`
  - migration notes for the refactor

#### Scenario gate

- [x] `pnpm install` succeeds from repo root.
- [x] `pnpm build` or the equivalent core build succeeds.
- [x] No README instructions mention `aura-reference-server` or `aura-reference-client`.
- [x] No workspace/package file still points to deleted packages.

### Step 2 - Re-center the schema around actions

- [x] Create a new v2 schema draft centered on `actions[]`.
- [x] Remove `resources` and `capabilities` from the main authored path.
- [x] Define the minimal action object shape.
- [x] Add explicit fields for `aliases`, `origin`, and `confidence`.
- [x] Keep extension points sane.
- [x] Preserve a migration path from v1 where useful.

#### Black box notes

- Final action object fields:
  - required: `id`, `key`, `title`, `intent`, `entrypoint`, `origin`, `confidence`
  - optional: `auth`, `confirm`, `risk`, `input`, `result`, `docs`, `aliases`, `extensions`
- Which v1 concepts were dropped:
  - authored `resources`
  - authored `capabilities`
  - `policy` as a primary surface concept
  - `AURA-State` as a central schema concern
- Which v1 concepts were retained only for migration:
  - v1 `resources` and `capabilities` parsing in the derive path
  - v1 `policy.authHint` as a light auth hint during upgrade
  - v1 capability/resource identifiers under `aliases` and `origin`
- How normalized semantic keys are formed:
  - stable `object.verb` keys such as `post.publish` and `session.login`
  - `intent` stores the same semantics as structured `{ domain, verb }`
- Which fields are required vs optional:
  - the top-level derived document requires `$schema`, `protocol`, `version`, `site`, `source`, and `actions`
  - publish output uses a smaller index schema with per-action detail files

#### Scenario gate

- [x] A human can open the schema and understand it in under 2 minutes.
- [x] There is at least one fixture showing a clean action-first document.
- [x] There is at least one fixture showing v1 -> v2 conversion.
- [x] The schema no longer requires `resources` and `capabilities` as the core story.

### Step 3 - Implement semantic normalization

- [x] Add a small canonical intent vocabulary or normalization layer.
- [x] Map ugly/raw names into stable semantic keys when possible.
- [x] Preserve original names under `aliases` or `origin`.
- [x] Add confidence scoring or confidence labels for derived semantics.
- [x] Document the normalization rules.

#### Black box notes

- Normalization rules:
  - match explicit login/logout/account-registration patterns first
  - normalize into `object.verb` keys
  - infer the object from known domain vocabulary or the path
  - fall back to a generic noun plus `perform` when the source name is too vague
- Canonical verbs used:
  - `create`
  - `get`
  - `list`
  - `search`
  - `update`
  - `delete`
  - `publish`
  - `login`
  - `logout`
  - `send`
  - `perform`
- Examples of renamed/raw -> normalized:
  - `registerUser` -> `account.create`
  - `create_post_v3` -> `post.create`
  - `doThingFinal` -> `thing.perform`
- Low-confidence behavior:
  - low-confidence keys remain normalized, but their `confidence.label` becomes `low` and the reason explains the fallback
- Provenance fields retained:
  - `aliases[]`
  - `origin.operationId`
  - `origin.capability`
  - `origin.ref`

#### Scenario gate

- [x] `registerUser` becomes something like `account.create` or `session.register` based on the implemented rules.
- [x] `doThingFinal` does not remain the public semantic key.
- [x] The original raw name is still preserved somewhere machine-readable.
- [x] Low-confidence cases are visibly marked.

### Step 4 - Implement the two-command flow

- [x] Implement `derive` for the selected minimal local inputs.
- [x] Implement `publish` for the derived or source form.
- [x] Make `publish` validate before success.
- [x] Keep CLI help clean and small.
- [x] Ensure the commands work on the example fixtures.

#### Black box notes

- Final CLI commands:
  - `aura-protocol derive <input> [--out <file>] [--stdout]`
  - `aura-protocol publish <input> --out <dir>`
  - `aura-protocol validate <file>`
- Supported inputs in this task:
  - local AURA v1 JSON
  - local OpenAPI JSON
  - existing AURA 2.0 JSON
- Output layout:
  - derive defaults to a sibling `.derived/aura-v2.json`
  - publish writes `/.well-known/aura.json`
  - publish writes `/.well-known/aura/actions/<id>.json`
- Validation path:
  - derived documents validate against `aura-v2.schema.json`
  - per-action detail files validate against `aura-action.schema.json`
  - published indexes validate against `aura-publish.schema.json`
- Known unsupported cases:
  - remote URLs
  - crawling
  - browser automation
  - full OpenAPI edge-case coverage outside the small local subset

#### Scenario gate

- [x] A first-time user can run the documented two commands exactly as written.
- [x] The commands produce a valid publishable output in an example directory.
- [x] The output includes a well-known action index.
- [x] If per-action detail files exist, they are correctly linked.

### Step 5 - Rewrite the README from scratch

- [x] Rewrite README around AURA as the machine-actionable surface of the web.
- [x] Put the two-command story near the top.
- [x] Explain the minimal schema without drowning in internals.
- [x] Explain what is intentionally not part of this repo.
- [x] Add a migration section for v1 users.
- [x] Add a compact architecture section that names future seams without implementing them.

#### Black box notes

- New opening paragraph:
  - AURA is the machine-actionable surface of the web, and this repo is a small core for deriving and publishing that surface from local source files.
- New quickstart commands:
  - `node packages/aura-protocol/dist/cli/aura-protocol.js derive examples/upgrade-from-v1/source/aura-v1.json`
  - `node packages/aura-protocol/dist/cli/aura-protocol.js publish examples/upgrade-from-v1/.derived/aura-v2.json --out examples/upgrade-from-v1/dist`
- What was intentionally omitted:
  - demo server/client flows
  - remote crawling
  - browser automation
  - hosted bridge/index/signing systems
- Migration message for existing users:
  - v1 manifests remain valid as migration input, but the authored center is now `actions[]`
- Future seams documented but not implemented:
  - `docs/rationale/architecture-seams.md`
  - README architecture seams section

#### Scenario gate

- [x] README top section can be understood by a new reader in under 60 seconds.
- [x] README no longer depends on demo app screenshots, demo auth, or OpenAI API setup.
- [x] README clearly says this repo is core-only.
- [x] README does not pretend remote crawling already exists.

### Step 6 - Add scenario-first tests

- [x] Add scenario test scripts or test harnesses that are easy to run.
- [x] Make scenario tests part of CI or the main local test flow.
- [x] Keep them readable.

#### Black box notes

- Scenario test files:
  - `tests/scenarios/repo-shape.test.ts`
  - `tests/scenarios/v1-upgrade.test.ts`
  - `tests/scenarios/two-command.test.ts`
  - `tests/scenarios/normalization.test.ts`
  - `tests/scenarios/collision-stability.test.ts`
  - `tests/scenarios/no-fake-feature.test.ts`
- What each one proves:
  - repo-shape: deleted demo weight stays deleted
  - v1-upgrade: v1 manifests still derive into valid action-first output
  - two-command: the CLI derive/publish story works end to end
  - normalization: ugly names do not leak back into public semantics
  - collision-stability: duplicate semantic meanings keep a clean `key` and publish through unique `id` locators
  - no-fake-feature: forbidden platform creep stays out of the repo
- Which regressions they prevent:
  - accidental reintroduction of demo packages
  - silent breakage in the derive/publish CLI
  - raw `operationId`/`capabilityId` names leaking into public keys
  - browser/crawl/platform dependencies sneaking back in
- Which edge cases remain intentionally unhandled:
  - remote URL inputs
  - full OpenAPI feature coverage
  - runtime auth/session discovery beyond local source hints

#### Scenario gate

- [x] The scenario suite fails if someone reintroduces demo weight.
- [x] The scenario suite fails if someone breaks the two-command story.
- [x] The scenario suite fails if ugly names leak back into public semantics.

### Step 7 - Final hardening pass

- [x] Remove dead files, dead scripts, dead docs, and dead exports.
- [x] Trim dependencies aggressively.
- [x] Add `AGENTS.md` for this repo so future coding agents stay aligned.
- [x] Add a short architecture note describing where future repos plug in.
- [x] Ensure examples are minimal and honest.
- [x] Ensure every remaining file earns its place.

#### Black box notes

- Final dependency reductions:
  - removed the reference-server/client dependency stacks entirely
  - removed `citty`, `kleur`, `ts-node`, `typescript-json-schema`, `axios`, and `node-mocks-http`
  - reduced the runtime core to `ajv` plus workspace TypeScript/vitest tooling
- Final repo shape:
  - one package: `packages/aura-protocol`
  - small `examples/`
  - focused `docs/`
  - scenario tests under `tests/scenarios/`
- Future seams intentionally left open:
  - new derive adapters
  - publish extensions such as docs generation or signing
  - separate crawl, bridge, index, and sign repos
- Why this repo is lighter now:
  - no app stack
  - no OpenAI client
  - no reference runtime
  - no generated v1 schema machinery
  - cleaned package `dist/` output on each build
- What was explicitly deferred:
  - remote URL support
  - crawling
  - browser automation
  - hosted services
  - signing infrastructure

#### Scenario gate

- [x] A reviewer can point to exactly what the repo does in one sentence.
- [x] A reviewer can point to exactly what the repo does not do in one sentence.
- [x] There is no large unfinished subsystem.
- [x] The repo feels like a core package, not a half-platform.

## Final review questions

1. What became simpler?
   - The repo collapsed from a demo platform into one core package with one schema direction and one CLI story.
2. What was deleted?
   - `packages/reference-server`, `packages/reference-client`, demo-only docs, old v1 schema generation machinery, and leftover demo dependencies.
3. What is the exact two-command user story now?
   - `node packages/aura-protocol/dist/cli/aura-protocol.js derive <local-source>`
   - `node packages/aura-protocol/dist/cli/aura-protocol.js publish <derived-aura-v2.json> --out <dir>`
4. What input formats are truly supported today?
   - local AURA v1 JSON
   - local OpenAPI JSON
   - existing local AURA 2.0 JSON
5. What did we deliberately defer?
   - remote URL discovery, crawling, browser automation, hosted bridge/index/sign services, and wide OpenAPI edge-case coverage.
6. What future repos can plug into this cleanly later?
   - crawl repos, bridge repos, hosted index repos, signing repos, and optional publish extensions.
7. Why is this now a better AURA core than before?
   - It is smaller, action-first, scenario-tested, honest about scope, and centered on a real derive/publish workflow instead of a demo architecture.
