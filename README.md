# AURA (Agent-Usable Resource Assertion) Project

AURA is a monorepo containing the full ecosystem for a new web protocol designed to make websites machine-navigable. It enables a website to declare its capabilities in a structured format, allowing AI agents to interact with it reliably and securely.

## 🚀 Core Philosophy

The web was built for humans. AURA is the bridge to make it ready for agents. Instead of relying on brittle web scraping and screen-reading, AURA allows websites to provide a "semantic API" for their interactive components.

## 📦 Packages

This monorepo is managed with `pnpm` and contains the following packages:

| Package | Description |
| --- | --- |
| **`@aura/protocol`** | Defines the core TypeScript interfaces for the AURA and BEP (Basic Execution Protocol) standards. |
| **`@aura/lighthouse-app`** | A Next.js reference application that implements and serves an AURA assertion. This is the "AURA-enabled" website. |
| **`@aura/ai-core-cli`** | A Node.js CLI that acts as the "brain". It fetches a site's AURA assertion, uses an LLM to translate a user's prompt into a BEP command, and sends it to the browser extension. |
| **`@aura/adapter`** | A browser extension that detects AURA-enabled sites, listens for commands from the AI Core, and executes them on the page. |

## 🛠️ How to Run the Ecosystem

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/installation)
- An [OpenAI API Key](https://platform.openai.com/api-keys)

### 1. Installation

Clone the repository and install dependencies from the root directory:

```bash
git clone <repository_url>
cd aura-project
pnpm install
```

### 2. Build Packages

Build the protocol and CLI packages:

```bash
pnpm --filter=@aura/protocol build
pnpm --filter=@aura/ai-core-cli build
```

### 3. Run the Lighthouse App (The Website)

In a separate terminal, start the Next.js reference application:

```bash
pnpm --filter=aura-lighthouse-app dev
```
This will start a server at `http://localhost:3000`. You can navigate to `http://localhost:3000/api/aura` to see the AURA assertion JSON.

### 4. Load the Browser Extension

- Open Google Chrome and navigate to `chrome://extensions`.
- Enable "Developer mode".
- Click "Load unpacked".
- Select the `packages/aura-adapter/build/chrome-mv3-dev` directory.
- The "Aura Adapter" extension should now be visible and active.

### 5. Run the AI Core

The AI Core's WebSocket server must be running to communicate with the extension.

**In a new terminal:**

```bash
# Start the AI core in server mode
pnpm --filter=@aura/ai-core-cli start -- --server
```
You should see a message that the server is waiting for the Emissary (the extension) to connect.

### 6. Execute a Command

With everything running, open a **new terminal** to send a command.

- Navigate to `http://localhost:3000` in your browser.
- Click the Aura extension icon; you should see "AURA Detected!".
- Run the following command, replacing `<YOUR_OPENAI_KEY>` with your key:

```bash
pnpm --filter=@aura/ai-core-cli start -- -u http://localhost:3000 -p "log me in with email test@example.com and password secure123" -k <YOUR_OPENAI_KEY>
```

Watch as the AI Core generates a command and the browser extension automatically fills and submits the login form on the Lighthouse website. 