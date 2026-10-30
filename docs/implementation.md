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

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed; lockfile unchanged. |
| `pnpm build` | Passed; schema drift checked and dist rebuilt. |
| `pnpm test --run` | 83 tests in 17 files passed; process exited normally. No full-suite stall reproduced. |
| `pnpm check:schemas` | All six generated schemas match source. |
| `pnpm check:package` | Passed: exact local archive installed cleanly; all three CLIs, independent Ajv and no-CWD-fallback checks passed. |
| `node scripts/check-package.mjs --remote` | Passed: all six public immutable schemas match source and packaged bytes. |
| Pack contents | 59 files; only package metadata, README and intended dist assets. No task briefs/drafts, dependencies, caches, credentials or archives. |
| README quickstart | Both README fixtures match; exact published alpha.3 install passed all three CLIs with separate artifact/API hosts and the expected typed output. |

The quickstart verification used only substituted fixture origins: two artifact
GETs and one direct API POST. The API's descriptor and OpenAPI URLs returned 404.
Package subprocess/cache checks initially hit sandbox EPERM; authorized reruns
outside the sandbox passed. This was an environment restriction, not a test pass
or a product defect.

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
The registry integrity for alpha.3 is:

```text
sha512-Ik3MZ+WfTXSAO4R3kiCTofl+3XMaCrp3tDChiOTuVHkj0BJ4cBJ5GOppyKbbEtzX2Cjx8mO/78XFytObdfTjLg==
```

These metadata checks do not make a changed local archive the published archive.
Documentation edits cannot replace an existing npm tarball. Existing tags and
releases are preserved; no version bump or npm mutation is part of this cleanup.
The [migration document](migration/v1-to-v2-plan.md) describes contract differences.

AURA is an experimental independent proposal. The contract and independent
request/projection vectors are implementable evidence, without a standards
endorsement or well-known registration claim. Discovery services, catalogs,
agent integrations and hosted execution remain separate projects.
