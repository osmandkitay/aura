# AURA 2.0 alpha.3 contract

Profile: `2.0.0-alpha.3`. Old release tags are never rewritten. Public schema
availability is a separate release gate, not implied by a local build.

## Identity and provenance

`id` is a publisher-assigned, case-sensitive, file-safe locator unique within
a descriptor. Names are 1–100 ASCII letters/digits/dots/underscores/hyphens,
start with a letter/digit, do not end in a dot and exclude Windows device names.
Case-colliding action ids are rejected for portable publication.
`key` declares intent, not type equality or authority. `stepId`
identifies an invocation. `revision` is SHA-256 of the canonical document minus
its revision field. Every detail repeats that revision. Artifact URLs locate
recipes; HTTP URLs locate the separately declared target API. Local paths never
enter identity or provenance.

## Declaration and normal form

`derive openapi.json --config aura.config.json` compiles only config.actions.
Config requires `$schema`, `publisher: {name,url,role: site-owner|third-party}`,
`source: {url,version}`, `target: {url}` (absolute HTTP(S) base URL), `actions`.
Each selection requires id, key, risk (low|medium|high), method, path and outputs.
Optional title, requires and errors are explicit declarations. Each error has
an exact non-success status and optional short reason/resolve action id.
Missing/unknown fields, duplicate ids, source conflicts and unsupported features
produce a code, source JSON Pointer and config JSON Pointer. Config cannot
override source requirements. Agent/human authors pass the same validation.

Normal form requires $schema, protocol AURA, version 2.0, profile, publisher,
source (url/version plus kind openapi|aura-v2), target, revision, actions. A fully
authored normal form is the second local input route. It is validated without
crawling or guessing, preserving portable provenance. Actions sort by explicit
id; object keys sort; generic serialization preserves all arrays. Schema-aware
normalization sorts only schema required sets, never literal data by key name.

## Discovery L1 and action L2

L1 remains .well-known/aura.json: $schema, protocol, version, profile, revision,
publisher, source, target and summaries (id/key/href/inputs/outputs/requires?).
Signatures contain name/type/required, without full schemas or long descriptions.
Body signatures include its root and explicitly typed first-level properties;
deeper structure stays in L2. Required means unconditional presence; optional or
nullable body children are not advertised as unconditionally required.
No second index GET is required. L2 remains .well-known/aura/actions/{id}.json,
containing $schema/profile/revision/publisher/source/target and the full action.
Relative href aura/actions/{id}.json resolves against the descriptor URL.

Actions require id, key, risk, entrypoint, input, bindings, auth, success, outputs
and origin; title/aliases/requires/errors are optional. entrypoint has method,
absolute url and encoding json|none. Input preserves path/query/header/body.
Binding records have input pointer, in, wire name (non-body), target "" (whole
body), and explicit style/explode for parameters. Optional body and its internal
required fields remain separate. Duplicate/overlapping writes fail; header names
compare case-insensitively. L2 alone suffices to build HTTP offline.

success is a list of exact cases: status/contentType application/json/schema,
or status/contentType null for no body. 204 never promises a body. outputs have
name, source body, RFC 6901 pointer, explicit JSON type (possibly nullable union),
required, visibility model|credential. Null/false/zero/empty differ from missing.
Credentials may transfer within a run but never enter normal results/logs.
Outputs with different visibility cannot select the same pointer or overlapping
ancestor/descendant subtrees, including the root pointer. Reject that conflict
in config, authored L2 and direct projection; select separate public fields
explicitly. No runtime redaction or credential-name inference is performed.

## Mechanical compilation profile

OpenAPI 3.0.x/3.1.x JSON. Resolve acyclic same-document refs in parameters,
request bodies, responses and schemas, only for selected operations. No network
resolution. Maximum expansion depth 64, 10,000 nodes per expanded schema,
canonical serialized detail (including metadata) and index 1 MiB each. Remote,
recursive and dynamic refs, general oneOf/anyOf and unsupported keywords fail.
Simple allOf merges only open objects with disjoint properties and required
sets, without losing other assertions. Closed objects or overlapping constraints
fail. Nested object/array/scalar, enum/const, nullable and supported constraints
are preserved. Exact keyword support is documented alongside implementation.

Server precedence: operation, path item, document; exactly one selected server,
no variables/userinfo/query/fragment. Document server must match target base URL;
overrides may change base path within its origin. With no server, explicit
target supplies it. Concatenate base path and operation path without dropping
/v1. Path scalars encode as segments; query form scalars and repeated scalar
arrays (explode true); path/header simple scalars. Reject cookie parameters,
parameter content, complex serialization, non-JSON or multiple media, GET body.
Path placeholders are literal `{name}` strings in the declared URL. Encoded
`%7B`/`%7D` braces are literal URL data and never count as placeholders; every
path binding must match a literal placeholder before execution.
Auth is anonymous or exactly one bearer/header API key; reject AND/OR alternatives.
Bearer explicitly maps raw /header/Authorization with prefix "Bearer "; API key
names its header/input. No static credential values or interactive OAuth support.

## Linear plan and runner

Plan requires $schema/profile/descriptor (absolute HTTP(S)), steps, optional
revision pin. Each step has unique stepId, actionId and inputs. Each assignment
has target pointer and exactly one value literal or from {step,output}.
No expressions, dotted references, loops, conditions, scheduler or model calls.
Before any API request, validate all selected details, ids, summaries/revisions,
backward from references, known type mismatches, overlap, required inputs and
literal values. Fetch only needed details once per action. One API origin/run.
Refuse redirects. Runtime never imports compiler modules or source OpenAPI.

Default request timeout 10 seconds. Results expose completed step ids, selected
model outputs, action URLs/revisions and short status. success/failed/blocked/
partial/outcome-unknown distinguish completion; timeout or connection loss after
dispatch yields outcome-unknown, retaining prior steps. Projection/type failure
stops downstream writes. No retry/rollback/automatic resolver invocation.
401/403/429 report blocked and explicit resolver hints; earlier steps remain.

The numeric profile uses finite IEEE 754 binary64 values, with integers limited
to -9007199254740991 through 9007199254740991. This applies recursively to
declarations, schema bounds/literals, plan inputs, responses and projected
objects/arrays, including values under open or boolean schemas. Unsupported
numbers fail with `NUMBER_UNSUPPORTED` before being serialized or piped;
non-finite numbers and JavaScript bigint values are also rejected. Represent
large IDs as strings in the API and recipe. Fractional values have ordinary
binary64 rounding; arbitrary-precision decimal arithmetic is outside the profile.

## Optional L3 AURA-State

Wire is exactly v=2;data=<unpadded-base64url-compact-UTF8-JSON>.
Decoded payload: {version:2,revision,actions:[{id,availability,reason?,resolve?}]}.
Wire availability is available|blocked; unknown is the consumer result for
absent/unusable observations. Limit 4096 ASCII bytes. Malformed/oversized/stale
payload, duplicate or unknown ids and invalid resolver ids yield diagnostics and
unknown, without changing HTTP success. Each observation belongs only to its
response/credentials. No persistent delta cache. State never authorizes or
inserts an action into a plan.

Each completed result and each failure after an HTTP response has
`state: {actions, diagnostic?}`. `actions` preserves all validated entries from
that response, including ids outside the current plan. Missing/unusable State
has an empty list; unusable headers also have a short diagnostic. Query any id
with `stateFor(state, id)`; an omitted id is unknown. Never merge observations
across responses or use them to skip authorization or add actions to a plan.

## Publication and validation

Validate every file in staging, then commit owned actions and descriptor last.
Synchronous failures restore prior bytes. Retire only files owned by the
previous valid descriptor; preserve unrelated files, reject unowned collisions.
This is local rollback, not a crash-proof transaction or CDN atomicity promise.
Consumers reject mixed revisions. Validate file schema, executable mechanics
and linked publication integrity separately. Load bundled schemas relative to
installed modules; never process.cwd() or a network fallback.

## Exact schema keywords

Runtime schemas accept explicit type (or one non-null type plus null), properties,
required, additionalProperties, items, enum, const, title, description, default,
examples, minLength/maxLength/pattern, minimum/maximum/exclusiveMinimum/
exclusiveMaximum/multipleOf, minItems/maxItems/uniqueItems and minProperties/
maxProperties. Boolean schemas are supported in 3.1; parameter and body signature
roots still need explicit types. Arrays require items. Other keywords, including
format, readOnly/writeOnly, unevaluatedProperties, conditionals and schema ids,
are rejected. Declared schema properties named __proto__ are also rejected:
the bundled Ajv deliberately excludes that name. Other JSON property names are
validated as own properties. Annotation values are preserved, never executed or used as defaults.
OpenAPI 3.0 nullable and boolean exclusive bounds become equivalent draft-07
constraints. OpenAPI 3.1 uses its explicit nullable type union and numeric bounds.

Nested plan assignment containers are selected from the input schema, not
guessed from numeric property names. Array assignment indices are canonical
RFC 6901 indices limited to 10,000. Literal JSON property names remain data;
they cannot modify JavaScript prototypes. Path values . and .. are rejected
because URL implementations normalize dot segments. Whole body assignment
preserves any nested object/array/scalar JSON value permitted by its schema.

The runner refuses redirects; API connection/timeout failures are conservative
outcome-unknown results. A pinned prepared snapshot intentionally avoids later
artifact fetches; callers choose when to obtain and validate a newer revision.
