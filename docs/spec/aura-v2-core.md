# AURA 2.0 Core Shape

AURA 2.0 is centered on `actions[]`.
Each action has a stable semantic key, a normalized intent, an entrypoint, provenance, and confidence.
When two source actions normalize to the same meaning, AURA keeps the shared semantic `key` and assigns a collision-safe `id` such as `post.create__2`.

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
This is intentionally a well-known discovery artifact, not a hosted registry protocol.
