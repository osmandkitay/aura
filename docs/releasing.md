# Future releases

The currently supported package/profile is `2.0.0-alpha.3`. Read-only npm
metadata checked on 2026-10-30 reports `alpha=2.0.0-alpha.3` and `latest=1.0.5`.
Install explicitly with `npm install --save-exact aura-protocol@2.0.0-alpha.3`.
Recheck metadata when preparing a release; dist-tags can change.

Documentation on a branch cannot update an already published tarball. This
cleanup does not change the version or protocol, publish a package, create a
release tag, change npm tags, deprecate or remove a release.

## Checklist for a separately authorized release

1. Choose the version deliberately. Align workspace/package metadata, profile
   constants and types, schema IDs and immutable URL pins, examples, documentation
   and any relevant lockfile entries. Regenerate schemas and review intentional
   compatibility changes. Preserve every existing release tag.
2. Run the repository checks from a clean checkout with Node.js >=20.19 and
   pnpm 10.7.1:

   ```bash
   pnpm install --frozen-lockfile
   pnpm build
   pnpm test --run
   pnpm check:schemas
   pnpm check:package
   ```

   A timeout or partial test run is a failure to complete validation. Investigate
   it; do not weaken checks. The package check installs its exact archive in a
   clean temporary directory and exercises all three CLIs and installed schemas.
3. Review `npm pack --dry-run --json --ignore-scripts` from
   `packages/aura-protocol`. Only package metadata, the packaged README and
   intended dist assets belong in the archive. Exclude task briefs/drafts,
   dependencies, credentials, temporary files, caches and archives.
4. Retain the final `npm pack --json --ignore-scripts` archive and its SHA-512
   integrity outside tracked source. Install and test that exact retained archive
   in a fresh directory before upload; rebuilding later creates a new candidate.
5. When the chosen immutable schema URLs are publicly available, run
   `node scripts/check-package.mjs --remote`. Each of the six public schemas
   must match source and packaged bytes. A missing tag/URL is an unmet remote
   gate; local schema validation cannot substitute for it.
6. With separate release authorization and all gates passed, publish only the
   retained verified archive under the deliberately selected dist-tag. Verify
   registry integrity and an exact-version installation in a clean directory.
   Do not promote an experimental profile to `latest` accidentally.

Keep old releases available. Any future retirement should identify specific
obsolete versions and give an actionable exact-version replacement message.
Do not deprecate every version or use unpublishing as a migration mechanism.
