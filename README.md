# AURA

**Web actions people and agents can publish, carry and run themselves.**

Knowing how to use the web should be knowledge people and agents can share.
AURA makes supported HTTP actions explicit, publishable, and usable through
compatible local consumers. No central catalog, mandatory AURA account, or
AURA execution service is required. The format should remain implementable
without this repository.

AURA is an experimental independent proposal. It has no W3C or IETF endorsement;
the `/.well-known/aura.json` path is a project convention, without a claim of
well-known URI registration. The supported package and profile are
`2.0.0-alpha.3`. npm metadata checked on 2026-10-30 reports
`alpha=2.0.0-alpha.3` and `latest=1.0.5`; use the exact alpha version below.

## Publish knowledge, run it locally

A publisher explicitly declares action meaning, risk, provenance and API target.
The local compiler derives self-contained HTTP recipes; `publish` emits a small
descriptor and relative action files. A compatible consumer fetches those files,
validates a supplied plan and calls the declared API directly.

Descriptor hosting and API hosting can differ. A third party can publish recipes
for an existing supported API without installing AURA on the target site.
Publication grants no account access and implies no target-site endorsement.
Publisher claims remain visible in `publisher`, `source`, `aliases` and `origin`;
the target API enforces authentication and authorization. AURA does not create
missing APIs. APIs, static hosting, networks and any models a consumer uses can
have their own costs.

Share a descriptor URL in existing documentation, a Git repository or a direct
message. Consumers need support for this profile. Optional catalogs, agent skills
and integrations belong outside this core; discovery requires no AURA service.

## Quickstart

Prerequisites: Node.js >=20.19 and npm, a supported OpenAPI 3.0/3.1 JSON
description, an explicit declaration, and static hosting for the published files.
Execution also needs an existing reachable API and any credentials it requires.

In a clean directory, install the verified published alpha explicitly:

```bash
npm install --save-exact aura-protocol@2.0.0-alpha.3
```

Save these three files. All `.example` URLs below are placeholders, not live
demos. This fixture assumes an anonymous `POST /v1/entries` that accepts
`{"name":"hello"}` and returns HTTP 201 JSON `{"id":"created-1"}`.

`openapi.json`:

```json
{
  "openapi": "3.1.1",
  "info": { "title": "Example entries", "version": "1" },
  "servers": [{ "url": "https://api.example/v1" }],
  "paths": {
    "/entries": {
      "post": {
        "requestBody": {
          "required": true,
          "content": { "application/json": { "schema": {
            "type": "object", "required": ["name"],
            "properties": { "name": { "type": "string" } }
          } } }
        },
        "responses": {
          "201": {
            "description": "Created",
            "content": { "application/json": { "schema": {
              "type": "object", "required": ["id"],
              "properties": { "id": { "type": "string" } }
            } } }
          }
        }
      }
    }
  }
}
```

`aura.config.json` declares the publisher, source, API target, action meaning
and risk; endpoint names never supply those declarations:

```json
{
  "$schema": "https://raw.githubusercontent.com/osmandkitay/aura/v2.0.0-alpha.3/packages/aura-protocol/schema/aura-config.schema.json",
  "publisher": { "name": "Recipe author", "url": "https://recipes.example", "role": "third-party" },
  "source": { "url": "https://api.example/openapi.json", "version": "1" },
  "target": { "url": "https://api.example/v1" },
  "actions": [{
    "id": "create", "key": "entry.create", "risk": "medium",
    "method": "POST", "path": "/entries",
    "outputs": [{
      "name": "id", "source": "body", "pointer": "/id",
      "type": "string", "required": true, "visibility": "model"
    }]
  }]
}
```

`plan.json` is the complete plan supplied by the caller:

```json
{
  "$schema": "https://raw.githubusercontent.com/osmandkitay/aura/v2.0.0-alpha.3/packages/aura-protocol/schema/aura-plan.schema.json",
  "profile": "2.0.0-alpha.3",
  "descriptor": "https://recipes.example/.well-known/aura.json",
  "steps": [{
    "stepId": "first", "actionId": "create",
    "inputs": [{ "target": "/body", "value": { "name": "hello" } }]
  }]
}
```

Derive, publish and validate locally:

```bash
npx aura-protocol derive openapi.json --config aura.config.json
npx aura-protocol publish .derived/aura-v2.json --out public
npx aura-protocol validate public/.well-known/aura.json
```

`derive` writes beside the input in `.derived/aura-v2.json`. `publish` writes
`public/.well-known/aura.json` and `public/.well-known/aura/actions/create.json`.
The validation command checks the descriptor and its linked action files.

For execution, replace the example API/source URLs with your existing service,
match its actual API contract, and derive and publish again. Deploy the entire
`public/.well-known/` tree to your chosen static host, preserving relative paths
and serving JSON as `application/json` without redirects. Set `plan.descriptor`
to that host's descriptor URL, then run on your own machine:

```bash
npx aura-runner plan.json --timeout-ms 10000
```

The assumed response produces `status: "success"` and
`completed[0].outputs: {"id":"created-1"}`. This command makes the declared API
request. It requires a complete plan; natural-language planning and native
support in agent products are not supplied by the runner.

## Supported contract and limits

The core is one package: a format, compiler, validator, static publisher and
small reference runner. Fully authored AURA normal form is also a supported
local input; see the [examples](examples/minimal-site) and
[contract](docs/spec/aura-v2-core.md).

- One linear plan, one descriptor and one API origin per run. The descriptor
  host may differ from the API origin; cross-origin API orchestration is outside
  this profile.
- JSON request/response bodies, exact success statuses and no-content success;
  namespaced path/query/header/body inputs and typed RFC 6901 output pointers.
  Scalar/simple parameters and repeated form query arrays are supported.
- Acyclic same-document OpenAPI references and a limited schema keyword set.
  No remote/recursive/dynamic refs, general `oneOf`/`anyOf`, unsafe closed-object
  `allOf`, multipart/forms, or ambiguous server/auth alternatives.
- Anonymous, one bearer token or one header API key. No interactive OAuth,
  cookie jar or CSRF flow; no redirects, loops, conditions, retries or rollback.
- Finite binary64 numbers with safe integers; represent larger IDs as strings.
  Schema depth is limited to 64 and expansion to 10,000 nodes per schema;
  descriptor/action files to 1 MiB each, State headers to 4096 bytes and nested
  array assignment indices to 10,000. See the contract for exact restrictions.

Preflight checks selected actions and input dependencies before API calls.
Only declared model-visible outputs enter results; declared credential outputs
can transfer within a run. A prepared snapshot may be reused intentionally.
Timeout or connection loss can leave an unknown outcome, with prior completions
retained. Optional AURA-State is advisory context from one response, never a
substitute for API authorization or a trigger for automatic recovery.

Schema validity cannot establish the user's intended business outcome. A
content hash detects content changes; it does not establish publisher identity.
The core includes no crawler, browser automation, hosted runtime, planner,
scheduler, model, database or demo application stack.

## Verify and contribute

For work in this repository, use Node.js >=20.19 and pnpm 10.7.1:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test --run
pnpm check:schemas
pnpm check:package
```

The scenarios exercise separate artifact/API hosts and an independent consumer.
The package check installs the exact local archive in a clean temporary directory,
runs all three CLIs and checks installed schemas without a repository fallback.
`node scripts/check-package.mjs --remote` also compares all six public immutable
schema URLs with the packaged bytes. A local check alone cannot establish public
schema availability.

[Verification evidence](docs/implementation.md) ·
[release checklist](docs/releasing.md) ·
[contributing](CONTRIBUTING.md) ·
[contract](docs/spec/aura-v2-core.md) ·
[architecture](docs/rationale/architecture-seams.md) ·
[semantics](docs/rationale/semantic-normalization.md) ·
[migration](docs/migration/v1-to-v2-plan.md) ·
[historical measurements](docs/measurements/README.md)

MIT.
