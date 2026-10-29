# Validation

`aura-protocol validate <file>` and `aura-validate <file>` support alpha.3
config, normal form, L1, L2, plan and decoded State shapes. Schemas are bundled
and loaded relative to the installed module, without a working-directory or
network fallback.

File APIs return `ValidationResult` (valid/errors/target/schemaPath).
Normal-form validation additionally checks content revision, unique stable ids,
canonical action order, executable binding coverage, output/response type
compatibility, supported mechanics and local requires/resolver references.
L2 validation checks its self-contained mechanics. L1 file validation checks
shape/ids/relative hrefs; the CLI and `validatePublication(indexPath)` also
read every linked detail and check signatures, provenance and revisions.

`preparePlan` validates the schema plus known actions, unique step ids,
backward output references, types, input assignment conflicts and known required/
literal inputs before API calls. Runtime validates actual inputs and response
values; static checking cannot prove future network behavior.
All value boundaries reject non-finite numbers and unsafe integers recursively,
including literals under open schemas. Config/L2 integrity checks also reject
overlapping output pointers with conflicting visibility and path bindings that
have no literal `{name}` placeholder. JSON Schema shape validation alone does
not replace these mechanical integrity checks.

`pnpm check:schemas` checks generated schemas for source/version drift.
`pnpm check:package` compares source/packed bytes and independently validates
installed artifacts with Ajv in a clean directory. `node scripts/check-package.mjs
--remote` additionally requires public version-pinned URLs to return matching
bytes; the new tag must be released first. It fails if the tag is absent.
No schema validation proves a publisher's intent/risk claim or API authority.
