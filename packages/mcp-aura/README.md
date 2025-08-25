# MCP-AURA Integration Package

This package provides integration between the Model Context Protocol (MCP) and AURA-enabled websites, allowing AI agents to interact with web services through the AURA protocol.

## Overview

The `mcp-aura` package contains the core `AuraAdapter` class that manages all communication with AURA-enabled sites. This adapter handles:

- Manifest fetching and validation from `/.well-known/aura.json`
- Session state management via HTTP cookies
- Capability execution with proper parameter mapping
- AURA-State header parsing and management

## Usage

### As an MCP Server (Recommended for AI Clients)

The `mcp-aura` package can be run as a standalone MCP server that integrates with MCP clients like Claude Desktop:

```bash
# Install the package globally or in your project
npm install mcp-aura

# Run the MCP server
npx aura-mcp-server

# Or from the source:
cd packages/mcp-aura
npm run server
```

#### Claude Desktop Integration

To use this with Claude Desktop, add the following to your Claude Desktop MCP configuration file:

```json
{
  "mcpServers": {
    "aura": {
      "command": "npx",
      "args": ["aura-mcp-server"],
      "description": "AURA Protocol MCP Server - enables interaction with AURA-enabled websites"
    }
  }
}
```

Once configured, Claude Desktop will have access to these tools:

- **`aura_execute_capability`**: Execute any capability on an AURA-enabled website
- **`aura_get_site_info`**: Get information about a site's available capabilities
- **`aura_clear_cache`**: Clear the adapter cache

Example Claude conversation:
```
You: "Please login to http://localhost:3000 with email demo@aura.dev and password password123"
Claude: "I'll help you login to that AURA-enabled site using the aura_execute_capability tool..."
```

### Direct AuraAdapter Usage

```typescript
import { AuraAdapter } from 'mcp-aura';

// Create an adapter for an AURA-enabled site
const adapter = new AuraAdapter('http://localhost:3000');

// Connect and fetch the manifest
await adapter.connect();

// Get available capabilities
const capabilities = adapter.getAvailableCapabilities();

// Execute a capability
const result = await adapter.execute('login', {
  email: 'user@example.com',
  password: 'password123'
});

console.log('Status:', result.status);
console.log('Data:', result.data);
console.log('New state:', result.state);
```

### MCP Handler Usage (Recommended)

The `handleMCPRequest` function provides a higher-level abstraction designed to integrate AURA into a larger agentic framework. "MCP" stands for **Model Context Protocol**, representing a generalized instruction format from an AI model (e.g., "log in to this site"). This handler translates that generic intent into a specific, stateful AURA capability execution. For most use cases, interacting directly with the AuraAdapter class is also a powerful and valid approach.

```typescript
import { handleMCPRequest, getSiteInfo } from 'mcp-aura';

// Get site information and available capabilities
const siteInfo = await getSiteInfo('http://localhost:3000');
console.log('Available capabilities:', siteInfo.availableCapabilities);

// Execute a capability through MCP
const response = await handleMCPRequest({
  siteUrl: 'http://localhost:3000',
  capabilityId: 'login',
  args: {
    email: 'user@example.com',
    password: 'password123'
  },
  requestId: 'req-001'
});

if (response.success) {
  console.log('Login successful:', response.data);
  console.log('New state:', response.state);
} else {
  console.error('Login failed:', response.error);
}

// Batch processing multiple requests
const batchResponse = await handleMCPRequestBatch([
  { siteUrl: 'http://localhost:3000', capabilityId: 'get_profile' },
  { siteUrl: 'http://localhost:3000', capabilityId: 'list_posts', args: { limit: 10 } }
]);
```

## API Reference

### MCP Handler Functions (Recommended)

The main functions for MCP integration with AURA-enabled sites.

#### Core Functions

- `handleMCPRequest(request: MCPRequest): Promise<MCPResponse>` - Processes a single MCP request
- `handleMCPRequestBatch(requests: MCPRequest[]): Promise<MCPResponse[]>` - Processes multiple requests concurrently
- `getSiteInfo(siteUrl: string): Promise<MCPResponse>` - Gets site information and capabilities without executing anything

#### Utility Functions

- `clearAdapterCache(): void` - Clears the internal adapter cache
- `getCacheStatus(): { size: number; sites: string[] }` - Gets current cache status

#### Types

- `MCPRequest` - Request structure for MCP
  - `siteUrl: string` - The target AURA site URL
  - `capabilityId: string` - The capability ID to execute
  - `args?: object` - Arguments for the capability
  - `requestId?: string` - Optional request ID for tracking

- `MCPResponse` - Response structure from MCP handler
  - `success: boolean` - Whether the request was successful
  - `status?: number` - HTTP status code from the AURA server
  - `data?: any` - Response data from capability execution
  - `state?: AuraState | null` - Updated AURA state after execution
  - `error?: string` - Error message if the request failed
  - `requestId?: string` - Request ID for tracking
  - `availableCapabilities?: string[]` - Available capabilities in current state
  - `manifest?: object` - Site manifest information

### AuraAdapter (Direct Usage)

The main class for direct interaction with AURA-enabled sites.

#### Constructor

- `new AuraAdapter(siteUrl: string)` - Creates a new adapter instance

#### Methods

- `connect(): Promise<void>` - Fetches and validates the aura.json manifest
- `getAvailableCapabilities(): string[]` - Returns available capability IDs
- `execute(capabilityId: string, args?: object): Promise<ExecutionResult>` - Executes a capability
- `getCurrentState(): AuraState | null` - Returns the current AURA state
- `isReady(): boolean` - Checks if the adapter is connected and ready
- `getManifest(): AuraManifest | null` - Gets the loaded manifest

#### Types

- `ExecutionResult` - Result structure returned by execute method
  - `status: number` - HTTP status code
  - `data: any` - Response data
  - `state: AuraState | null` - Updated AURA state

## Architecture

This package follows a clean architecture where:

1. **AuraAdapter** contains all complex logic for AURA protocol communication
2. **MCP Handler** provides thin translation between MCP and AuraAdapter with intelligent caching
3. Session state is automatically managed via HTTP cookies
4. URI templates and parameter mapping follow AURA protocol specifications

### Key Features

- **Connection Caching**: AuraAdapter instances are cached per site URL to maintain session state
- **Batch Processing**: Multiple MCP requests can be processed concurrently
- **Error Handling**: Comprehensive error handling with detailed error messages
- **State Management**: Automatic AURA-State header parsing and tracking
- **Manifest Validation**: JSON Schema validation of AURA manifests
- **RFC Compliance**: Full RFC 6570 URI template and RFC 6901 JSON Pointer support

## Dependencies

- `aura-protocol` - Core AURA protocol types and schemas
- `axios` - HTTP client with interceptor support
- `tough-cookie` - Cookie jar management
- `ajv` - JSON schema validation
- `url-template` - RFC 6570 URI template expansion
