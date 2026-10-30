# aura-protocol

**Web actions people and agents can publish, carry and run themselves.**

AURA is an experimental independent proposal for explicit, portable HTTP
recipes. This package contains a local compiler, validator, static publisher
and deterministic reference runner for profile `2.0.0-alpha.3`.
Compatible consumers can implement the included [contract](dist/SPEC.md)
without this package or repository.

No central catalog, mandatory AURA account or AURA execution service is required.
A descriptor and its relative action files can live on one static host while
requests go directly to a separately declared API. Third parties can publish
supported recipes without installing AURA on the target site. Publication grants
no account access or target-site endorsement; the API enforces authority.
APIs, hosting, networks and any consumer models may have their own costs.

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

## APIs and installed contract

```js
const { deriveFile, publishFile, validatePublication } = require('aura-protocol');
const { runPlan, preparePlan, executePlan } = require('aura-protocol/runner');
```

`aura-validate <file>` is also included. Validation loads installed schemas
offline, without a working-directory or network fallback. Bundled assets are
`dist/aura-{v2,action,publish,config,plan,state}.schema.json`,
[the contract](dist/SPEC.md), [migration guidance](dist/MIGRATION.md) and the
MIT license. Published immutable schema URLs are separate release checks.

Publishers explicitly declare action ids, keys, risks, source/version, target and
typed outputs. Only selected operations compile. Fully authored AURA normal form
is the other input route. Provenance in `aliases` and `origin` is preserved.
Missing declarations and unsupported mechanics fail; meaning and risk are never
inferred. Schema validity does not prove a business outcome, and a content hash
does not establish publisher identity.

## Execution and limits

Preparation fetches only selected details and validates the complete plan before
API calls. Execution validates actual inputs and responses, transfers typed
outputs and keeps declared credential outputs inside the run. Overlapping model
and credential projections are rejected. Results retain completed steps and
partial or unknown outcomes; there is no retry, rollback or automatic resolver.
Prepared snapshots may be reused while the caller deliberately trusts them.

The profile supports one linear plan, one descriptor and one API origin, with a
possibly different descriptor host. JSON bodies, exact/no-content success,
namespaced inputs, scalar/simple parameters, repeated form query arrays,
acyclic local refs, and anonymous/single bearer/header-key auth are supported.
There is no cross-origin API orchestration, redirect following, loop, condition,
interactive OAuth, cookie jar, CSRF, multipart/forms, remote/recursive/dynamic
ref, general `oneOf`/`anyOf` or unsafe closed-object `allOf` support.

Numbers must be finite binary64 with safe integers, including nested values.
Encode larger IDs as strings. Limits: schema depth 64; 10,000 nodes per expanded
schema; descriptor/action 1 MiB each; State header 4096 bytes; nested assignment
indices 10,000. See the contract for exact schema keywords and constraints.
HTTP placeholders use literal `{name}` braces; encoded braces are URL data.

Optional State belongs to its HTTP response. Read an observation with
`stateFor(result.completed[i].state, actionId)`; missing ids remain unknown.
State never authorizes access or inserts actions.

Share descriptor URLs directly or through existing docs/Git repositories.
Compatible consumer support is required. Optional catalogs and integrations
belong outside this core, which includes no planner, model, crawler, browser
automation, hosted service, scheduler, database or demo application stack.
