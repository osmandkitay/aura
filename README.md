# AURA: The Protocol for a Machine-Readable Web

**AURA (Agent-Usable Resource Assertion)** is an open protocol for making websites understandable and operable by AI agents. It proposes a new standard for AI-web interaction that moves beyond fragile screen scraping and DOM manipulation towards a robust, secure, and efficient machine-readable layer for the internet.

The web was built for human eyes. AURA is a specification for giving it a machine-readable "API".

[![NPM Version](https://img.shields.io/npm/v/@aura/protocol.svg)](https://www.npmjs.com/package/@aura/protocol)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## The Vision: Why AURA?

Current AI agents interact with websites in a brittle and inefficient way:
1. **Screen Scraping:** They "look" at pixels and guess where to click. This is slow, expensive, and breaks with the slightest UI change.
2. **DOM Manipulation:** They parse complex HTML structures, which are inconsistent across sites and change frequently.
3. **Insecurity:** Website owners have no control over what an agent might do. An agent could accidentally or maliciously perform dangerous actions.

AURA solves this by allowing websites to **declare their capabilities** in a simple, standardized `aura.json` manifest file.

Instead of an agent guessing how to "create a post," the website explicitly states:
> *"I have a capability named `create_post`. It's an `HTTP POST` to `/api/posts` and requires `title` and `content` parameters."*

This is a fundamental paradigm shift from *imperative guessing* to *declarative interaction*.

## Core Concepts

* **Manifest (`aura.json`):** A file served at `/.well-known/aura.json` that acts as a site's "API documentation" for AI agents. It defines all available resources and capabilities.
* **Capability:** A single, discrete action an agent can perform (e.g., `list_posts`, `login`, `update_profile`). Each capability maps to a specific HTTP request.
* **State (`AURA-State` Header):** A dynamic HTTP header sent by the server with each response, informing the agent about the current context (e.g., is the user authenticated?) and which capabilities are currently available to them.

## This Repository

This repository is the **canonical specification for the AURA protocol**. It provides the core building blocks for the AURA ecosystem:

* **`packages/aura-protocol`**: The core `@aura/protocol` NPM package, containing TypeScript interfaces and the official JSON Schema for validation. **This is the heart of AURA.**
* **`packages/reference-server`**: A reference implementation of an AURA-enabled server built with Next.js. Use this to understand how to make your own website AURA-compliant.
* **`packages/reference-client`**: A minimal, backend-only reference client demonstrating two powerful ways to consume the protocol, without any browser or extension required.

## Getting Started: A 5-Minute Demonstration

See the protocol in action.

### 1. Install Dependencies

From the root of the monorepo, install all necessary dependencies for all packages.

```bash
pnpm install
```

### 2. Run the Reference Server

The server is a sample website that "speaks" AURA.

```bash
# This will start the server (usually on http://localhost:3000)
pnpm --filter aura-reference-server dev
```

You can now visit http://localhost:3000/.well-known/aura.json in your browser to see the manifest.

### 3. Run the Reference Agent

This simple agent uses an LLM to understand a prompt and execute a capability on the server.

First, create a `.env` file inside the `packages/reference-client` directory and add your OpenAI API key.

```
OPENAI_API_KEY="sk-..."
```

Then, run the agent with a URL and a prompt:

```bash
# (In a new terminal)
pnpm --filter aura-reference-client agent -- http://localhost:3000 "list all the blog posts"
```

Observe how the agent fetches the manifest, plans its action, and executes the list_posts capability directly.

### 4. Run the Crawler (The Big Vision)

This script demonstrates how a search engine could index an AURA-enabled site, understanding its functions, not just its content.

```bash
# In the client directory
pnpm --filter aura-reference-client crawler -- http://localhost:3000
```

The output shows a structured JSON object representing the site's capabilities. This is the future of search: indexing actions, not just pages.

## The Future is a Collaborative Ecosystem

This repository defines the standard. The true power of AURA will be realized when a community builds on top of it. We envision a future with:

* **Adapters** for all major web frameworks (Express, Laravel, Django, Ruby on Rails).
* **Clients** in every major language (Python, Go, Rust, Java).
* **Intelligent Applications** like browser extensions, search engines, and autonomous agents that leverage this new, structured layer of the web.

AURA is a public good. Fork it, build with it, and help us create a more intelligent and interoperable web. 