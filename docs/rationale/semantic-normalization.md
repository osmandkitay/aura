# Explicit semantics

Publishers supply every selected action's id, key and risk. Missing declarations
fail. Endpoint names/descriptions/summaries remain provenance or human text;
they never drive intent, confidence, risk, confirmation or authority.
Agent-authored and human-authored recipes pass the same validation.

Example keys: session.login obtains the declared credential; post.create creates
a draft; post.publish publishes a selected draft; post.list reads posts. Custom
keys require no registry approval. Equal keys do not imply equal inputs, units
or permissions. Explicit locators survive sibling additions and key corrections.
