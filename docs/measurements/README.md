# Local measurements

Recorded 2026-10-29T01:39:50.282Z, v22.11.0, win32/x64.
These measurements describe alpha.2. Current correctness checks and release
limitations are recorded in [the implementation review](../implementation.md).
Raw results: [execution and baselines](local.json), [isolated package](package.json).
These are single loopback samples of a synthetic API. They do not establish a
production speedup, latency distribution, reliability percentage or token saving.
No tokenizer was selected; no token estimate is reported.

## Discovery and compilation

| Actions | Minified L1 bytes | Fresh-process compile ms | Peak RSS MiB |
| --- | --- | --- | --- |
| 1 | 594 | 95.324 | 57.57 |
| 10 | 1449 | 248.950 | 64.95 |
| 50 | 5249 | 641.634 | 86.11 |

The 1/10/50 action selections repeat the list contract with different explicit
ids; each case has one unique source operation. This measures index growth and
compiler work, not coverage of 50 distinct real endpoints. Compile timing starts
with loaded source/config; peak RSS includes Node and imported modules in a fresh
process per count. Warm in-process timings are retained separately in raw JSON.

The selected create L2 is 1738 minified bytes, with
368 input-schema bytes and 101
expanded response-schema bytes (160 including success-case
metadata). Dependent source-schema fetches: **0**.

## Execution

GET columns are descriptor/detail/API counts. Network contract bytes exclude the
caller-supplied plan in every representation.

| Steps | Cache condition | GETs / API calls | Contract bytes | Total ms | Runtime parse/projection ms |
| --- | --- | --- | --- | --- | --- |
| 1 | first | 1/1/1 | 2663 | 90.685 | 1.095 |
| 1 | cached-details | 0/0/1 | 0 | 4.029 | 0.878 |
| 3 | first | 1/3/3 | 5958 | 52.813 | 1.621 |
| 3 | cached-details | 0/0/3 | 0 | 4.291 | 1.149 |

Three steps read 51257 response bytes;
the model-visible selected output array is
32 bytes. The result envelope
also carries short status, locator/revision and numerical metrics; its exact
size is in raw JSON. Raw response bodies and credential values are excluded.
Successful intermediate LLM calls: **0**.

## Full and trimmed OpenAPI baseline

Both independent OpenAPI baselines execute the same explicit plan, enforce the
same supported inputs/auth/success checks, and pipe outputs without an LLM.
Every actual HTTP method/URL/header/body and selected output was compared with
AURA. The trimmed source removes unselected methods and unreachable components.

| Representation | Steps | Cache condition | Source/config GETs | Contract bytes | Total ms | Parse/projection ms |
| --- | --- | --- | --- | --- | --- | --- |
| full-openapi | 1 | first | 2 | 2533 | 23.933 | 1.342 |
| full-openapi | 1 | cached-source | 0 | 0 | 5.170 | 1.127 |
| trimmed-openapi | 1 | first | 2 | 1095 | 9.217 | 1.235 |
| trimmed-openapi | 1 | cached-source | 0 | 0 | 4.038 | 1.022 |
| full-openapi | 3 | first | 2 | 3037 | 6.100 | 1.192 |
| full-openapi | 3 | cached-source | 0 | 0 | 4.402 | 1.151 |
| trimmed-openapi | 3 | first | 2 | 2734 | 5.013 | 1.076 |
| trimmed-openapi | 3 | cached-source | 0 | 0 | 4.604 | 1.255 |

First runs fetch contracts from the same loopback artifact host; cached runs
reuse parsed/validated contracts and fetch none. AURA performs a separate
preflight of its plan and all selected details. These small fixtures show no
general speed advantage for AURA; the OpenAPI baseline can be smaller and
faster. AURA's measured result here is independent static consumption and
deterministic output transfer, not an exclusive ability to pipe HTTP calls.
Error/timeout/replanning behavior is verified in separate scenarios and excluded
from success timings. Unsupported profiles are rejection cases, not successful
measurements silently removed from an API benchmark.

## Clean-directory quickstart and package

The archived package has 57 files, 41668 compressed bytes and
185879 unpacked bytes. It was installed into a new temporary directory
outside the repository; existing npm cache/network conditions still apply.

| Step | Measured ms |
| --- | --- |
| Install archive and dependencies | 1315.57 |
| First derive → publish → validate | 800.58 |
| First installed-runner consumption | 384.47 |
| Entire archive check | 4753.11 |

The start condition is an existing API and prepared source/declaration; API
implementation and recipe discovery are excluded. All three installed CLI entry
points, six bundled schema byte comparisons and six independent Ajv validations
passed. Hiding the installed schema caused validation to fail as required; no
repository or working-directory rescue was used. This is a measured quickstart
example, not a five-minute guarantee on a fresh machine.

## Reproduce

```powershell
pnpm install
pnpm build
$env:AURA_RECORD_MEASUREMENTS = '1'
pnpm test --run tests/scenarios/measurements.test.ts
Remove-Item Env:AURA_RECORD_MEASUREMENTS
pnpm check:package -- --record
```

The public schema URL gate also passed after the approved publication of the
immutable `v2.0.0-alpha.2` tag: all six public URLs exactly match the packaged
schemas. The final package timing above includes those six public GETs.
[Tag CI](https://github.com/osmandkitay/aura/actions/runs/40802809571) independently
passed the same gate on Windows and Linux.
