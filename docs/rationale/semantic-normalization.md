# Semantic Normalization Rules

AURA 2.0 does not publish raw endpoint names as its primary semantic layer.
It derives a stable action key in `object.verb` form and keeps raw names only as provenance.

## Canonical verbs

- `create`
- `get`
- `list`
- `search`
- `update`
- `delete`
- `publish`
- `login`
- `logout`
- `send`
- `perform`

## Rule order

1. Match explicit session patterns first.
   - `loginUser` -> `session.login`
   - `logoutCurrentSession` -> `session.logout`
2. Match account registration before generic create logic.
   - `registerUser` -> `account.create`
3. Match explicit action verbs.
   - `create_post_v3` -> `post.create`
   - `publishPost` -> `post.publish`
4. Infer the object from known domain vocabulary or the path.
   - `/posts/{id}` -> `post.*`
   - `/payments/send` -> `payment.*`
5. Fall back to a generic semantic key when the source name is ugly or vague.
   - `doThingFinal` -> `thing.perform`

## Confidence labels

- `high`: both verb and object came from known vocabulary or a strong special-case pattern
- `medium`: only one side was clearly recognized
- `low`: the key required a fallback noun or generic verb

## Provenance retention

Raw names remain machine-readable in two places:

- `aliases[]`
- `origin.operationId` or `origin.capability`

That keeps the published key stable without throwing away the source signal.
Default canonical artifacts keep that portable provenance while omitting local file-path trace.

## Collision policy

If two source actions normalize to the same semantic meaning, AURA does not mutate the semantic `key`.

- `key` stays semantic, for example `post.create`
- `intent` stays aligned with that key
- `id` carries uniqueness as a durable locator, for example `post.create__7a4d3c91b2ef`
- published `href` locators use `id`, not `key`
- duplicate groups are ordered deterministically from the same source identity facts used to derive the hash suffix
- the locator seed includes only `origin.source`, `entrypoint.method`, `entrypoint.path`, `origin.ref`, `origin.operationId` or `origin.capability`, and `origin.resource`
- mutable derived fields such as `title`, `docs`, `aliases`, `confidence`, and `origin.summary` do not affect locator identity

This keeps public semantics clean while giving agents a durable web locator that does not renumber when a new colliding sibling appears.
