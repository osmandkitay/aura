# Current contract changes

The active profile is `2.0.0-alpha.3`; see [the contract](../spec/aura-v2-core.md).
Regenerate declarations and artifacts against this profile. Older formats are
rejected directly; no migration runtime or compatibility adapter is shipped.
Use a clean publish directory when changing profiles; an old-profile descriptor
does not establish ownership of files for the current publisher.
Existing release tags are immutable. Public schema commands require the new
alpha.3 tag and verified schema bytes; that gate and the separate npm registry
publication are complete. Install `aura-protocol@2.0.0-alpha.3` explicitly:
`alpha=2.0.0-alpha.3`, while `latest` remains 1.0.5. Registry integrity and an
isolated installation of all three CLIs are verified; see the
[release evidence](../implementation.md).

## Changes from alpha.2

- Numbers must be finite binary64 values, and integers must be safe. This rule
  applies recursively to literals, schema data, inputs, responses and outputs.
  Large IDs must be strings in the API contract; the runner fails explicitly
  rather than forwarding rounded IDs.
- Model and credential projections cannot overlap, including aliases and
  ancestor/descendant pointers. Declare separate public fields explicitly.
- HTTP path placeholders require literal `{name}` braces. Percent-encoded
  braces remain URL data and do not satisfy a path binding.
- Runner results now keep `state: {actions, diagnostic?}` on the response that
  supplied it. Read any descriptor id with `stateFor(state, id)`. Missing ids
  are unknown; observations do not persist across responses.

## Declaration requirements replacing alpha.1 and v1

Supply explicit publisher/source/version, API target, stable id/key/risk and
selected outputs. Preserve a locator by declaring its id verbatim. Intent,
confidence, risk, confirmation and collision identities are never inferred.
Input uses path/query/header/body namespaces and separate HTTP bindings. L1
contains short signatures and relative hrefs; L2 contains the complete action.
All files share a content revision. Plans name step ids and backward output
references. State uses the v2 prefix and base64url payload.

The small linear runner remains in scope; crawlers, demo stacks, planners and
hosted services remain outside core. Earlier rewrite logs remain in Git history.
