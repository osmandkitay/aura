# AURA: Agent Usable Resource Assertion

AURA is an open protocol for making a website's capabilities machine-readable and safe to act on. Instead of scraping UIs, agents read a manifest and call explicit HTTP actions.

[![NPM Version](https://img.shields.io/npm/v/@aura/protocol.svg)](https://www.npmjs.com/package/aura-protocol)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## How AURA Works

- **Manifest (`aura.json`)**: A site serves a machine-readable manifest at `/.well-known/aura.json`.
- **Capabilities**: Each capability describes a single HTTP action with parameters and a URL template.
- **AURA-State header**: Each response can include an `AURA-State` header to describe the current context (for example, whether the user is authenticated).

## Packages in This Repo

- `packages/aura-protocol`: TypeScript interfaces and the JSON Schema published as `@aura/protocol` (current version 1.0.3 on npm).
- `packages/reference-server`: A reference Next.js server showing how to serve a manifest and capabilities. It is a demo only and is not a production dependency.
- `packages/reference-client`: A reference client and test workflow that consume the protocol.

## Quickstart (Local Demo)

Install and run the reference server:

```bash
pnpm install
pnpm --filter aura-reference-server dev
```

Then verify the manifest:

```bash
curl http://localhost:3000/.well-known/aura.json
```

## Practical Examples

### Login and Authenticated Action (curl)

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

Create `packages/reference-client/.env`:

```
OPENAI_API_KEY="sk-..."
```

Run an agent prompt:

```bash
pnpm --filter aura-reference-client agent -- http://localhost:3000 "log in and create a post titled Hello"
```

### Manifest Snippet (Login Capability)

```json
{
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

## Build and Test

Build everything:

```bash
pnpm run build
```

Run tests (requires the reference server running on `http://localhost:3000`):

```bash
pnpm test
pnpm --filter aura-reference-client test-workflow http://localhost:3000
```
