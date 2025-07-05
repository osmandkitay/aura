# AURA Protocol: Reference Client

This package provides a minimal, backend-only reference client for interacting with AURA-enabled servers. It is not a browser extension or a UI application; instead, it demonstrates the core logic of consuming the AURA protocol programmatically.

It contains two primary example scripts:
- **`src/agent.ts`**: A script that uses an LLM (via the OpenAI API) to interpret a natural language prompt, select an appropriate capability from a server's manifest, and execute it.
- **`src/crawler.ts`**: A script that fetches a server's manifest and displays its structure, demonstrating how a search engine or indexer might consume AURA data.

## Getting Started

All commands should be run from the root of the monorepo.

### 1. Install Dependencies

If you haven't already, install the dependencies for the entire project:

```bash
pnpm install
```

### 2. Set Up Your Environment

This client uses the OpenAI API for the `agent` script. Create a `.env` file in this directory (`packages/reference-client`) and add your API key:

```
OPENAI_API_KEY="sk-..."
```

### 3. Run the Scripts

To run the scripts, use the following commands from the project root.

#### Agent

The agent takes a server URL and a natural language prompt as arguments.

```bash
pnpm --filter aura-reference-client agent -- <server_url> "<prompt>"

# Example:
pnpm --filter aura-reference-client agent -- http://localhost:3000 "list all the blog posts"
```

#### Crawler

The crawler takes a server URL as an argument.

```bash
pnpm --filter aura-reference-client crawler -- <server_url>

# Example:
pnpm --filter aura-reference-client crawler -- http://localhost:3000
``` 