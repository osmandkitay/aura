# Architecture Seams

This repo stops at three responsibilities:

- derive a local source file into AURA 2.0 actions
- validate the derived or published artifact
- publish a small well-known index plus action detail files

That publish surface is the web-native boundary of this core.
Its action `id` values are durable locators derived from stable source identity facts, not from mutable presentation fields or full document fingerprints.
Its default bytes are repo-path-free: portable provenance stays, local checkout trace does not.
Final action order belongs to the finalization path; canonicalization only performs representation cleanup.
It is designed to be hostable as static files today and consumable by future action catalogs, service descriptors, or read-surface tooling later.
Those later systems are deliberately outside this repo.

## Future seams

### New derive adapters

Separate work can add more local source adapters without changing the publish surface.
Examples: richer OpenAPI coverage, framework-specific local exports, or other static site metadata.

### Publish extensions

Separate work can add optional markdown docs generation, signing, or packaging on top of the published files.
Those extensions should consume the AURA 2.0 document instead of bloating this core.

### Separate repos

If crawl, bridge, index, or signing systems exist later, they should live outside this repo.
They should consume the well-known AURA output, not redefine the core schema or CLI story.
