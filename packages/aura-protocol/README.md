# aura-protocol

Small local compiler, static publisher and deterministic reference runner for the
`2.0.0-alpha.3` profile. It is not a hosted runtime or framework.
This source version requires explicit declarations and replaces the alpha.2 contract.

## Consume AURA Without The Package

Fetch the descriptor and its selected relative action links with any conforming
consumer. Each detail is self-contained, names its API target, and has no
source-schema dependency. Publication may be site-owned or third-party; these
are separate provenance claims. The API enforces actual authority.

## Local build and package truth

Build from `master` with `pnpm install && pnpm build`.
Schema URLs target the immutable Git tag `v2.0.0-alpha.3`; public availability
and exact schema bytes passed Linux/Windows release CI. The verified archive is
[published on npm](https://www.npmjs.com/package/aura-protocol/v/2.0.0-alpha.3),
with matching registry integrity and a passing isolated installation of all
three CLIs. Install with `npm install aura-protocol@2.0.0-alpha.3`.
The `alpha` dist-tag selects this release; `latest` remains 1.0.5. Existing Git
release tags remain unchanged.

```bash
aura-protocol derive openapi.json --config aura.config.json
aura-protocol publish .derived/aura-v2.json --out public
aura-protocol validate public/.well-known/aura.json
aura-validate public/.well-known/aura.json
aura-runner plan.json --timeout-ms 10000
```

The compiler requires publisher/source/version, target, selected stable ids,
keys/risks and typed outputs. A fully authored normal form is the other input.
Only declared operations compile. Missing/unsupported behavior is an error.
No semantic/risk/confidence inference or automatic migration occurs.

## APIs and assets

```js
const { deriveFile, publishFile, validatePublication } = require('aura-protocol');
const { runPlan, preparePlan, executePlan } = require('aura-protocol/runner');
```

Runner preparation fetches only selected details and validates the full plan
before API calls. Execution transfers literal/from values, makes exact HTTP
requests, validates success/media/schema and projects typed outputs. Selected
credential outputs remain internal. Unknown transport outcomes and earlier
completions are reported. No retry, rollback, LLM call or automatic resolver.
Mixed model/credential visibility on overlapping pointers is rejected. Numbers
must be finite and integers safe, including nested literals and outputs; encode
large IDs as strings. HTTP path placeholders use literal `{name}` braces;
percent-encoded braces are URL data. Each response's `state.actions` retains all
validated observations, with optional `state.diagnostic` for unusable State.
Use `stateFor(result.completed[i].state, actionId)` to query an observation;
missing ids remain unknown. Observations never carry over to another response.

Bundled schemas: `dist/aura-{v2,action,publish,config,plan,state}.schema.json`.
Validation loads these installed files offline, never from the working directory.
The identical version-pinned public URLs are release checks. See the included
[contract](dist/SPEC.md) and [migration](dist/MIGRATION.md) for field semantics,
supported JSON Schema keywords, limits and intentional breaking changes.

One linear plan, one descriptor, one API origin. JSON; acyclic local refs;
simple scalar/repeated query bindings; anonymous, bearer/header API key auth.
No remote/recursive/dynamic refs, general schema variants, multipart, cookie jar,
CSRF or interactive OAuth profile. State is optional advisory response context.
No crawler, browser automation, hosted service, demo stack, planner or scheduler.
