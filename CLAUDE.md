# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AURA (Agent-Usable Resource Assertion) is an open protocol for making websites machine-readable for AI agents. It consists of a TypeScript monorepo with three main packages:

- **aura-protocol**: Core protocol definitions and JSON Schema validation
- **reference-server**: Next.js server implementation demonstrating AURA compliance
- **reference-client**: Backend-only client showing agent and crawler implementations

## Development Commands

### Setup
```bash
# Install all dependencies (from root)
pnpm install
```

### Build
```bash
# Build all packages
pnpm run build

# Build specific package
pnpm --filter aura-protocol build
pnpm --filter aura-reference-server build
pnpm --filter aura-reference-client build
```

### Testing
```bash
# Run all tests
pnpm test --run

# Run tests with coverage
pnpm test --coverage

# Run tests in watch mode
pnpm test
```

### Development Servers
```bash
# Start reference server (usually on http://localhost:3000)
pnpm --filter aura-reference-server dev

# Run reference client agent (requires OPENAI_API_KEY in packages/reference-client/.env)
pnpm --filter aura-reference-client agent -- <URL> "<prompt>"

# Run reference client crawler
pnpm --filter aura-reference-client crawler -- <URL>

# Run test workflow
pnpm --filter aura-reference-client test-workflow
```

### Schema Generation
```bash
# Generate JSON schemas from TypeScript (in aura-protocol)
pnpm --filter aura-protocol generate-schema
```

### Validation
```bash
# Use the CLI validator (after building aura-protocol)
npx aura-validate <manifest-file>
```

## Architecture

### Core Protocol (`packages/aura-protocol`)
- **src/index.ts**: Core TypeScript interfaces (AuraManifest, Capability, Resource, etc.)
- **scripts/generate-schema.ts**: Generates JSON schemas from TypeScript definitions
- **src/cli/aura-validate.ts**: CLI tool for validating AURA manifests
- Exports types and validation utilities for use by other packages

### Reference Server (`packages/reference-server`)
- **Next.js application** with API routes demonstrating AURA protocol
- **pages/api/**: API endpoints with AURA capability implementations
  - auth/: Login/logout endpoints
  - posts/: CRUD operations for blog posts
  - user/: Profile management
- **lib/**: Core utilities
  - db.ts: Mock database for demonstration
  - validator.ts: Request/response validation against manifests
  - permissions.ts: Authorization logic
- **middleware.ts**: Adds AURA-State headers to responses
- **public/.well-known/aura.json**: The AURA manifest (static file)

### Reference Client (`packages/reference-client`)
- **src/agent.ts**: LLM-powered agent that interprets prompts and executes capabilities
- **src/crawler.ts**: Demonstrates indexing AURA-enabled sites
- **src/test-workflow.ts**: End-to-end testing workflow
- Uses OpenAI API for natural language understanding
- Implements cookie-based session management with tough-cookie

### Key Concepts

1. **Manifest**: Sites declare capabilities in `/.well-known/aura.json`
2. **Capabilities**: Discrete actions agents can perform (e.g., list_posts, create_post)
3. **Resources**: URI patterns where operations can be performed
4. **AURA-State Header**: Dynamic context sent with each response
5. **URI Templates**: RFC 6570 compliant templates for URL construction

### Testing Strategy

- Unit tests alongside source files (*.test.ts)
- Uses Vitest with Istanbul coverage
- Mock HTTP requests with node-mocks-http
- Test files validate:
  - Schema generation and synchronization
  - API endpoint functionality
  - Authentication flows
  - Validation logic