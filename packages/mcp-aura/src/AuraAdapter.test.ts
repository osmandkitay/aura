import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import axios from 'axios';
import { AuraAdapter, ExecutionResult } from './AuraAdapter.js';
import type { AuraManifest, AuraState } from 'aura-protocol';

// Mock axios completely
vi.mock('axios', () => ({
  default: {
    create: vi.fn(),
    isAxiosError: vi.fn(),
  },
  isAxiosError: vi.fn(),
}));

// Mock tough-cookie
vi.mock('tough-cookie', () => ({
  CookieJar: vi.fn(() => ({
    getCookieString: vi.fn().mockResolvedValue(''),
    setCookie: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('AuraAdapter', () => {
  let adapter: AuraAdapter;
  let mockAxiosInstance: any;
  const testSiteUrl = 'http://localhost:3000';
  const manifestUrl = `${testSiteUrl}/.well-known/aura.json`;

  // Mock manifest data
  const validManifest: AuraManifest = {
    $schema: 'https://aura.dev/schemas/v1.0.json',
    protocol: 'AURA',
    version: '1.0',
    site: {
      name: 'Test AURA Site',
      url: testSiteUrl,
    },
    resources: {},
    capabilities: {
      list_posts: {
        id: 'list_posts',
        v: 1,
        description: 'List all posts',
        action: {
          type: 'HTTP',
          method: 'GET',
          urlTemplate: '/api/posts',
          encoding: 'query',
          parameterMapping: {
            page: '/page',
            limit: '/limit',
          },
        },
        parameters: {
          type: 'object',
          properties: {
            page: { type: 'number' },
            limit: { type: 'number' },
          },
        },
      },
      create_post: {
        id: 'create_post',
        v: 1,
        description: 'Create a new post',
        action: {
          type: 'HTTP',
          method: 'POST',
          urlTemplate: '/api/posts',
          encoding: 'json',
          parameterMapping: {
            title: '/title',
            content: '/content',
          },
        },
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['title', 'content'],
        },
      },
      get_post: {
        id: 'get_post',
        v: 1,
        description: 'Get a specific post',
        action: {
          type: 'HTTP',
          method: 'GET',
          urlTemplate: '/api/posts/{id}',
          encoding: 'query',
          parameterMapping: { id: '/id' },
        },
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
      },
    },
  };

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Create mock axios instance
    mockAxiosInstance = {
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      request: vi.fn(),
    };
    
    // Setup axios.create mock
    vi.mocked(axios.create).mockReturnValue(mockAxiosInstance);
    vi.mocked(axios.isAxiosError).mockReturnValue(false);
    
    // Create adapter instance
    adapter = new AuraAdapter(testSiteUrl);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('connect() method', () => {
    it('should successfully fetch and validate manifest', async () => {
      // Mock successful manifest fetch
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: validManifest,
      });
      
      await adapter.connect();
      
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(manifestUrl);
      expect(adapter.isReady()).toBe(true);
      expect(adapter.getManifest()).toEqual(validManifest);
    });

    it('should throw error on 404 Not Found', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 404,
        data: null,
      });
      
      await expect(adapter.connect()).rejects.toThrow('Failed to fetch manifest: HTTP 404');
      expect(adapter.isReady()).toBe(false);
    });

    it('should throw error on network failure', async () => {
      const networkError = new Error('Network Error');
      mockAxiosInstance.get.mockRejectedValue(networkError);
      vi.mocked(axios.isAxiosError).mockReturnValue(true);
      
      await expect(adapter.connect()).rejects.toThrow('Network error fetching manifest: Network Error');
      expect(adapter.isReady()).toBe(false);
    });

    it('should throw error on invalid manifest - missing protocol', async () => {
      const invalidManifest = {
        version: '1.0',
        site: { name: 'Test', url: testSiteUrl },
        capabilities: {},
        resources: {},
      };
      
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: invalidManifest,
      });
      
      await expect(adapter.connect()).rejects.toThrow(/Schema validation failed.*protocol/);
    });

    it('should throw error on invalid manifest - wrong version', async () => {
      const invalidManifest = {
        protocol: 'AURA',
        version: '2.0',
        site: { name: 'Test', url: testSiteUrl },
        capabilities: {},
        resources: {},
      };
      
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: invalidManifest,
      });
      
      await expect(adapter.connect()).rejects.toThrow(/Schema validation failed.*version/);
    });

    it('should throw error on invalid manifest - missing site info', async () => {
      const invalidManifest = {
        protocol: 'AURA',
        version: '1.0',
        capabilities: {},
        resources: {},
      };
      
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: invalidManifest,
      });
      
      await expect(adapter.connect()).rejects.toThrow(/Schema validation failed.*site/);
    });

    it('should throw error on manifest failing JSON Schema validation but passing basic checks', async () => {
      // This manifest passes basic validation (has protocol, version, site, capabilities, resources)
      // but fails schema validation due to a capability missing required 'action' field
      // The adapter should reject this manifest and throw a schema validation error
      const schemaInvalidManifest = {
        $schema: 'https://aura.dev/schemas/v1.0.json',
        protocol: 'AURA',
        version: '1.0',
        site: {
          name: 'Test AURA Site',
          url: testSiteUrl,
        },
        resources: {},
        capabilities: {
          invalid_capability: {
            id: 'invalid_capability',
            v: 1,
            description: 'This capability is missing the required action field',
            // Missing required 'action' field - this should cause schema validation to fail
            parameters: {
              type: 'object',
              properties: {},
            },
          },
        },
      };

      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: schemaInvalidManifest,
      });

      // Should reject the manifest and throw a schema validation error
      await expect(adapter.connect()).rejects.toThrow(/Schema validation failed.*action/);
      expect(adapter.isReady()).toBe(false);
    });

    it('should successfully connect when schema loading fails but manifest passes basic validation', async () => {
      // This test covers the fallback behavior when JSON Schema cannot be loaded
      // but the manifest is valid according to basic validation
      
      // Mock require.resolve to fail (simulating missing schema file)
      const originalResolve = require.resolve;
      (require.resolve as any) = vi.fn().mockImplementation((moduleName: string) => {
        if (moduleName === 'aura-protocol/package.json') {
          throw new Error('Cannot find module aura-protocol/package.json');
        }
        return originalResolve(moduleName);
      });

      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: validManifest,
      });

      // Should successfully connect using basic validation fallback
      await adapter.connect();
      
      expect(adapter.isReady()).toBe(true);
      expect(adapter.getManifest()).toEqual(validManifest);

      // Restore original require.resolve
      require.resolve = originalResolve;
    });
  });

  describe('execute() method', () => {
    beforeEach(async () => {
      // Setup connected adapter for execute tests
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: validManifest,
      });
      
      await adapter.connect();
      vi.clearAllMocks(); // Clear connect() call
    });

    it('should execute GET capability with query parameters correctly', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        status: 200,
        data: [{ id: 1, title: 'Test Post' }],
        headers: {},
      });
      
      const args = { page: 1, limit: 10 };
      const result = await adapter.execute('list_posts', args);
      
      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        method: 'GET',
        url: `${testSiteUrl}/api/posts`,
        data: null,
        params: args,
      });
      
      expect(result.status).toBe(200);
      expect(result.data).toEqual([{ id: 1, title: 'Test Post' }]);
    });

    it('should execute POST capability with JSON body correctly', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        status: 201,
        data: { id: 1, title: 'New Post', content: 'Content' },
        headers: {},
      });
      
      const args = { title: 'New Post', content: 'Content' };
      const result = await adapter.execute('create_post', args);
      
      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        method: 'POST',
        url: `${testSiteUrl}/api/posts`,
        data: args,
        params: null,
      });
      
      expect(result.status).toBe(201);
      expect(result.data).toEqual({ id: 1, title: 'New Post', content: 'Content' });
    });

    it('should handle URL template expansion correctly', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        status: 200,
        data: { id: 123, title: 'Specific Post' },
        headers: {},
      });
      
      const args = { id: '123' };
      const result = await adapter.execute('get_post', args);
      
      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        method: 'GET',
        url: `${testSiteUrl}/api/posts/123`,
        data: null,
        params: { id: '123' },
      });
      
      expect(result.status).toBe(200);
      expect(result.data).toEqual({ id: 123, title: 'Specific Post' });
    });

    it('should handle AURA-State header correctly', async () => {
      const testState: AuraState = {
        isAuthenticated: true,
        context: { user: { id: 'user123', name: 'Test User' } },
        capabilities: ['list_posts', 'create_post'],
      };
      
      const encodedState = Buffer.from(JSON.stringify(testState)).toString('base64');
      
      mockAxiosInstance.request.mockResolvedValue({
        status: 200,
        data: { success: true },
        headers: {
          'aura-state': encodedState,
        },
      });
      
      const result = await adapter.execute('list_posts', {});
      
      expect(result.state).toEqual(testState);
      expect(adapter.getCurrentState()).toEqual(testState);
    });

    it('should throw error when not connected', async () => {
      const disconnectedAdapter = new AuraAdapter(testSiteUrl);
      
      await expect(disconnectedAdapter.execute('list_posts', {}))
        .rejects.toThrow('Not connected. Call connect() first.');
    });

    it('should throw error for non-existent capability', async () => {
      await expect(adapter.execute('non_existent_capability', {}))
        .rejects.toThrow('Capability "non_existent_capability" not found in manifest');
    });
  });

  describe('getAvailableCapabilities() method', () => {
    beforeEach(async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: validManifest,
      });
      
      await adapter.connect();
    });

    it('should return all capabilities from manifest when no state', () => {
      const capabilities = adapter.getAvailableCapabilities();
      
      expect(capabilities).toEqual(['list_posts', 'create_post', 'get_post']);
    });

    it('should return capabilities from current state when available', () => {
      // Set a current state with limited capabilities
      adapter['currentState'] = {
        isAuthenticated: true,
        context: { user: { id: 'user123' } },
        capabilities: ['list_posts'],
      };
      
      const capabilities = adapter.getAvailableCapabilities();
      
      expect(capabilities).toEqual(['list_posts']);
    });

    it('should throw error when not connected', () => {
      const disconnectedAdapter = new AuraAdapter(testSiteUrl);
      
      expect(() => disconnectedAdapter.getAvailableCapabilities())
        .toThrow('Not connected. Call connect() first.');
    });
  });

  describe('getCurrentState() method', () => {
    it('should return null initially', () => {
      expect(adapter.getCurrentState()).toBeNull();
    });

    it('should return current state after being set', () => {
      const testState: AuraState = {
        isAuthenticated: true,
        context: { user: { id: 'user123', name: 'Test User' } },
        capabilities: ['list_posts'],
      };
      
      adapter['currentState'] = testState;
      
      expect(adapter.getCurrentState()).toEqual(testState);
    });
  });

  describe('isReady() method', () => {
    it('should return false when not connected', () => {
      expect(adapter.isReady()).toBe(false);
    });

    it('should return true when connected', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: validManifest,
      });
      
      await adapter.connect();
      
      expect(adapter.isReady()).toBe(true);
    });
  });
});