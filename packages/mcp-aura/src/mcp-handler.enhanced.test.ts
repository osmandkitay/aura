import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  handleMCPRequest, 
  handleMCPRequestBatch, 
  getSiteInfo, 
  clearAdapterCache, 
  getCacheStatus 
} from './mcp-handler.js';
import type { MCPRequest, MCPResponse } from './mcp-handler.js';
import { AuraAdapter } from './AuraAdapter.js';

// Mock the AuraAdapter
vi.mock('./AuraAdapter.js', () => {
  const mockAdapter = {
    connect: vi.fn(),
    execute: vi.fn(),
    getAvailableCapabilities: vi.fn(),
    getCurrentState: vi.fn(),
    isReady: vi.fn(),
    getManifest: vi.fn(),
  };

  return {
    AuraAdapter: vi.fn(() => mockAdapter),
    ExecutionResult: {},
  };
});

describe('MCP Handler Enhanced Unit Tests', () => {
  let mockAdapter: any;
  const testSiteUrl = 'http://localhost:3000';

  const mockManifest = {
    site: {
      name: 'Test Site',
      url: testSiteUrl,
    },
    capabilities: {
      test_capability: {
        id: 'test_capability',
        description: 'Test capability',
      },
    },
  };

  const mockState = {
    isAuthenticated: true,
    context: { user: { id: 'user123' } },
    capabilities: ['test_capability'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearAdapterCache();
    
    // Get the mock adapter instance
    mockAdapter = new AuraAdapter(testSiteUrl);
    
    // Setup default mock behaviors
    mockAdapter.connect.mockResolvedValue(undefined);
    mockAdapter.isReady.mockReturnValue(true);
    mockAdapter.getManifest.mockReturnValue(mockManifest);
    mockAdapter.getAvailableCapabilities.mockReturnValue(['test_capability']);
    mockAdapter.getCurrentState.mockReturnValue(mockState);
    mockAdapter.execute.mockResolvedValue({
      status: 200,
      data: { success: true },
      state: mockState,
    });
  });

  describe('Request Validation', () => {
    it('should validate required siteUrl field', async () => {
      const request: MCPRequest = {
        siteUrl: '',
        capabilityId: 'test',
        args: {},
      };

      const response = await handleMCPRequest(request);

      expect(response.success).toBe(false);
      expect(response.status).toBe(400);
      expect(response.error).toBe('Missing required field: siteUrl');
    });

    it('should validate required capabilityId field', async () => {
      const request: MCPRequest = {
        siteUrl: testSiteUrl,
        capabilityId: '',
        args: {},
      };

      const response = await handleMCPRequest(request);

      expect(response.success).toBe(false);
      expect(response.status).toBe(400);
      expect(response.error).toBe('Missing required field: capabilityId');
    });

    it('should handle null and undefined in request gracefully', async () => {
      const request: any = {
        siteUrl: testSiteUrl,
        capabilityId: null,
        args: undefined,
      };

      const response = await handleMCPRequest(request);

      expect(response.success).toBe(false);
      expect(response.status).toBe(400);
      expect(response.error).toBe('Missing required field: capabilityId');
    });

    it('should preserve requestId throughout the flow', async () => {
      const request: MCPRequest = {
        siteUrl: testSiteUrl,
        capabilityId: 'test_capability',
        args: {},
        requestId: 'unique-request-123',
      };

      const response = await handleMCPRequest(request);

      expect(response.requestId).toBe('unique-request-123');
    });
  });

  describe('Adapter Caching', () => {
    it('should reuse adapter for same site URL', async () => {
      const request: MCPRequest = {
        siteUrl: testSiteUrl,
        capabilityId: 'test_capability',
        args: {},
      };

      // First request
      await handleMCPRequest(request);
      expect(AuraAdapter).toHaveBeenCalledTimes(1);
      expect(mockAdapter.connect).toHaveBeenCalledTimes(1);

      // Second request to same site
      await handleMCPRequest(request);
      expect(AuraAdapter).toHaveBeenCalledTimes(1); // Should not create new adapter
      expect(mockAdapter.connect).toHaveBeenCalledTimes(1); // Should not reconnect
    });

    it('should create different adapters for different sites', async () => {
      const request1: MCPRequest = {
        siteUrl: 'http://site1.com',
        capabilityId: 'test',
        args: {},
      };

      const request2: MCPRequest = {
        siteUrl: 'http://site2.com',
        capabilityId: 'test',
        args: {},
      };

      await handleMCPRequest(request1);
      await handleMCPRequest(request2);

      expect(AuraAdapter).toHaveBeenCalledTimes(2);
      expect(AuraAdapter).toHaveBeenCalledWith('http://site1.com');
      expect(AuraAdapter).toHaveBeenCalledWith('http://site2.com');
    });

    it('should normalize URLs for caching (remove trailing slash)', async () => {
      const request1: MCPRequest = {
        siteUrl: 'http://site.com/',
        capabilityId: 'test',
        args: {},
      };

      const request2: MCPRequest = {
        siteUrl: 'http://site.com',
        capabilityId: 'test',
        args: {},
      };

      await handleMCPRequest(request1);
      await handleMCPRequest(request2);

      // Should only create one adapter due to URL normalization
      expect(AuraAdapter).toHaveBeenCalledTimes(1);
      expect(AuraAdapter).toHaveBeenCalledWith('http://site.com');
    });

    it('should reconnect if adapter is not ready', async () => {
      mockAdapter.isReady.mockReturnValueOnce(false).mockReturnValue(true);

      const request: MCPRequest = {
        siteUrl: testSiteUrl,
        capabilityId: 'test_capability',
        args: {},
      };

      await handleMCPRequest(request);
      expect(mockAdapter.connect).toHaveBeenCalledTimes(1);

      await handleMCPRequest(request);
      expect(mockAdapter.connect).toHaveBeenCalledTimes(2); // Should reconnect
    });

    it('should clear cache properly', () => {
      const status1 = getCacheStatus();
      expect(status1.size).toBe(0);

      // Create some adapters (this won't actually cache in test, but tests the function)
      clearAdapterCache();

      const status2 = getCacheStatus();
      expect(status2.size).toBe(0);
      expect(status2.sites).toEqual([]);
    });
  });

  describe('Response Formatting', () => {
    it('should format successful response correctly', async () => {
      mockAdapter.execute.mockResolvedValue({
        status: 201,
        data: { id: 1, title: 'Created' },
        state: mockState,
      });

      const request: MCPRequest = {
        siteUrl: testSiteUrl,
        capabilityId: 'create_post',
        args: { title: 'Test' },
        requestId: 'req-123',
      };

      const response = await handleMCPRequest(request);

      expect(response).toEqual({
        success: true,
        status: 201,
        data: { id: 1, title: 'Created' },
        state: mockState,
        requestId: 'req-123',
        availableCapabilities: ['test_capability'],
        manifest: {
          siteName: 'Test Site',
          siteUrl: testSiteUrl,
          capabilities: ['test_capability'],
        },
      });
    });

    it('should handle error status codes correctly', async () => {
      mockAdapter.execute.mockResolvedValue({
        status: 404,
        data: { error: 'Not found' },
        state: null,
      });

      const request: MCPRequest = {
        siteUrl: testSiteUrl,
        capabilityId: 'test_capability',
        args: {},
      };

      const response = await handleMCPRequest(request);

      expect(response.success).toBe(false); // 404 is not success
      expect(response.status).toBe(404);
      expect(response.data).toEqual({ error: 'Not found' });
    });

    it('should handle adapter execution errors', async () => {
      mockAdapter.execute.mockRejectedValue(new Error('Network error'));

      const request: MCPRequest = {
        siteUrl: testSiteUrl,
        capabilityId: 'test_capability',
        args: {},
        requestId: 'error-test',
      };

      const response = await handleMCPRequest(request);

      expect(response.success).toBe(false);
      expect(response.status).toBe(400);
      expect(response.error).toBe('Network error');
      expect(response.requestId).toBe('error-test');
    });

    it('should include manifest info when available', async () => {
      const request: MCPRequest = {
        siteUrl: testSiteUrl,
        capabilityId: 'test_capability',
        args: {},
      };

      const response = await handleMCPRequest(request);

      expect(response.manifest).toBeDefined();
      expect(response.manifest?.siteName).toBe('Test Site');
      expect(response.manifest?.siteUrl).toBe(testSiteUrl);
      expect(response.manifest?.capabilities).toContain('test_capability');
    });

    it('should handle missing manifest gracefully', async () => {
      mockAdapter.getManifest.mockReturnValue(null);

      const request: MCPRequest = {
        siteUrl: testSiteUrl,
        capabilityId: 'test_capability',
        args: {},
      };

      const response = await handleMCPRequest(request);

      expect(response.manifest).toBeUndefined();
      expect(response.success).toBe(true); // Should still succeed
    });
  });

  describe('Batch Processing', () => {
    it('should process batch requests concurrently', async () => {
      const requests: MCPRequest[] = [
        { siteUrl: testSiteUrl, capabilityId: 'cap1', requestId: 'req1' },
        { siteUrl: testSiteUrl, capabilityId: 'cap2', requestId: 'req2' },
        { siteUrl: testSiteUrl, capabilityId: 'cap3', requestId: 'req3' },
      ];

      const responses = await handleMCPRequestBatch(requests);

      expect(responses).toHaveLength(3);
      expect(responses[0].requestId).toBe('req1');
      expect(responses[1].requestId).toBe('req2');
      expect(responses[2].requestId).toBe('req3');
      expect(responses.every(r => r.success)).toBe(true);
    });

    it('should handle mixed success/failure in batch', async () => {
      mockAdapter.execute
        .mockResolvedValueOnce({ status: 200, data: { success: true }, state: null })
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({ status: 201, data: { created: true }, state: null });

      const requests: MCPRequest[] = [
        { siteUrl: testSiteUrl, capabilityId: 'cap1', requestId: 'req1' },
        { siteUrl: testSiteUrl, capabilityId: 'cap2', requestId: 'req2' },
        { siteUrl: testSiteUrl, capabilityId: 'cap3', requestId: 'req3' },
      ];

      const responses = await handleMCPRequestBatch(requests);

      expect(responses).toHaveLength(3);
      expect(responses[0].success).toBe(true);
      expect(responses[1].success).toBe(false);
      expect(responses[1].error).toBe('Failed');
      expect(responses[2].success).toBe(true);
    });

    it('should handle empty batch', async () => {
      const responses = await handleMCPRequestBatch([]);
      expect(responses).toEqual([]);
    });

    it('should handle batch with validation errors', async () => {
      const requests: MCPRequest[] = [
        { siteUrl: '', capabilityId: 'cap1' }, // Invalid - missing siteUrl
        { siteUrl: testSiteUrl, capabilityId: '' }, // Invalid - missing capabilityId
        { siteUrl: testSiteUrl, capabilityId: 'valid' }, // Valid
      ];

      const responses = await handleMCPRequestBatch(requests);

      expect(responses).toHaveLength(3);
      expect(responses[0].success).toBe(false);
      expect(responses[0].error).toContain('Missing required field: siteUrl');
      expect(responses[1].success).toBe(false);
      expect(responses[1].error).toContain('Missing required field: capabilityId');
      expect(responses[2].success).toBe(true);
    });

    it('should handle catastrophic batch failure', async () => {
      // Mock Promise.all to throw
      const originalPromiseAll = Promise.all;
      Promise.all = vi.fn().mockRejectedValue(new Error('Catastrophic failure'));

      const requests: MCPRequest[] = [
        { siteUrl: testSiteUrl, capabilityId: 'cap1', requestId: 'req1' },
      ];

      const responses = await handleMCPRequestBatch(requests);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(false);
      expect(responses[0].error).toBe('Catastrophic failure');
      expect(responses[0].requestId).toBe('req1');

      // Restore Promise.all
      Promise.all = originalPromiseAll;
    });
  });

  describe('getSiteInfo', () => {
    it('should return site information without executing capabilities', async () => {
      const response = await getSiteInfo(testSiteUrl);

      expect(mockAdapter.connect).toHaveBeenCalled();
      expect(mockAdapter.execute).not.toHaveBeenCalled();
      expect(response).toEqual({
        success: true,
        state: mockState,
        availableCapabilities: ['test_capability'],
        manifest: {
          siteName: 'Test Site',
          siteUrl: testSiteUrl,
          capabilities: ['test_capability'],
        },
      });
    });

    it('should handle connection errors in getSiteInfo', async () => {
      mockAdapter.connect.mockRejectedValue(new Error('Connection failed'));

      const response = await getSiteInfo(testSiteUrl);

      expect(response.success).toBe(false);
      expect(response.status).toBe(400);
      expect(response.error).toBe('Connection failed');
    });

    it('should handle missing manifest in getSiteInfo', async () => {
      mockAdapter.getManifest.mockReturnValue(null);

      const response = await getSiteInfo(testSiteUrl);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Failed to load site manifest');
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle very large argument objects', async () => {
      const largeArgs = {
        data: Array(10000).fill('test').join(''),
        nested: {
          deep: {
            structure: {
              with: {
                many: {
                  levels: 'value'
                }
              }
            }
          }
        }
      };

      const request: MCPRequest = {
        siteUrl: testSiteUrl,
        capabilityId: 'test_capability',
        args: largeArgs,
      };

      const response = await handleMCPRequest(request);

      expect(mockAdapter.execute).toHaveBeenCalledWith('test_capability', largeArgs);
      expect(response.success).toBe(true);
    });

    it('should handle special characters in capability IDs', async () => {
      const request: MCPRequest = {
        siteUrl: testSiteUrl,
        capabilityId: 'test-capability_v2.0',
        args: {},
      };

      mockAdapter.execute.mockResolvedValue({
        status: 200,
        data: { success: true },
        state: null,
      });

      const response = await handleMCPRequest(request);

      expect(mockAdapter.execute).toHaveBeenCalledWith('test-capability_v2.0', {});
      expect(response.success).toBe(true);
    });

    it('should handle rapid concurrent requests to same capability', async () => {
      const request: MCPRequest = {
        siteUrl: testSiteUrl,
        capabilityId: 'test_capability',
        args: {},
      };

      // Fire 10 concurrent requests
      const promises = Array(10).fill(null).map(() => handleMCPRequest(request));
      const responses = await Promise.all(promises);

      expect(responses).toHaveLength(10);
      expect(responses.every(r => r.success)).toBe(true);
      // Should only create one adapter due to caching
      expect(AuraAdapter).toHaveBeenCalledTimes(1);
    });

    it('should handle undefined args as empty object', async () => {
      const request: MCPRequest = {
        siteUrl: testSiteUrl,
        capabilityId: 'test_capability',
        // args is optional and undefined
      };

      await handleMCPRequest(request);

      expect(mockAdapter.execute).toHaveBeenCalledWith('test_capability', {});
    });

    it('should handle null args as empty object', async () => {
      const request: MCPRequest = {
        siteUrl: testSiteUrl,
        capabilityId: 'test_capability',
        args: null as any,
      };

      await handleMCPRequest(request);

      expect(mockAdapter.execute).toHaveBeenCalledWith('test_capability', {});
    });
  });

  describe('Logging and Diagnostics', () => {
    it('should log appropriate messages during execution', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      const request: MCPRequest = {
        siteUrl: testSiteUrl,
        capabilityId: 'test_capability',
        args: {},
      };

      await handleMCPRequest(request);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MCP Handler] Processing request')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MCP Handler] Request completed')
      );

      consoleSpy.mockRestore();
    });

    it('should log errors appropriately', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error');
      mockAdapter.execute.mockRejectedValue(new Error('Test error'));

      const request: MCPRequest = {
        siteUrl: testSiteUrl,
        capabilityId: 'test_capability',
        args: {},
      };

      await handleMCPRequest(request);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MCP Handler] Request failed'),
        expect.stringContaining('Test error')
      );

      consoleErrorSpy.mockRestore();
    });
  });
});