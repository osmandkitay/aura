#!/usr/bin/env node

/**
 * MCP Server for AURA Protocol Integration
 * 
 * This is the main entry point for the MCP server that provides
 * AURA protocol integration to MCP clients like Claude Desktop.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';

import { handleMCPRequest, getSiteInfo, clearAdapterCache, type MCPRequest, type MCPResponse } from './mcp-handler.js';

/**
 * Define available tools for MCP clients
 */
const AURA_TOOLS: Tool[] = [
  {
    name: 'aura_execute_capability',
    description: 'Execute a capability on an AURA-enabled website',
    inputSchema: {
      type: 'object',
      properties: {
        siteUrl: {
          type: 'string',
          description: 'The URL of the AURA-enabled website'
        },
        capabilityId: {
          type: 'string',
          description: 'The ID of the capability to execute (e.g., "login", "list_posts", "create_post")'
        },
        args: {
          type: 'object',
          description: 'Arguments to pass to the capability',
          additionalProperties: true
        }
      },
      required: ['siteUrl', 'capabilityId'],
      additionalProperties: false
    }
  },
  {
    name: 'aura_get_site_info',
    description: 'Get information about an AURA-enabled website including available capabilities',
    inputSchema: {
      type: 'object',
      properties: {
        siteUrl: {
          type: 'string',
          description: 'The URL of the AURA-enabled website'
        }
      },
      required: ['siteUrl'],
      additionalProperties: false
    }
  },
  {
    name: 'aura_clear_cache',
    description: 'Clear the AURA adapter cache (useful for testing or when sites change)',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  }
];

/**
 * Create and configure the MCP server
 */
async function createServer(): Promise<Server> {
  const server = new Server({
    name: 'aura-mcp-server',
    version: '1.0.0'
  }, {
    capabilities: {
      tools: {}
    }
  });

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: AURA_TOOLS };
  });

  // Handle tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'aura_execute_capability': {
          if (!args || typeof args !== 'object') {
            throw new Error('Invalid arguments for aura_execute_capability');
          }

          const { siteUrl, capabilityId, args: capabilityArgs } = args as {
            siteUrl: string;
            capabilityId: string;
            args?: Record<string, any>;
          };

          if (!siteUrl || !capabilityId) {
            throw new Error('siteUrl and capabilityId are required');
          }

          const mcpRequest: MCPRequest = {
            siteUrl,
            capabilityId,
            args: capabilityArgs,
            requestId: `mcp-${Date.now()}`
          };

          const response = await handleMCPRequest(mcpRequest);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: response.success,
                  status: response.status,
                  data: response.data,
                  state: response.state,
                  error: response.error,
                  availableCapabilities: response.availableCapabilities
                }, null, 2)
              }
            ]
          } as CallToolResult;
        }

        case 'aura_get_site_info': {
          if (!args || typeof args !== 'object') {
            throw new Error('Invalid arguments for aura_get_site_info');
          }

          const { siteUrl } = args as { siteUrl: string };

          if (!siteUrl) {
            throw new Error('siteUrl is required');
          }

          const response = await getSiteInfo(siteUrl);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: response.success,
                  availableCapabilities: response.availableCapabilities,
                  manifest: response.manifest,
                  error: response.error
                }, null, 2)
              }
            ]
          } as CallToolResult;
        }

        case 'aura_clear_cache': {
          clearAdapterCache();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ success: true, message: 'Cache cleared successfully' }, null, 2)
              }
            ]
          } as CallToolResult;
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: errorMessage
            }, null, 2)
          }
        ],
        isError: true
      } as CallToolResult;
    }
  });

  return server;
}

/**
 * Main server startup
 */
async function main() {
  const server = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Keep the server running
  console.error('AURA MCP Server started and ready for connections');
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.error('Shutting down AURA MCP Server...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Shutting down AURA MCP Server...');
  process.exit(0);
});

// Start the server immediately (this is the main entry point)
main().catch((error) => {
  console.error('Failed to start AURA MCP Server:', error);
  process.exit(1);
});

export { createServer };
