import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createServer } from './mcp-server.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { handleMCPRequest, getSiteInfo, clearAdapterCache } from './mcp-handler.js';

// Mock the MCP handler functions
vi.mock('./mcp-handler.js', () => ({
  handleMCPRequest: vi.fn(),
  getSiteInfo: vi.fn(),
  clearAdapterCache: vi.fn(),
  getCacheStatus: vi.fn(() => ({ size: 2, sites: ['http://site1.com', 'http://site2.com'] })),
}));

// Mock the MCP SDK
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => {
  const mockServer = {
    setRequestHandler: vi.fn(),
    connect: vi.fn(),
  };
  
  return {
    Server: vi.fn(() => mockServer),
  };
});

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(),
}));

describe('MCP Server Tests', () => {
  let mockServer: any;
  let listToolsHandler: any;
  let callToolHandler: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Create the server
    mockServer = await createServer();
    
    // Extract the handlers that were registered
    const setRequestHandlerCalls = mockServer.setRequestHandler.mock.calls;
    
    // Find the handlers by their schema type
    for (const call of setRequestHandlerCalls) {
      const [schema, handler] = call;
      if (schema.parse && schema.parse({ method: 'tools/list' })) {
        listToolsHandler = handler;
      } else if (schema.parse && schema.parse({ method: 'tools/call', params: {} })) {
        callToolHandler = handler;
      }
    }
  });

  describe('Server Creation', () => {
    it('should create server with correct configuration', () => {
      expect(Server).toHaveBeenCalledWith(
        {
          name: 'aura-mcp-server',
          version: '1.0.0',
        },
        {
          capabilities: {
            tools: {},
          },
        }
      );
    });

    it('should register request handlers', () => {
      expect(mockServer.setRequestHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('Tool Listing', () => {
    it('should list all available AURA tools', async () => {
      const result = await listToolsHandler({});
      
      expect(result.tools).toHaveLength(3);
      
      const toolNames = result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('aura_execute_capability');
      expect(toolNames).toContain('aura_get_site_info');
      expect(toolNames).toContain('aura_clear_cache');
    });

    it('should provide correct tool schemas', async () => {
      const result = await listToolsHandler({});
      
      const executeCapabilityTool = result.tools.find(
        (t: any) => t.name === 'aura_execute_capability'
      );
      
      expect(executeCapabilityTool).toBeDefined();
      expect(executeCapabilityTool.description).toContain('Execute a capability');
      expect(executeCapabilityTool.inputSchema.properties).toHaveProperty('siteUrl');
      expect(executeCapabilityTool.inputSchema.properties).toHaveProperty('capabilityId');
      expect(executeCapabilityTool.inputSchema.properties).toHaveProperty('args');
      expect(executeCapabilityTool.inputSchema.required).toEqual(['siteUrl', 'capabilityId']);
    });
  });

  describe('Tool Execution - aura_execute_capability', () => {
    it('should execute capability successfully', async () => {
      vi.mocked(handleMCPRequest).mockResolvedValue({
        success: true,
        status: 200,
        data: { result: 'test' },
        state: { isAuthenticated: true },
        availableCapabilities: ['cap1', 'cap2'],
      });

      const request = {
        params: {
          name: 'aura_execute_capability',
          arguments: {
            siteUrl: 'http://example.com',
            capabilityId: 'test_cap',
            args: { param1: 'value1' },
          },
        },
      };

      const result = await callToolHandler(request);
      
      expect(handleMCPRequest).toHaveBeenCalledWith({
        siteUrl: 'http://example.com',
        capabilityId: 'test_cap',
        args: { param1: 'value1' },
        requestId: expect.stringMatching(/^mcp-\d+$/),
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(true);
      expect(responseData.status).toBe(200);
      expect(responseData.data).toEqual({ result: 'test' });
    });

    it('should handle missing required parameters', async () => {
      const request = {
        params: {
          name: 'aura_execute_capability',
          arguments: {
            siteUrl: 'http://example.com',
            // Missing capabilityId
          },
        },
      };

      const result = await callToolHandler(request);
      
      expect(result.content[0].type).toBe('text');
      expect(result.isError).toBe(true);
      
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(false);
      expect(responseData.error).toContain('capabilityId');
    });

    it('should handle invalid arguments', async () => {
      const request = {
        params: {
          name: 'aura_execute_capability',
          arguments: null,
        },
      };

      const result = await callToolHandler(request);
      
      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');
      
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(false);
      expect(responseData.error).toContain('Invalid arguments');
    });

    it('should handle execution errors', async () => {
      vi.mocked(handleMCPRequest).mockRejectedValue(new Error('Network error'));

      const request = {
        params: {
          name: 'aura_execute_capability',
          arguments: {
            siteUrl: 'http://example.com',
            capabilityId: 'test_cap',
          },
        },
      };

      const result = await callToolHandler(request);
      
      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');
      
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(false);
      expect(responseData.error).toBe('Network error');
    });
  });

  describe('Tool Execution - aura_get_site_info', () => {
    it('should get site info successfully', async () => {
      vi.mocked(getSiteInfo).mockResolvedValue({
        success: true,
        availableCapabilities: ['cap1', 'cap2', 'cap3'],
        manifest: {
          siteName: 'Test Site',
          siteUrl: 'http://example.com',
          capabilities: ['cap1', 'cap2', 'cap3'],
        },
      });

      const request = {
        params: {
          name: 'aura_get_site_info',
          arguments: {
            siteUrl: 'http://example.com',
          },
        },
      };

      const result = await callToolHandler(request);
      
      expect(getSiteInfo).toHaveBeenCalledWith('http://example.com');
      expect(result.content[0].type).toBe('text');
      
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(true);
      expect(responseData.availableCapabilities).toEqual(['cap1', 'cap2', 'cap3']);
      expect(responseData.manifest.siteName).toBe('Test Site');
    });

    it('should handle missing siteUrl', async () => {
      const request = {
        params: {
          name: 'aura_get_site_info',
          arguments: {},
        },
      };

      const result = await callToolHandler(request);
      
      expect(result.isError).toBe(true);
      
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(false);
      expect(responseData.error).toContain('siteUrl is required');
    });

    it('should handle getSiteInfo errors', async () => {
      vi.mocked(getSiteInfo).mockResolvedValue({
        success: false,
        error: 'Failed to connect to site',
      });

      const request = {
        params: {
          name: 'aura_get_site_info',
          arguments: {
            siteUrl: 'http://invalid-site.com',
          },
        },
      };

      const result = await callToolHandler(request);
      
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(false);
      expect(responseData.error).toBe('Failed to connect to site');
    });
  });

  describe('Tool Execution - aura_clear_cache', () => {
    it('should clear cache successfully', async () => {
      const request = {
        params: {
          name: 'aura_clear_cache',
          arguments: {},
        },
      };

      const result = await callToolHandler(request);
      
      expect(clearAdapterCache).toHaveBeenCalled();
      expect(result.content[0].type).toBe('text');
      
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(true);
      expect(responseData.message).toBe('Cache cleared successfully');
    });

    it('should handle cache clearing errors', async () => {
      vi.mocked(clearAdapterCache).mockImplementation(() => {
        throw new Error('Cache error');
      });

      const request = {
        params: {
          name: 'aura_clear_cache',
          arguments: {},
        },
      };

      const result = await callToolHandler(request);
      
      expect(result.isError).toBe(true);
      
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(false);
      expect(responseData.error).toBe('Cache error');
    });
  });

  describe('Unknown Tool Handling', () => {
    it('should handle unknown tool names', async () => {
      const request = {
        params: {
          name: 'unknown_tool',
          arguments: {},
        },
      };

      const result = await callToolHandler(request);
      
      expect(result.isError).toBe(true);
      
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(false);
      expect(responseData.error).toBe('Unknown tool: unknown_tool');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large response data', async () => {
      const largeData = {
        items: Array(1000).fill(null).map((_, i) => ({
          id: i,
          data: 'x'.repeat(100),
        })),
      };

      vi.mocked(handleMCPRequest).mockResolvedValue({
        success: true,
        status: 200,
        data: largeData,
        state: null,
        availableCapabilities: [],
      });

      const request = {
        params: {
          name: 'aura_execute_capability',
          arguments: {
            siteUrl: 'http://example.com',
            capabilityId: 'test',
          },
        },
      };

      const result = await callToolHandler(request);
      
      expect(result.content[0].type).toBe('text');
      
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(true);
      expect(responseData.data.items).toHaveLength(1000);
    });

    it('should handle special characters in responses', async () => {
      vi.mocked(handleMCPRequest).mockResolvedValue({
        success: true,
        status: 200,
        data: {
          text: 'Special chars: "quotes" \'single\' \n newline \t tab \\ backslash',
          unicode: '😀 🎉 你好',
        },
        state: null,
        availableCapabilities: [],
      });

      const request = {
        params: {
          name: 'aura_execute_capability',
          arguments: {
            siteUrl: 'http://example.com',
            capabilityId: 'test',
          },
        },
      };

      const result = await callToolHandler(request);
      
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(true);
      expect(responseData.data.text).toContain('Special chars');
      expect(responseData.data.unicode).toContain('😀');
    });

    it('should handle circular references in error objects', async () => {
      const circularError: any = new Error('Circular error');
      circularError.self = circularError;
      
      vi.mocked(handleMCPRequest).mockRejectedValue(circularError);

      const request = {
        params: {
          name: 'aura_execute_capability',
          arguments: {
            siteUrl: 'http://example.com',
            capabilityId: 'test',
          },
        },
      };

      const result = await callToolHandler(request);
      
      expect(result.isError).toBe(true);
      
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(false);
      expect(responseData.error).toBe('Circular error');
    });

    it('should handle null and undefined in tool arguments gracefully', async () => {
      vi.mocked(handleMCPRequest).mockResolvedValue({
        success: true,
        status: 200,
        data: { ok: true },
        state: null,
        availableCapabilities: [],
      });

      const request = {
        params: {
          name: 'aura_execute_capability',
          arguments: {
            siteUrl: 'http://example.com',
            capabilityId: 'test',
            args: {
              nullValue: null,
              undefinedValue: undefined,
              normalValue: 'test',
            },
          },
        },
      };

      const result = await callToolHandler(request);
      
      expect(handleMCPRequest).toHaveBeenCalledWith({
        siteUrl: 'http://example.com',
        capabilityId: 'test',
        args: {
          nullValue: null,
          undefinedValue: undefined,
          normalValue: 'test',
        },
        requestId: expect.any(String),
      });
      
      expect(result.content[0].type).toBe('text');
      
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(true);
    });
  });

  describe('Request ID Generation', () => {
    it('should generate unique request IDs', async () => {
      vi.mocked(handleMCPRequest).mockResolvedValue({
        success: true,
        status: 200,
        data: {},
        state: null,
        availableCapabilities: [],
      });

      const request = {
        params: {
          name: 'aura_execute_capability',
          arguments: {
            siteUrl: 'http://example.com',
            capabilityId: 'test',
          },
        },
      };

      // Execute multiple times
      await callToolHandler(request);
      await callToolHandler(request);
      await callToolHandler(request);

      const calls = vi.mocked(handleMCPRequest).mock.calls;
      const requestIds = calls.map(call => call[0].requestId);
      
      // All request IDs should be unique
      expect(new Set(requestIds).size).toBe(requestIds.length);
      
      // All should match the pattern mcp-{timestamp}
      requestIds.forEach(id => {
        expect(id).toMatch(/^mcp-\d+$/);
      });
    });
  });
});