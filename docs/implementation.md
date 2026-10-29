# Current review and verification

Reviewed `f943371` on `feat/aura-declarative-runner` against the local task
requirements before product edits. The tracked worktree started clean. Baseline
install/build and all 75 tests passed. An initial test invocation overlapped
build cleanup and hit a missing dist CLI; the ordered rerun passed.

Four focused regressions failed on the reviewed implementation: an unsafe JSON
integer reached the next request as a rounded ID; a model-visible parent could
include a credential projection; validation decoded URL placeholders that the
request builder left untouched; and execution discarded State entries for
other actions. The fixes reject unsupported numbers recursively (also in
literals, schema data and open-schema values), reject overlapping visibility,
match literal URL templates consistently and retain all validated State entries
on each response. No availability cache or automatic recovery was added.

The checker also failed with standalone Node despite npm being on PATH. It now
discovers npm through its launcher or npm execution context; the same standalone
Node experiment passes. Both obsolete OpenAPI fixtures had no live references;
their scenarios use the current explicit-declaration fixture. They were removed.
The packaged migration document now describes the current contract instead of
shipping the superseded rewrite checklist; Git retains that history.

The corrected contract is `2.0.0-alpha.3`, with regenerated schemas, matching
types/examples and a recomputed authored-example revision. Existing alpha.1 and
alpha.2 tags remain unchanged. No compatibility adapter or npm release was added.

Verification on Windows with Node v22.11.0 and pnpm 10.7.1:

- `pnpm install`: passed; lockfile unchanged. Ignored optional dependency build
  scripts did not block build or tests.
- `pnpm build`: passed, including schema drift and compiler-free runner assets.
- `pnpm test --run`: **83 passed in 17 files**, including the eight new review
  cases, State failures, real HTTP integration, independent consumers, stable
  identity, publication rollback, CLI and fair OpenAPI baseline checks.
- `pnpm check:schemas`: passed for all six generated schemas.
- `pnpm check:package`: passed. The isolated archive installed outside the repo;
  all three CLIs, six bundled schema byte comparisons, external Ajv validation,
  packaged execution and the installed-schema/no-CWD-fallback check passed.
- Standalone Node with npm available only through PATH: the full package check
  passed after reproducing its previous discovery failure.
- README derive/publish/validate and authored-input commands: passed. An existing
  ignored alpha.2 publication was preserved under `.derived` before publishing
  into a clean output directory; profile changes do not bypass ownership checks.
- `git diff --check`: passed.

`node scripts/check-package.mjs --remote` fails with **HTTP 404** for the new
alpha.3 schema tag. This is an unmet public-release prerequisite, not a passing
schema check or an environmental blocker. No alpha.3 tag or npm package was
published. Local verification has no remaining environmental blockers.
`task.md` is unchanged locally, removed from tracking and ignored; it is excluded
from the new commit tree. Earlier Git history is unchanged. Fractional numbers retain binary64 rounding,
credentials still depend on explicit declarations, and the scope limits in the
spec continue to apply. Historical measurement JSON remains labelled alpha.2.

## Historical alpha.2 implementation record

Branch: `feat/aura-declarative-runner`, based on
`ba534d1983a2ee3b90c687bef7474393c6c3d589` (`origin/aura-core-v2`).
Initial worktree: clean tracked files on master; untracked `task.md`, preserved
unchanged. Master and existing release tags are preserved.

G0 baseline: `pnpm install` passed after allowing dependency access; `pnpm build`
passed; `pnpm test --run` passed (10 files, 19 tests). Vitest initially failed
with sandbox `spawn EPERM`; the authorized rerun completed. Alpha.1 tests cover
inference and identity behavior deliberately broken by the new contract.

The contract was fixed in `docs/spec/aura-v2-core.md` before implementation.
`task.md` is retained unchanged; its worktree SHA-256 is
`cc89b751e46d448538b9a3b4d7714561248c5ba3685c5e4a8ca80def91d1299e`.

## Stage evidence

| Stage | Implementation and verified gate |
| --- | --- |
| G0 | Baseline recorded above; config/L1/L2/plan/State field semantics and breaking changes fixed before product edits; narrow runner boundary recorded in AGENTS/spec/architecture. |
| G1 | Explicit selections, stable ids, declared key/risk, portable provenance, fully authored input. Declaration, collision and locator scenarios passed before runner work. No inference/confidence/confirmation module remains. |
| G2 | Selected local refs, supported schema transformations, four HTTP namespaces, exact server/media/auth profile, optional body/no-content success. 15 focused compiler scenarios passed; limits/numeric-field/validator regressions also pass. |
| G3 | Six schemas/types/version pins, compact signatures/relative hrefs, shared revision, linked publication validation, staging and synchronous rollback. Publication scenarios and isolated npm archive passed before runner work. All six public schema URLs now return identical packaged bytes. |
| G4 | Preflight of all selected details and bindings; deterministic HTTP, response validation and projection; separate repeated step results; private credential transfer; partial/unknown outcomes and no automatic recovery. 19 runner scenarios pass. |
| G5 | Versioned 4096-byte State, response-scoped observations, unknown/malformed/stale handling, declared resolver hints and 401/403/429. 13 State scenarios pass; State never overrides HTTP or inserts actions. |
| G6 | Site-hosted and third-party/raw-style URLs serve the same bytes; API AURA files can be disabled. Fully authored static input also executes. Independent consumer, three common vectors, fair full/trimmed OpenAPI baselines, actual costs and clean-directory package quickstart pass. |

## Final local checks

- `pnpm install`: passed; lockfile unchanged. pnpm reports ignored optional build
  scripts; the required build and test processes still completed successfully.
- `pnpm build`: passed, including generated-schema drift check and clean dist.
- `pnpm test --run`: **75 passed in 16 files**, process exited successfully.
- `pnpm check:schemas`: passed for all six version-pinned schemas.
- `pnpm check:package -- --record`: passed. The final 57-file, 41,668-byte archive was
  installed outside the repo; installed compiler/validator/runner, all six schema
  byte comparisons and independent Ajv validations passed. Installed-schema
  removal failed validation as expected, proving no CWD fallback.
- README derive/publish/validate and fully authored derive commands: passed.
- `git diff --check`: passed before this evidence update.

The first full implementation run exposed two remaining alpha.1 expectations
and measurement contention at the default timeout. The tests were migrated to
the declared new contract, concurrency bounded, and the dedicated measurement
test given time for three isolated Node processes. Correctness assertions were
retained. Actual review regressions (numeric object keys, validator-excluded
properties, known HTTP status during cleanup failure) are covered explicitly.

## Acceptance scenarios

| task.md scenarios | Evidence |
| --- | --- |
| 1–2 | `normalization.test.ts`: missing declarations and misleading names/prose. |
| 3–5 | `collision-stability`, `locator-identity-regressions`, `determinism-openapi-order`, `stable-stringify`: sibling cardinality, local paths/object order, stable locators and content revisions. |
| 6–8 | `tur-1-hardening`: refs, recursion/remote/dynamic/variants, safe allOf and explicit rejection of closed composition. |
| 9–12 | Compiler/runner scenarios and common vectors: independent namespaces, optional body, override/base path/encoding, unsupported media/auth/serialization. |
| 13 | Isolated archive, offline/external schemas and all six immutable public schema URLs pass, with exact byte equality. |
| 14–15 | Publication scenarios: broken href, duplicate id, mixed revision, removal, unowned paths and injected mid-commit failure. Runner rejects mixed detail revisions before API calls. |
| 16–22 | Runner scenarios: 50 KiB response, falsy/null and escaped/index pointers, missing/mistyped outputs, repeated creates, static plan errors, private token transfer and one supplied plan. |
| 23–24 | State scenarios: absent/malformed/large/stale, response-scoped unknown, 401/403/429 and resolver hints without recovery. |
| 25 | Runner and real HTTP fixtures: create then rejection, create timeout and retained previous completion without retry/rollback. |
| 26–28 | Real HTTP interop with target-side AURA disabled, same-key cross-site body signatures, common independent request/projection vectors and independent execution of both source routes. |

## Measurements and limits

[Actual results and reproducible commands](measurements/README.md) include
1/10/50-action L1 bytes, L2/schema bytes, isolated compile time/peak RSS,
one/three-step cold/cached calls, response/model-visible bytes, and equivalent
full/trimmed OpenAPI executors with zero intermediate LLM calls. These small
fixtures establish no general performance or reliability advantage.

The profile rejects unsupported features rather than inventing them. Its exact
keyword, media, auth, server, recursion, size, index and pointer limits are in
the spec. Ajv-excluded `__proto__` schema properties are an explicit rejection.
No interactive OAuth/cookie/CSRF, variants, retry/rollback, job engine or model
planner is claimed. Publication rollback covers synchronous local errors, not
process crashes or CDN atomic deployment. Revision is not publisher identity.

## Public schema release verified

The first `node scripts/check-package.mjs --remote` run failed with HTTP **404**
because the new tag did not exist. After explicit user approval, the branch and
new annotated `v2.0.0-alpha.2` tag were pushed atomically. The tag is fixed at
`06ef7a17d7ad9db90e099d12fb5a730050f03285`; alpha.1 and master are unchanged.

`node scripts/check-package.mjs --remote --record` then **passed**: all six URLs
returned HTTP 200 and exactly matched the source and packed schema bytes.
Committed Git schema bytes also match the working tree without newline changes.

[Branch CI](https://github.com/osmandkitay/aura/actions/runs/40802807541) and
[tag CI](https://github.com/osmandkitay/aura/actions/runs/40802809571) both passed
on Windows and Linux: install, build, 75 scenarios, schema consistency and
isolated archive. The tag jobs additionally passed the public byte comparison.
All required acceptance checks pass within the documented profile. The user
approved Git publication; an npm registry release has not been performed.
