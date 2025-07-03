# Aura Adapter (Browser Extension)

This package, built with [Plasmo](https://www.plasmo.com/), is the "Emissary" of the AURA ecosystem. It's a browser extension that bridges the gap between the AI Core and AURA-enabled websites.

## Features

- **AURA Detection:** Automatically detects if a visited site has a `<link rel="aura">` tag and reports the status in the popup UI.
- **AI Core Communication:** Connects to the AI Core's WebSocket server (`ws://localhost:8080`) to listen for commands.
- **Command Execution:** Receives BEP (Basic Execution Protocol) commands and executes them on the current page by manipulating the DOM.

## Scripts

### `pnpm dev`

Starts the development server. This will watch for file changes and automatically reload the extension. To use this, load the extension from the `build/chrome-mv3-dev` directory.

### `pnpm build`

Creates a production-ready build of the extension in the `build/chrome-mv3-prod` directory.

### `pnpm package`

Packages the production build into a `.zip` file, ready for distribution or uploading to a web store.

## How to Load the Extension

1.  Run `pnpm dev` or `pnpm build`.
2.  Open Google Chrome and navigate to `chrome://extensions`.
3.  Enable **Developer mode** using the toggle in the top-right corner.
4.  Click the **Load unpacked** button.
5.  Select the appropriate build directory:
    -   For development: `packages/aura-adapter/build/chrome-mv3-dev`
    -   For production: `packages/aura-adapter/build/chrome-mv3-prod`
6.  The "Aura Adapter" extension will appear in your extensions list and be ready to use.

## Making production build

Run the following:

```bash
pnpm build
# or
npm run build
```