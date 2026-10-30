# Core verification

The supported contract is `2.0.0-alpha.3`. This page records the implementation
boundaries and reproducible evidence; future release gates are in the
[release checklist](releasing.md).

## Local distribution and execution

`derive` takes local OpenAPI plus an explicit declaration, or a fully authored
normal form. `publish` emits a descriptor and relative action details. A local
consumer can fetch these from a separate static host and call the declared target
API directly. Execution requires neither source OpenAPI at runtime nor AURA
software on the API host, an AURA account or an AURA intermediary.

`tests/scenarios/interop.test.ts` serves identical recipes at site-owned and
third-party subdirectory URLs, disables the API host's AURA files, and compares
the reference runner's requests with an independent consumer's requests.
The authored-input scenario verifies the same path without source OpenAPI.
These fixtures establish interoperability within the supported profile, not
universal agent compatibility.

## Verification on 2026-10-30

Windows, Node.js v22.11.0, pnpm 10.7.1. No product code or protocol changes were
needed for the separate-host path.

The initial PR #9 test claim used a run from before the README rewrite. That
rewrite removed scope phrases required by the unchanged no-fake-feature test;
the pushed tree failed CI. The phrases are restored in both READMEs. Fresh check
results below supersede that earlier full-suite claim; the unchanged quickstart
execution is identified separately as retained evidence.

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed; lockfile unchanged. |
| `pnpm build` | Passed; schema drift checked and dist rebuilt. |
| `pnpm test --run` | 83 tests in 17 files passed; process exited normally. No full-suite stall reproduced. |
| `pnpm check:schemas` | All six generated schemas match source. |
| `pnpm check:package` | Passed: exact local archive installed cleanly; all three CLIs, independent Ajv and no-CWD-fallback checks passed. |
| `node scripts/check-package.mjs --remote` | Passed: all six public immutable schemas match source and packaged bytes. |
| Pack contents | 59 files; only package metadata, README and intended dist assets. No task briefs/drafts, dependencies, caches, credentials or archives. |
| README quickstart | Retained earlier execution evidence: exact published alpha.3 install passed all three CLIs with separate artifact/API hosts and the expected typed output. Fixture JSON is unchanged by this fix and identical in both READMEs. |

The earlier quickstart verification used only substituted fixture origins: two artifact
GETs and one direct API POST. The API's descriptor and OpenAPI URLs returned 404.
Package subprocess/cache checks initially hit sandbox EPERM; authorized reruns
outside the sandbox passed during the earlier verification. The final checks
completed without those restrictions.

The scenario suite also covers explicit declarations, stable identity/provenance,
publication ownership and synchronous rollback, unsupported mechanics,
credential visibility, numeric safety, typed output transfer, State, partial
completion and unknown transport outcomes. Historical measurements remain
labelled with their measured profile in [measurements](measurements/README.md).

The package checker builds an archive from the current dist, installs that exact
archive outside the repository, checks executable shims/imports, runs derive,
publish, validation and execution, compares bundled schemas, and validates
artifacts independently with Ajv. Removing an installed schema must fail rather
than falling back to repository files. Run `pnpm check:package` after building;
its temporary installation is removed on completion. The `--remote` variant also
requires all six public immutable schema URLs to return exactly the local bytes.

## Published version and future work

Read-only npm queries on 2026-10-30 confirmed `2.0.0-alpha.3`,
`alpha=2.0.0-alpha.3` and `latest=1.0.5`. The package requires Node.js >=20.19.
The registry hashes for alpha.3 are:

```text
integrity: sha512-Ik3MZ+WfTXSAO4R3kiCTofl+3XMaCrp3tDChiOTuVHkj0BJ4cBJ5GOppyKbbEtzX2Cjx8mO/78XFytObdfTjLg==
shasum: 2e70da11e80c7b919739e87bfb285e30814476c5
```

### Original publication evidence (2026-10-29)

The following release receipt is preserved from
[PR #8](https://github.com/osmandkitay/aura/pull/8), whose README and migration
updates are covered by this PR's exact-version instructions and verification.

- [PR #7](https://github.com/osmandkitay/aura/pull/7) merged at
  `803b5e94263b4dcf9a00c066bb486ea6181f5d8b`, with the same tree as release commit
  `2b676e8ad78d04c3dc16157625f4f410d99d4886`. The annotated `v2.0.0-alpha.3`
  tag object is `54280f18ead058441f83adfe537d8eed0175f5e8` and peels to that
  release commit. These identifiers and tree equality were rechecked on 2026-10-30.
- The retained `aura-protocol-2.0.0-alpha.3.tgz` was 37,823 bytes with 59 files.
  Its SHA-512 and SHA-1 matched retained `pack.json`, PR #7 and the registry hashes
  above. PR #8 records a fresh registry download byte-for-byte identical to that
  retained archive; it was not rebuilt or repacked for publication.
- PR #8 records npm identity `dervisofai` with package `read-write` access,
  followed by publication of only that archive from Windows using `--tag alpha`,
  `--access public`, `--registry=https://registry.npmjs.org/` and `--auth-type=web`.
  The publisher completed browser confirmation after enabling 2FA; processing
  finished and the prior authentication/publication blocker was resolved.
- Its post-publication Windows check installed the exact registry version outside
  the repository with a fresh cache and install scripts disabled. All 59 installed
  files matched the retained archive. All three CLI shims/shebangs, derive,
  publish, both validators, typed runner output, compiler/runner imports,
  independent Ajv validation of six formats, all six public schemas and the
  missing-installed-schema/no-CWD-fallback negative check passed.
- [Release tag CI](https://github.com/osmandkitay/aura/actions/runs/40907581907)
  passed on Linux and Windows: locked install, build, 83 scenarios in 17 files,
  schema consistency, isolated archive installation and all six immutable public
  schema byte comparisons. Both successful jobs were rechecked on 2026-10-30.

These historical release checks are separate from the final PR checks above;
they do not make a changed local archive the published archive.
Documentation edits cannot replace an existing npm tarball. Existing tags and
releases are preserved; no version bump or npm mutation is part of this cleanup.
The [migration document](migration/v1-to-v2-plan.md) describes contract differences.

AURA is an experimental independent proposal. The contract and independent
request/projection vectors are implementable evidence, without a standards
endorsement or well-known registration claim. Discovery services, catalogs,
agent integrations and hosted execution remain separate projects.
