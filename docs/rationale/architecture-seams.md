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

Descriptors and relative action files can be shared through ordinary static
hosting, existing documentation or Git repositories. A compatible consumer runs
locally and calls the separately declared API directly, without an AURA account
or execution intermediary. Third-party publication requires no AURA installation
on the API host and supplies neither account access nor target-site endorsement.

Discovery catalogs, agent skills and MCP or product integrations are optional
external projects. The contract and independent consumers provide evidence for
implementability; this package does not automatically add native agent support.
API, hosting, network and model costs remain with the services a caller chooses.

Compilation rejects conflicting output visibility and unbound URL placeholders.
Runtime checks actual numeric values before output transfer and rejects unsafe
integers instead of repairing IDs. State observations stay on their individual
HTTP results; there is no global availability cache or recovery machinery.
