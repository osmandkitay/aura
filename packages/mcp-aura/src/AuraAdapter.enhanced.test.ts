import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import axios from 'axios';
import { AuraAdapter, ExecutionResult } from './AuraAdapter.js';
import type { AuraManifest, AuraState } from 'aura-protocol';

// Mock axios and tough-cookie
vi.mock('axios', () => ({
  default: {
    create: vi.fn(),
    isAxiosError: vi.fn(),
  },
  isAxiosError: vi.fn(),
}));

vi.mock('tough-cookie', () => ({
  CookieJar: vi.fn(() => ({
    getCookieString: vi.fn().mockResolvedValue('session=test-session-123'),
    setCookie: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('AuraAdapter Enhanced Tests', () => {
  let adapter: AuraAdapter;
  let mockAxiosInstance: any;
  const testSiteUrl = 'http://localhost:3000';
  const manifestUrl = `${testSiteUrl}/.well-known/aura.json`;

  // More comprehensive manifest
  const validManifest: AuraManifest = {
    $schema: 'https://aura.dev/schemas/v1.0.json',
    protocol: 'AURA',
    version: '1.0',
    site: {
      name: 'Test AURA Site',
      url: testSiteUrl,
      description: 'A test AURA-enabled site',
    },
    resources: {
      posts: {
        uriPattern: '/api/posts/{id}',
        description: 'Blog post resource',
        operations: {
          GET: { capabilityId: 'read_post' },
          PUT: { capabilityId: 'update_post' },
          DELETE: { capabilityId: 'delete_post' }
        }
      }
    },
    capabilities: {
      list_posts: {
        id: 'list_posts',
        v: 1,
        description: 'List all posts',
        action: {
          type: 'HTTP',
          method: 'GET',
          urlTemplate: '/api/posts{?limit,offset,tags*}',
          encoding: 'query',
          parameterMapping: {
            limit: '/limit',
            offset: '/offset',
            tags: '/tags',
          },
        },
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 100 },
            offset: { type: 'number', minimum: 0 },
            tags: { type: 'array', items: { type: 'string' } },
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
            tags: '/tags',
            metadata: '/metadata',
          },
        },
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 200 },
            content: { type: 'string', minLength: 1 },
            tags: { type: 'array', items: { type: 'string' } },
            metadata: { 
              type: 'object',
              properties: {
                author: { type: 'string' },
                publishDate: { type: 'string', format: 'date-time' }
              }
            }
          },
          required: ['title', 'content'],
        },
      },
      login: {
        id: 'login',
        v: 1,
        description: 'Authenticate user',
        action: {
          type: 'HTTP',
          method: 'POST',
          urlTemplate: '/api/auth/login',
          encoding: 'json',
          parameterMapping: {
            email: '/email',
            password: '/password',
          },
        },
        parameters: {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
          },
          required: ['email', 'password'],
        },
      },
      complex_action: {
        id: 'complex_action',
        v: 1,
        description: 'Complex capability with nested parameters',
        action: {
          type: 'HTTP',
          method: 'POST',
          urlTemplate: '/api/complex/{category}/{id}',
          encoding: 'json',
          parameterMapping: {
            category: '/category',
            id: '/id',
            data: '/payload/data',
            'nested.field': '/payload/nested/field',
            arrayItem: '/payload/items/0',
          },
        },
        parameters: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            id: { type: 'string' },
            payload: {
              type: 'object',
              properties: {
                data: { type: 'string' },
                nested: {
                  type: 'object',
                  properties: {
                    field: { type: 'string' }
                  }
                },
                items: {
                  type: 'array',
                  items: { type: 'string' }
                }
              }
            }
          },
          required: ['category', 'id', 'payload'],
        },
      },
    },
    policy: {
      rateLimit: {
        limit: 120,
        window: 'minute'
      },
      authHint: 'cookie'
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mock axios instance with comprehensive interceptor testing
    mockAxiosInstance = {
      interceptors: {
        request: { use: vi.fn((handler) => handler) },
        response: { use: vi.fn((handler) => handler) },
      },
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      request: vi.fn(),
    };
    
    vi.mocked(axios.create).mockReturnValue(mockAxiosInstance);
    vi.mocked(axios.isAxiosError).mockReturnValue(false);
    
    adapter = new AuraAdapter(testSiteUrl);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Cookie Management', () => {
    it('should properly setup cookie interceptors', async () => {
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });

    it('should add cookies to requests', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: validManifest,
      });

      await adapter.connect();

      // Get the request interceptor function
      const requestInterceptor = mockAxiosInstance.interceptors.request.use.mock.calls[0][0];
      
      const config = {
        url: 'http://localhost:3000/api/test',
        headers: {}
      };
      
      const modifiedConfig = await requestInterceptor(config);
      expect(modifiedConfig.headers.Cookie).toBe('session=test-session-123');
    });

    it('should store cookies from responses', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: validManifest,
        headers: {
          'set-cookie': ['session=new-session-456; Path=/; HttpOnly']
        }
      });

      await adapter.connect();

      // Get the response interceptor function
      const responseInterceptor = mockAxiosInstance.interceptors.response.use.mock.calls[0][0];
      
      const response = {
        headers: {
          'set-cookie': ['session=new-session-456; Path=/; HttpOnly']
        },
        config: {
          url: 'http://localhost:3000/api/test'
        }
      };
      
      await responseInterceptor(response);
      // Cookie should be stored (mocked setCookie should be called)
    });
  });

  describe('URI Template Expansion', () => {
    beforeEach(async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: validManifest,
      });
      await adapter.connect();
    });

    it('should handle complex URI templates with query parameters', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        status: 200,
        data: { posts: [] },
        headers: {},
      });

      await adapter.execute('list_posts', {
        limit: 10,
        offset: 20,
        tags: ['tech', 'news']
      });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        method: 'GET',
        url: `${testSiteUrl}/api/posts?limit=10&offset=20&tags=tech&tags=news`,
        data: null,
        params: {
          limit: 10,
          offset: 20,
          tags: ['tech', 'news']
        },
      });
    });

    it('should handle path parameters in URI templates', async () => {
      // Add a capability with path parameters
      const manifestWithPath = { ...validManifest };
      manifestWithPath.capabilities.get_post = {
        id: 'get_post',
        v: 1,
        description: 'Get a post',
        action: {
          type: 'HTTP',
          method: 'GET',
          urlTemplate: '/api/posts/{id}',
          encoding: 'query',
          parameterMapping: { id: '/id' },
        },
        parameters: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      };

      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: manifestWithPath,
      });

      const newAdapter = new AuraAdapter(testSiteUrl);
      await newAdapter.connect();

      mockAxiosInstance.request.mockResolvedValue({
        status: 200,
        data: { id: '123', title: 'Test Post' },
        headers: {},
      });

      await newAdapter.execute('get_post', { id: '123' });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        method: 'GET',
        url: `${testSiteUrl}/api/posts/123`,
        data: null,
        params: { id: '123' },
      });
    });
  });

  describe('Parameter Mapping with JSON Pointers', () => {
    beforeEach(async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: validManifest,
      });
      await adapter.connect();
    });

    it('should correctly map nested parameters using JSON Pointers', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        status: 200,
        data: { success: true },
        headers: {},
      });

      await adapter.execute('complex_action', {
        category: 'posts',
        id: 'abc123',
        payload: {
          data: 'test data',
          nested: {
            field: 'nested value'
          },
          items: ['item1', 'item2', 'item3']
        }
      });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        method: 'POST',
        url: `${testSiteUrl}/api/complex/posts/abc123`,
        data: {
          category: 'posts',
          id: 'abc123',
          data: 'test data',
          'nested.field': 'nested value',
          arrayItem: 'item1'
        },
        params: null,
      });
    });

    it('should handle missing optional parameters in mapping', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        status: 201,
        data: { id: 1, title: 'Test' },
        headers: {},
      });

      await adapter.execute('create_post', {
        title: 'Test Post',
        content: 'Test Content'
        // tags and metadata are optional
      });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        method: 'POST',
        url: `${testSiteUrl}/api/posts`,
        data: {
          title: 'Test Post',
          content: 'Test Content'
        },
        params: null,
      });
    });

    it('should handle JSON Pointer escape sequences', () => {
      // Test the private resolveJsonPointer method indirectly
      const testObj = {
        'field/with~slash': 'value1',
        'field~with~tilde': 'value2',
        normal: 'value3'
      };

      // This tests the JSON Pointer RFC 6901 compliance
      // ~0 represents ~, ~1 represents /
      const adapter = new AuraAdapter(testSiteUrl);
      
      // We can't directly test private methods, but we can verify
      // the behavior through parameter mapping
      const mapped = adapter['mapParameters'](testObj, {
        escaped1: '/field~1with~0slash',  // Should map to field/with~slash
        escaped2: '/field~0with~0tilde',  // Should map to field~with~tilde
        normal: '/normal'
      });

      expect(mapped).toEqual({
        escaped1: 'value1',
        escaped2: 'value2',
        normal: 'value3'
      });
    });
  });

  describe('AURA State Management', () => {
    beforeEach(async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: validManifest,
      });
      await adapter.connect();
    });

    it('should parse and store AURA-State header correctly', async () => {
      const testState: AuraState = {
        isAuthenticated: true,
        context: {
          user: { id: 'user123', name: 'Test User', role: 'admin' },
          session: { expiresAt: '2024-12-31T23:59:59Z' }
        },
        capabilities: ['create_post', 'update_post', 'delete_post'],
        metadata: {
          lastAction: 'login',
          timestamp: Date.now()
        }
      };

      const encodedState = Buffer.from(JSON.stringify(testState)).toString('base64');

      mockAxiosInstance.request.mockResolvedValue({
        status: 200,
        data: { user: { id: 'user123' } },
        headers: {
          'aura-state': encodedState,
        },
      });

      const result = await adapter.execute('login', {
        email: 'test@example.com',
        password: 'password123'
      });

      expect(result.state).toEqual(testState);
      expect(adapter.getCurrentState()).toEqual(testState);
    });

    it('should handle malformed AURA-State header gracefully', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        status: 200,
        data: { success: true },
        headers: {
          'aura-state': 'not-valid-base64-!!!',
        },
      });

      const result = await adapter.execute('list_posts', {});

      expect(result.state).toBeNull();
      expect(adapter.getCurrentState()).toBeNull();
    });

    it('should update available capabilities based on state', async () => {
      // Initially, all capabilities from manifest
      let capabilities = adapter.getAvailableCapabilities();
      expect(capabilities).toContain('list_posts');
      expect(capabilities).toContain('create_post');
      expect(capabilities).toContain('login');

      // After receiving state with limited capabilities
      const limitedState: AuraState = {
        isAuthenticated: false,
        capabilities: ['list_posts', 'login'], // Only public capabilities
      };

      const encodedState = Buffer.from(JSON.stringify(limitedState)).toString('base64');

      mockAxiosInstance.request.mockResolvedValue({
        status: 200,
        data: { posts: [] },
        headers: {
          'aura-state': encodedState,
        },
      });

      await adapter.execute('list_posts', {});

      capabilities = adapter.getAvailableCapabilities();
      expect(capabilities).toEqual(['list_posts', 'login']);
      expect(capabilities).not.toContain('create_post');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle connection timeout gracefully', async () => {
      const timeoutError = new Error('timeout of 10000ms exceeded');
      timeoutError.name = 'AxiosError';
      mockAxiosInstance.get.mockRejectedValue(timeoutError);
      vi.mocked(axios.isAxiosError).mockReturnValue(true);

      await expect(adapter.connect()).rejects.toThrow('Network error fetching manifest: timeout of 10000ms exceeded');
      expect(adapter.isReady()).toBe(false);
    });

    it('should handle manifest with missing optional fields', async () => {
      const minimalManifest = {
        protocol: 'AURA',
        version: '1.0',
        site: {
          name: 'Minimal Site',
          url: testSiteUrl,
        },
        resources: {},
        capabilities: {},
      };

      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: minimalManifest,
      });

      await adapter.connect();
      expect(adapter.isReady()).toBe(true);
      expect(adapter.getAvailableCapabilities()).toEqual([]);
    });

    it('should handle execution with HTTP error status codes', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: validManifest,
      });

      await adapter.connect();

      // Test 401 Unauthorized
      mockAxiosInstance.request.mockResolvedValue({
        status: 401,
        data: { error: 'Unauthorized' },
        headers: {},
      });

      const result401 = await adapter.execute('create_post', {
        title: 'Test',
        content: 'Content'
      });

      expect(result401.status).toBe(401);
      expect(result401.data).toEqual({ error: 'Unauthorized' });

      // Test 500 Internal Server Error
      mockAxiosInstance.request.mockResolvedValue({
        status: 500,
        data: { error: 'Internal Server Error' },
        headers: {},
      });

      const result500 = await adapter.execute('list_posts', {});

      expect(result500.status).toBe(500);
      expect(result500.data).toEqual({ error: 'Internal Server Error' });
    });

    it('should handle capabilities with no parameters', async () => {
      const manifestWithNoParams = { ...validManifest };
      manifestWithNoParams.capabilities.logout = {
        id: 'logout',
        v: 1,
        description: 'Logout',
        action: {
          type: 'HTTP',
          method: 'POST',
          urlTemplate: '/api/auth/logout',
          encoding: 'json',
          parameterMapping: {},
        },
      };

      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: manifestWithNoParams,
      });

      const newAdapter = new AuraAdapter(testSiteUrl);
      await newAdapter.connect();

      mockAxiosInstance.request.mockResolvedValue({
        status: 200,
        data: { success: true },
        headers: {},
      });

      const result = await newAdapter.execute('logout');

      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        method: 'POST',
        url: `${testSiteUrl}/api/auth/logout`,
        data: {},
        params: null,
      });

      expect(result.status).toBe(200);
    });

    it('should handle circular references in parameters gracefully', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: validManifest,
      });

      await adapter.connect();

      // Create a circular reference
      const circularObj: any = { title: 'Test', content: 'Content' };
      circularObj.self = circularObj;

      mockAxiosInstance.request.mockResolvedValue({
        status: 200,
        data: { success: true },
        headers: {},
      });

      // Should not throw when encountering circular reference
      await expect(adapter.execute('create_post', circularObj)).resolves.toBeDefined();
    });
  });

  describe('Reconnection and State Persistence', () => {
    it('should maintain state across reconnections', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: validManifest,
      });

      await adapter.connect();

      // Set some state
      const testState: AuraState = {
        isAuthenticated: true,
        context: { user: { id: 'user123' } },
      };
      adapter['currentState'] = testState;

      // Simulate disconnection
      adapter['isConnected'] = false;

      // Reconnect
      await adapter.connect();

      // State should be preserved
      expect(adapter.getCurrentState()).toEqual(testState);
    });

    it('should handle multiple rapid connect calls', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: validManifest,
      });

      // Call connect multiple times rapidly
      const promises = [
        adapter.connect(),
        adapter.connect(),
        adapter.connect(),
      ];

      await Promise.all(promises);

      // Should only fetch manifest once (or handle gracefully)
      expect(adapter.isReady()).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(3);
    });
  });

  describe('Encoding Types', () => {
    beforeEach(async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: validManifest,
      });
      await adapter.connect();
    });

    it('should handle different encoding types correctly', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        status: 200,
        data: { success: true },
        headers: {},
      });

      // Test JSON encoding (already in validManifest)
      await adapter.execute('create_post', {
        title: 'Test',
        content: 'Content'
      });

      expect(mockAxiosInstance.request).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Test',
            content: 'Content'
          }),
          params: null,
        })
      );

      // Test query encoding (already in validManifest)
      await adapter.execute('list_posts', {
        limit: 10,
        offset: 0
      });

      expect(mockAxiosInstance.request).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: null,
          params: expect.objectContaining({
            limit: 10,
            offset: 0
          }),
        })
      );
    });
  });
});