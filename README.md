# AURA

Agent-Usable Resource Assertion: explicit, self-contained HTTP action recipes.
A publisher declares intent and risk; a small compiler prepares the mechanics.
A consumer selects a complete plan; a deterministic runner performs its HTTP
calls and transfers selected outputs without intermediate model calls.

This is a one-package workspace on `master`, following the merge of PR #7.
The incompatible profile is `2.0.0-alpha.3`. Its immutable Git tag, public schema
bytes and Linux/Windows release CI are verified. Npm identity and package write
access are verified; publication still requires interactive 2FA authorization.
Use the local build or retained verified tarball until that registry gate passes.
See [current verification status](docs/implementation.md). Existing Git tags and
the npm `latest=1.0.5` dist-tag are preserved.

## Build and publish

Prerequisites: Node.js >=20.19, pnpm 10.7.1, an existing HTTP API with known auth,
and prepared local OpenAPI 3.0/3.1 JSON plus explicit declaration. The five-minute
setup target starts with that API/source/config ready; it excludes API creation,
auth discovery and authoring a correct recipe. Static files do not create APIs.

```bash
pnpm install
pnpm build

node packages/aura-protocol/dist/cli/aura-protocol.js derive examples/minimal-site/source/openapi.json --config examples/minimal-site/aura.config.json
node packages/aura-protocol/dist/cli/aura-protocol.js publish examples/minimal-site/.derived/aura-v2.json --out examples/minimal-site/dist
node packages/aura-protocol/dist/cli/aura-protocol.js validate examples/minimal-site/dist/.well-known/aura.json
```

`derive` writes a sibling `.derived/aura-v2.json` (or `--out <file>` /
`--stdout`). `publish` accepts a validated normal-form document, never raw
OpenAPI without its declaration. It writes exactly one discovery entry at
`/.well-known/aura.json` and individual `aura/actions/{id}.json` details.
Generated output is ignored by Git.

The second input route is a fully declared, self-contained AURA document:

```bash
node packages/aura-protocol/dist/cli/aura-protocol.js derive examples/minimal-site/authored-aura.json --out examples/minimal-site/.derived/authored.json
```

The compiler treats human and agent authors identically. A declaration requires
publisher/source/version, an explicit API target, stable id, key and risk per
selected action. Missing information is an error, never an intent/confidence
guess. Equal keys can have different signatures; consumers choose action ids.

## Consume static recipes

Consumers do not need this repo or package. Any implementation of the profile
can fetch the descriptor and only its selected details. Relative links resolve
at the artifact host; action HTTP URLs point at the separately declared API.
The same package can live at the site's well-known URL, a third-party static
subdirectory or a Git raw URL. Publisher role and source version remain visible;
third-party recipes do not become site-owner assertions.

The optional reference runner ships in the same package:

```bash
node packages/aura-protocol/dist/cli/aura-runner.js plan.json --timeout-ms 10000
```

A plan explicitly supplies the descriptor URL, unique step ids, action ids and
literal/from assignments. The static [example plan](examples/minimal-site/plan.json)
describes an assumed API; provide the actual descriptor and caller inputs before
running it. Run the scenarios below for a real local HTTP fixture.

`aura-protocol/runner` is the separate package API entry for `runPlan`,
`preparePlan`, `executePlan`, `buildRequest`, projection and State helpers.
Preflight validates all referenced details and data dependencies before any API
call. A prepared plan can be reused while the caller intentionally trusts its
pinned snapshot. No source OpenAPI or compiler modules enter the runner.

Model-visible results contain selected outputs and short status/action/revision
information. Credential outputs transfer only inside the run; overlapping
model/credential projections are rejected before publication. Unsafe integers
and non-finite numbers fail explicitly, including in nested values. Use strings
for IDs outside the safe integer range. Timeout or
connection loss can mean `outcome-unknown`; previous completions remain visible.
There is no retry, rollback or automatic resolver invocation. State is optional,
response-scoped context; each result's `state.actions` retains every validated
observation from that response. HTTP and target authorization remain authoritative.

## Supported profile and limits

Acyclic same-document refs, namespaced path/query/header/body inputs, JSON body
and response, exact success statuses and no-content success, typed RFC 6901
outputs, scalar/simple parameters and repeated form query arrays are supported.
Auth supports anonymous, one bearer, or one header API key. The bearer prefix
and API key header are explicit. Unsupported combinations fail with locations.

No remote/recursive/dynamic refs, general oneOf/anyOf, unsafe closed-object
allOf, multipart/forms, cookies/CSRF/OAuth interaction, or ambiguous server/auth
alternatives. Maximum schema depth 64, expansion 10,000 schema nodes per schema,
action 1 MiB, State wire header 4096 bytes; nested array assignment indices are
limited to 10,000. See [the exact contract and keywords](docs/spec/aura-v2-core.md).

The core stays small: it does not crawl the web; it does not automate browsers;
it does not host a bridge, index, or signing service. No demo app/server/client
stack, planner, scheduler, registry or database is included. General agent
products need profile support; universal integration or error-free APIs are not
promised. A shared key is not a shared type, unit or authority guarantee.

## Verify

```bash
pnpm install
pnpm build
pnpm test --run
pnpm check:schemas
pnpm check:package
```

Packaging installs `npm pack` output outside this repository, runs all three
CLIs, compares bundled schema bytes and checks independent Ajv validation with
no working-directory fallback. After the new tag is publicly released, the
additional release gate is:

```bash
node scripts/check-package.mjs --remote
```

That gate requires each public schema URL to return exactly the packaged bytes.
A missing public tag is a failed release gate, not a successful local fallback.
Exact-version npm commands become valid only after the corresponding package is
published; no command assumes that alpha.3 is already in the registry.

[Acceptance evidence and limitations](docs/implementation.md),
[measured results](docs/measurements/README.md),
[contract](docs/spec/aura-v2-core.md),
[architecture](docs/rationale/architecture-seams.md),
[semantics](docs/rationale/semantic-normalization.md),
[migration](docs/migration/v1-to-v2-plan.md).
MIT.
