# Implementation record

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
| G3 | Six schemas/types/version pins, compact signatures/relative hrefs, shared revision, linked publication validation, staging and synchronous rollback. Publication scenarios and isolated npm archive passed before runner work. Public tag availability remains the release exception below. |
| G4 | Preflight of all selected details and bindings; deterministic HTTP, response validation and projection; separate repeated step results; private credential transfer; partial/unknown outcomes and no automatic recovery. 19 runner scenarios pass. |
| G5 | Versioned 4096-byte State, response-scoped observations, unknown/malformed/stale handling, declared resolver hints and 401/403/429. 13 State scenarios pass; State never overrides HTTP or inserts actions. |
| G6 | Site-hosted and third-party/raw-style URLs serve the same bytes; API AURA files can be disabled. Fully authored static input also executes. Independent consumer, three common vectors, fair full/trimmed OpenAPI baselines, actual costs and clean-directory package quickstart pass. |

## Final local checks

- `pnpm install`: passed; lockfile unchanged. pnpm reports ignored optional build
  scripts; the required build and test processes still completed successfully.
- `pnpm build`: passed, including generated-schema drift check and clean dist.
- `pnpm test --run`: **75 passed in 16 files**, process exited successfully.
- `pnpm check:schemas`: passed for all six version-pinned schemas.
- `pnpm check:package -- --record`: passed. A 57-file, 41,678-byte archive was
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
| 13 | Isolated archive and offline/external schemas pass. Public URL availability **does not pass yet**; see release gate. |
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

## Remaining public release gate

`node scripts/check-package.mjs --remote` was run and failed with HTTP **404** at
the `v2.0.0-alpha.2` action schema URL. Remote tag inspection confirms that the
new tag does not exist; alpha.1 is unchanged. The local/packed schema bytes and
identifiers agree, but the document's own public URL cannot validate it yet.

Publishing the reviewed implementation branch and a new immutable
`v2.0.0-alpha.2` Git tag is required before the public byte comparison can pass.
No npm release, public Git tag or remote branch has been published by this work.
CI now runs build/scenarios/schema/package checks on implementation branches and
PRs (Windows and Linux); a tag build also runs the public schema gate. Hosted CI
has not run while the branch remains local. Full release acceptance is **not
claimed** while this public gate remains unmet.
