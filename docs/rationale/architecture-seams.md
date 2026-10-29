# Architecture boundaries

One package contains the local derive compiler, validation, static publish and a
small deterministic aura-runner. The runner consumes L1/L2 and a complete linear
plan. It never imports derive, OpenAPI resolution or semantic inference. The
compiler never calls a model. Runtime JSON/HTTP/validation/projection have costs.

The narrow runner scope is one linear plan, one descriptor and one API origin.
Demo app/server/client stacks, crawlers, browser automation, hosted registries,
bridges/signing, planners, schedulers and job databases remain outside core.
Test HTTP fixtures are not a product server stack. The host selects authority;
the target API enforces it. Publisher/source, API target and artifact host differ.

Compilation rejects conflicting output visibility and unbound URL placeholders.
Runtime checks actual numeric values before output transfer and rejects unsafe
integers instead of repairing IDs. State observations stay on their individual
HTTP results; there is no global availability cache or recovery machinery.
