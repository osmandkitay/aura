# AURA 2.0 Core Shape

AURA 2.0 is centered on `actions[]`.
Each action has a stable semantic key, a normalized intent, an entrypoint, provenance, and confidence.
When two source actions normalize to the same meaning, AURA keeps the shared semantic `key` and assigns every member a collision-safe `id` such as `post.create__7a4d3c91b2ef`.
That suffix is the first 12 or more lowercase hex characters of a SHA-256 hash over the canonical source identity seed: `origin.source`, `entrypoint.method`, `entrypoint.path`, `origin.ref`, and `origin.operationId`.
Mutable representation fields such as `title`, `docs`, `aliases`, `confidence`, and `origin.summary` do not affect locator identity.
Action order and published locators are derived from stable source facts, not from raw source traversal order.
The default canonical artifact is repo-path-free: it keeps portable provenance but omits local file traces such as `source.file` and `origin.file`.
Final action order is settled during finalization; canonicalization only cleans representation.
Existing AURA 2.0 input is treated as already-finalized truth only when its `actions[]` order and `id` values already match that canonical finalized result.
Validation and publish preserve finalized order and finalized ids and fail malformed existing documents instead of silently re-sorting or reassigning them.

## Schema URL strategy

Schema identifiers are pinned to the `v2.0.0-alpha.1` Git tag.
That keeps derived and published artifacts stable even as `main` moves and matches the first tagged 2.0 alpha release in this repo.

## Top-level document

```json
{
  "$schema": "https://raw.githubusercontent.com/osmandkitay/aura/v2.0.0-alpha.1/packages/aura-protocol/schema/aura-v2.schema.json",
  "protocol": "AURA",
  "version": "2.0",
  "site": { "name": "Example" },
  "source": { "kind": "openapi" },
  "actions": []
}
```

In canonical output, `source` records only the input kind.
Repo-local checkout paths are not part of the default artifact.

## Required action fields

- `id`: stable unique locator used for published detail files
- `key`: public semantic key in `object.verb` form
- `title`: human-readable label
- `intent`: normalized `{ domain, verb }`
- `entrypoint`: how the action is called
- `origin`: where the semantics came from
- `confidence`: how trustworthy the normalized key is

## Common optional fields

- `auth`
- `confirm`
- `risk`
- `input`
- `result`
- `docs`
- `aliases`
- `extensions`

## Published surface

`publish` writes a small index to `/.well-known/aura.json` and one detail file per action under `/.well-known/aura/actions/`.
The index is intentionally smaller than the derived document.
Its `href` values point to action detail files by `id`, not by `key`, so semantic key collisions do not corrupt the published surface.
`id` is a durable locator derived from source identity facts, not a full representation hash.
Derived and published JSON is written in a stable, human-readable form with recursively sorted object keys and safe unordered arrays such as `aliases` and JSON Schema `required` entries canonicalized for clean diffs.
This is intentionally a well-known discovery artifact, not a hosted registry protocol.
