# AURA Protocol - Frequently Asked Questions

## What is the difference between AURA and OpenAPI?

While both AURA and OpenAPI describe APIs, they serve fundamentally different purposes and audiences:

### OpenAPI
- **Purpose**: Documentation and code generation for human developers
- **Primary Users**: Software developers building API clients
- **Focus**: Technical API implementation details
- **Complexity**: Comprehensive, often verbose specifications
- **Discovery**: Not standardized; requires prior knowledge of API location
- **State Management**: Stateless; no built-in context awareness
- **Typical Use**: REST API documentation, SDK generation, API testing tools

### AURA
- **Purpose**: Enable autonomous AI agents to discover and use web capabilities
- **Primary Users**: AI agents and automation tools
- **Focus**: High-level capabilities and actions (what can be done, not how)
- **Complexity**: Simplified, declarative manifests optimized for machine understanding
- **Discovery**: Standardized at `/.well-known/aura.json`
- **State Management**: Dynamic state via `AURA-State` headers for context-aware interactions
- **Typical Use**: AI agent interactions, automated workflows, machine-readable web

### Key Technical Differences

| Feature | OpenAPI | AURA |
|---------|---------|------|
| **Specification Location** | Variable (often `/swagger.json` or `/openapi.json`) | Fixed at `/.well-known/aura.json` |
| **Schema Complexity** | Full JSON Schema with refs, allOf, oneOf, etc. | Simplified JSON Schema subset |
| **Authentication** | Detailed security schemes (OAuth2, JWT, etc.) | Simple auth hints (cookie, bearer, none) |
| **Versioning** | API version in URL or header | Capability-level versioning with integer `v` field |
| **Parameter Mapping** | Direct HTTP mapping | JSON Pointer syntax for flexible mapping |
| **Response Format** | Detailed response schemas | Focus on capabilities, not response structures |
| **State Context** | None | `AURA-State` header for dynamic context |

### Example Comparison

**OpenAPI (typical REST endpoint):**
```yaml
/api/posts/{postId}:
  get:
    operationId: getPost
    parameters:
      - name: postId
        in: path
        required: true
        schema:
          type: string
    responses:
      200:
        description: Success
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Post'
```

**AURA (capability-focused):**
```json
"read_post": {
  "id": "read_post",
  "v": 1,
  "description": "Read a specific blog post",
  "parameters": {
    "type": "object",
    "required": ["id"],
    "properties": {
      "id": { "type": "string" }
    }
  },
  "action": {
    "type": "HTTP",
    "method": "GET",
    "urlTemplate": "/api/posts/{id}",
    "parameterMapping": { "id": "/id" }
  }
}
```

## Why not just use OpenAPI for AI agents?

1. **Complexity Overhead**: OpenAPI specs can be thousands of lines long with deep nesting and references that are difficult for LLMs to parse efficiently
2. **No Standard Discovery**: Agents must know where to find the OpenAPI spec beforehand
3. **Missing Context**: No built-in way to communicate current state or available actions based on authentication
4. **Implementation Details**: OpenAPI exposes low-level HTTP details rather than high-level capabilities
5. **Token Efficiency**: AURA's simplified schema reduces token usage for LLM processing

## How does AURA handle authentication?

AURA uses a simplified approach:
- The manifest provides an `authHint` (cookie, bearer, or none)
- The server sends authentication state via the `AURA-State` header
- Capabilities are dynamically filtered based on authentication status
- Agents manage sessions using standard HTTP mechanisms (cookies, tokens)

## What is the AURA-State header?

The `AURA-State` header is a Base64-encoded JSON object sent with every response that provides:
- Current authentication status (`isAuthenticated`)
- Available capabilities for the current state
- Additional context relevant to the agent

Example:
```json
{
  "isAuthenticated": true,
  "capabilities": ["create_post", "update_post", "delete_post"],
  "context": { "userId": "123", "role": "author" }
}
```

## How do agents discover AURA-enabled websites?

Agents check for the manifest at the standardized location: `https://example.com/.well-known/aura.json`

This follows the RFC 8615 well-known URI standard, making discovery automatic and consistent across all AURA-compliant sites.

## Can AURA and OpenAPI coexist?

Yes! Many sites might offer:
- AURA manifest for AI agents at `/.well-known/aura.json`
- OpenAPI spec for developers at `/api/docs/openapi.json`
- Both can describe the same underlying API with different perspectives

## What are URI Templates in AURA?

AURA uses RFC 6570 URI Templates for flexible URL construction:
- Simple substitution: `/posts/{id}`
- Query parameters: `/posts{?limit,offset}`
- Exploded arrays: `/posts{?tags*}` → `/posts?tags=ai&tags=web`

## How does AURA handle versioning?

Unlike OpenAPI's API-wide versioning, AURA versions individual capabilities:
- Each capability has a `v` field (integer)
- Increment `v` when making breaking changes
- Agents can adapt to capability changes independently
- Backward compatibility through multiple capability versions

## What about CORS?

AURA includes a `cors` hint in each action to inform browser-based agents whether cross-origin requests are supported. Server implementations should configure appropriate CORS headers.

## Is AURA only for web applications?

While designed for web applications, AURA's principles can extend to:
- Desktop applications exposing local HTTP servers
- IoT devices with HTTP interfaces
- Mobile apps with web services
- Any system that can serve HTTP and JSON

## How do I validate an AURA manifest?

Use the built-in CLI validator:
```bash
# After building the aura-protocol package
npx aura-validate manifest.json
```

Or programmatically with the TypeScript library:
```typescript
import { validateManifest } from 'aura-protocol';
const isValid = validateManifest(manifestJson);
```

## Where can I learn more?

- **Specification**: This repository contains the canonical AURA specification
- **Reference Implementation**: See `packages/reference-server` for a complete example
- **Client Examples**: Check `packages/reference-client` for agent implementations
- **GitHub Issues**: Report bugs or suggest features at https://github.com/osmandkitay/aura/issues