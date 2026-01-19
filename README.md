# AURA: Agent-Usable Resource Assertion

AURA is an open protocol for making a website's capabilities machine-readable and explicitly permissioned to act on. Instead of scraping UIs, agents (LLM tool callers, automation clients, or plugins) read a manifest and call declared HTTP actions that are validated and authorized on the server.

Spec status: Experimental (v1.0 format; breaking changes may occur).

[![NPM Version](https://img.shields.io/npm/v/aura-protocol.svg)](https://www.npmjs.com/package/aura-protocol)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Integration in 60 seconds

- Serve `/.well-known/aura.json` with declared capabilities and actions (public, cacheable, no secrets).
- Implement the capability endpoints and enforce auth/authorization and input validation.
- Emit `AURA-State` to describe dynamic availability (optional but recommended).
- Validate the manifest with `aura-validate`.

## Table of Contents

- [Integration in 60 seconds](#integration-in-60-seconds)
- [What is AURA?](#what-is-aura)
- [Philosophy](#philosophy)
- [Core Concepts](#core-concepts)
- [How It Works](#how-it-works)
- [Quickstart: Local Demo](#quickstart-local-demo)
- [Production Demo (Build + Start)](#production-demo-build--start)
- [Environment Variables](#environment-variables)
- [Security model (non-negotiable)](#security-model-non-negotiable)
- [Integrate AURA Into Your Site](#integrate-aura-into-your-site)
- [Validation and Tooling](#validation-and-tooling)
- [Reference Packages](#reference-packages)
- [FAQ](#faq)
- [Troubleshooting](#troubleshooting)
- [References](#references)
- [License](#license)

## What is AURA?

AURA (Agent-Usable Resource Assertion) is a small, explicit contract between a website and an AI agent. A site publishes a manifest at `/.well-known/aura.json` that lists capabilities (verbs) and optionally resources (nouns) with concrete HTTP actions. Agents can then act without guessing UI flows or scraping HTML.

AURA is not a replacement for authentication or authorization, and it is not a universal API description. Think of it as a tool manifest: a curated set of actions intended for automated execution; the manifest is descriptive, not permissive, and the server remains the source of truth.

## Philosophy

- **Explicit over implicit**: Actions are declared, not inferred from markup.
- **Small, auditable surface**: A compact manifest is easier to review and secure than UI automation.
- **State-aware by default (advisory)**: The `AURA-State` header communicates context; the server remains the source of truth.
- **Server-enforced**: The manifest is descriptive. Every action is validated server-side and authenticated/authorized as required.
- **Compatibility, not replacement**: AURA complements your existing APIs and auth. It does not replace them.

## Core Concepts

Core terms used in this repo (informal; see the schema for canonical fields):

- **Manifest (`/.well-known/aura.json`)**: The machine-readable contract with `$schema`, `protocol`, `version`, `site`, `resources`, and `capabilities` (all required).
- **Resources**: Noun groupings (required, may be `{}`) with `uriPattern`, `description`, and HTTP operations that map to capability IDs.
- **Capabilities**: Verbs (required, may be `{}`) with parameter schema and an `HttpAction` definition.
- **HttpAction**: How to execute a capability (method, RFC 6570 `urlTemplate`, encoding, parameter mapping, optional `parameterLocation` and `cors`).
- **AURA-State header**: Base64-encoded JSON describing context and available capability IDs; advisory, not permission.
- **Policy (optional)**: Hints like `rateLimit` (limit/window) and `authHint` (`none`, `cookie`, `bearer`).

## How It Works

1. A client fetches `/.well-known/aura.json`.
2. The client selects a capability (optionally filtered by `AURA-State` context).
3. The client maps arguments from the agent-provided input object via JSON Pointer into the request body/query/path and expands the URL template.
4. The server validates the request, enforces auth/authorization and rate limits, logs/audits as configured, and executes the action.

## Quickstart: Local Demo

Prereqs: Node.js 18+ (20+ recommended) and pnpm (run `corepack enable` if needed).

From the repo root:

```bash
pnpm install
pnpm --filter aura-reference-server dev
```

Verify the manifest:

```bash
curl http://localhost:3000/.well-known/aura.json
```

You should see a JSON object with `protocol`, `version`, and `capabilities`.

Demo credentials (local development only):

- Email: `demo@aura.dev`
- Password: `password123`

### Login and Authenticated Action (curl, direct API call)

This bypasses the manifest and is just a direct API sanity check. If you use cookie auth in production, add CSRF protection and SameSite cookies.

```bash
# Save the auth cookie after login
curl -i -c cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@aura.dev","password":"password123"}' \
  http://localhost:3000/api/auth/login

# Use the cookie to create a post
curl -i -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"title":"Hello","content":"From AURA"}' \
  http://localhost:3000/api/posts
```

### Use the Reference Client

The reference client uses OpenAI's API to plan actions; the AURA protocol itself is model-agnostic.

Create `packages/reference-client/.env`:

```dotenv
OPENAI_API_KEY=YOUR_KEY_HERE
```

Do not commit `.env` files.

The `agent` command fetches the manifest, selects capabilities, and calls the declared HTTP actions (no UI scraping).

Run the agent:

```bash
pnpm --filter aura-reference-client agent -- http://localhost:3000 "log in and create a post titled Hello"
```

Inspect the manifest with the crawler:

```bash
pnpm --filter aura-reference-client crawler -- http://localhost:3000
```

Run the end-to-end workflow test:

```bash
pnpm --filter aura-reference-client test-workflow http://localhost:3000
```

## Production Demo (Build + Start)

If you want a production-like demo:

```bash
pnpm --filter aura-reference-server build
pnpm --filter aura-reference-server start
```

The server will be available at `http://localhost:3000`. This is still a demo: auth is simplified and data is in-memory.

## Environment Variables

Only the following are required for the reference demos:

- `packages/reference-client/.env`: `OPENAI_API_KEY` for the `agent` script.
- `PORT`: Optional. Overrides the default Next.js port for the reference server.

## Security model (non-negotiable)

- AURA does not grant permission; it describes actions and inputs.
- Every capability is authenticated/authorized server-side as appropriate.
- Rate-limit and log capability calls; attach request IDs for auditability.
- Treat `AURA-State` as advisory context; keep it compact and never encode secrets.
- Avoid destructive capabilities without explicit user consent or confirmation flows.

## Integrate AURA Into Your Site

### 1. Serve a Manifest at `/.well-known/aura.json`

If you are using Next.js, place it at `public/.well-known/aura.json`. Keep it public and avoid secrets. Serve it with `Content-Type: application/json` and cache headers (ETag/Cache-Control) so clients can safely cache it.

The schema requires `$schema`, `resources`, and `capabilities`. Both `resources` and `capabilities` may be empty objects (`{}`) if you only need one or the other.

Minimal example:

```json
{
  "$schema": "https://unpkg.com/aura-protocol@1.0.4/dist/aura-v1.0.schema.json",
  "protocol": "AURA",
  "version": "1.0",
  "site": {
    "name": "Example Site",
    "url": "https://example.com"
  },
  "resources": {},
  "capabilities": {}
}
```

A more complete example with a capability:

```json
{
  "$schema": "https://unpkg.com/aura-protocol@1.0.4/dist/aura-v1.0.schema.json",
  "protocol": "AURA",
  "version": "1.0",
  "site": {
    "name": "Example Site",
    "url": "https://example.com"
  },
  "resources": {
    "auth_login": {
      "uriPattern": "/api/auth/login",
      "description": "Authentication login endpoint",
      "operations": {
        "POST": {
          "capabilityId": "login"
        }
      }
    }
  },
  "capabilities": {
    "login": {
      "id": "login",
      "v": 1,
      "description": "Authenticate user with email and password",
      "parameters": {
        "type": "object",
        "required": ["email", "password"],
        "properties": {
          "email": { "type": "string", "format": "email" },
          "password": { "type": "string", "minLength": 8 }
        }
      },
      "action": {
        "type": "HTTP",
        "method": "POST",
        "urlTemplate": "/api/auth/login",
        "encoding": "json",
        "parameterMapping": {
          "email": "/email",
          "password": "/password"
        }
      }
    }
  }
}
```

**Schema reality:** `$schema` is required for v1.0 manifests. The schema's `$id` is `https://aura.dev/schemas/v1.0.json`, but aura.dev hosting is planned and not yet live. For now, use the versioned Unpkg URL shown above or reference the bundled schema at `node_modules/aura-protocol/dist/aura-v1.0.schema.json`. Validation with `aura-validate` works offline on local files.

To demonstrate state-aware behavior, add authenticated capabilities (for example, `create_post`) and include them in `AURA-State` only when a user is logged in.

### 2. Implement the Capability Endpoints

Your API routes must match the manifest (method + URL template). Validate input using JSON Schema, and enforce authentication and authorization rules for each capability. In the reference server, `validateRequest` in `packages/reference-server/lib/validator.ts` uses Ajv to enforce the capability schema.

### 3. Emit `AURA-State` for Dynamic Capabilities

The `AURA-State` header is Base64-encoded JSON. It can indicate authentication and what capabilities are currently available; clients should treat it as advisory context and rely on server errors for truth. Keep it compact to fit header size limits and never encode secrets.

```ts
const auraState = {
  isAuthenticated: true,
  context: { path: "/api/posts", timestamp: new Date().toISOString() },
  capabilities: ["list_posts", "create_post"]
};

const headerValue = Buffer.from(JSON.stringify(auraState)).toString("base64");
res.setHeader("AURA-State", headerValue);
```

Note: The reference server uses standard Base64. If you control both sides, Base64URL is also acceptable to avoid `+` and `/` in headers.

### 4. Validate and Test

Use the CLI validator and your own tests:

```bash
npx -y -p aura-protocol aura-validate public/.well-known/aura.json
```

To validate a remote manifest, download it first:

```bash
curl -fsSL https://example.com/.well-known/aura.json -o aura.json
npx -y -p aura-protocol aura-validate aura.json
```

Note: `aura-validate` currently validates local files only. Download remote manifests to a file before validating.

### 5. Production Checklist

- Serve `/.well-known/aura.json` with `Content-Type: application/json` and cache headers (ETag/Cache-Control).
- Document capability changes and increment the `v` field for breaking changes.
- Every capability should have an authorization rule and a rate limit.
- Log capability calls with request IDs for auditability.
- Keep `AURA-State` compact, non-sensitive, and advisory.
- Add CORS headers for the manifest if browser-based agents will fetch it.

## Validation and Tooling

The `aura-protocol` package ships:

- TypeScript types for `AuraManifest`, `Resource`, `Capability`, `HttpAction`, and `AuraState`.
- JSON Schema bundled at `dist/aura-v1.0.schema.json`. For editor tooling, reference the versioned CDN URL: `https://unpkg.com/aura-protocol@1.0.4/dist/aura-v1.0.schema.json`.
- `aura-validate` CLI to validate local manifest files and cross-check resource/capability references.

Installation:

```bash
npm install aura-protocol
```

Example runtime validation (requires `ajv`):

```ts
import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv";

const schemaPath = path.join(
  process.cwd(),
  "node_modules",
  "aura-protocol",
  "dist",
  "aura-v1.0.schema.json"
);
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync("public/.well-known/aura.json", "utf8"));

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);
if (!validate(manifest)) {
  console.error(validate.errors);
}
```

## Reference Packages

- `packages/aura-protocol`: Protocol types, schema, and the `aura-validate` CLI for integrators.
- `packages/reference-server`: Next.js demo server that publishes a manifest, auth, and `AURA-State`.
- `packages/reference-client`: Node.js demo client with `agent`, `crawler`, and `test-workflow` for agent builders.

## FAQ

**Is AURA a replacement for OpenAPI?**  
No. OpenAPI describes the full endpoint surface. AURA declares a curated set of actions intended for automated execution, with parameter mapping and state hints. Use both if needed.

**Can a malicious site lie in the manifest?**  
Yes. Treat manifests as claims tied to domain trust. Agents should rely on server enforcement and error handling, and only act on sites they trust. Signing or attestation is a possible future direction.

**Do I have to expose private APIs?**  
No. AURA only describes what you choose to expose. Your existing auth and authorization remain in place.

**How do agents know what they can do right now?**  
Use the `AURA-State` header to return the capability list for the current session. It is advisory; the server remains the source of truth.

**What if my endpoints use path and query parameters?**  
Use RFC 6570 URL templates in `urlTemplate` and JSON Pointer in `parameterMapping`.

**Can I add my own fields to the manifest?**  
Yes. The current schema allows additional fields. Clients should ignore unknown keys; prefer namespacing extensions (for example, `x-your-org`).

## Troubleshooting

See:

- `TROUBLESHOOTING.md`: Common setup and runtime issues.
- `MANIFEST_VALIDATION.md`: Validator usage and schema troubleshooting.
- `packages/reference-server/DEPLOYMENT.md`: Deployment notes for the reference server.

## References

AURA builds on URI templates (RFC 6570) and JSON Pointer (RFC 6901) for deterministic parameter binding.

- [RFC 6570: URI Templates](https://datatracker.ietf.org/doc/html/rfc6570)
- [RFC 6901: JSON Pointer](https://datatracker.ietf.org/doc/html/rfc6901)
- [RFC 8615: Well-Known URIs](https://datatracker.ietf.org/doc/html/rfc8615)
- [JSON Schema](https://json-schema.org)

## License

MIT
