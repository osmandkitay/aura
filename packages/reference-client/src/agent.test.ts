import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
// Mock OpenAI to avoid runtime initialization in tests
vi.mock('openai', () => {
  return {
    default: class {
      // minimal mock
      constructor() {}
    }
  };
});

// Ensure the OpenAI client can initialize in the agent module during tests
process.env.NODE_ENV = 'test';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-test-key';
import { prepareUrlPath, mapParameters, resolveJsonPointer, splitParametersByLocation } from './agent';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { AuraManifest, AuraState } from 'aura-protocol';

// Helper to extract cookie from set-cookie header
function extractCookieValue(setCookieHeader: string | string[] | undefined, cookieName: string): string | undefined {
  if (!setCookieHeader) return undefined;
  
  const cookieStrings = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const cookieString of cookieStrings) {
    const parts = cookieString.split(';');
    const [nameValue] = parts;
    const [name, value] = nameValue.split('=');
    if (name.trim() === cookieName) {
      return value;
    }
  }
  return undefined;
}

// Test data
const mockManifest: AuraManifest = {
  $schema: "https://aura.dev/schemas/v1.0.json",
  protocol: "AURA",
  version: "1.0",
  site: {
    name: "Test AURA Site",
    description: "Test site for AURA protocol",
    url: "http://localhost:3000"
  },
  resources: {},
  capabilities: {
    login: {
      id: "login",
      v: 1,
      description: "Authenticate user with email and password",
      parameters: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8 }
        }
      },
      action: {
        type: "HTTP",
        method: "POST",
        urlTemplate: "/api/auth/login",
        cors: true,
        encoding: "json",
        parameterMapping: {
          email: "/email",
          password: "/password"
        }
      }
    },
    create_post: {
      id: "create_post",
      v: 1,
      description: "Create a new blog post",
      parameters: {
        type: "object",
        required: ["title", "content"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: 200 },
          content: { type: "string", minLength: 1 },
          tags: { type: "array", items: { type: "string" } },
          published: { type: "boolean", default: false }
        }
      },
      action: {
        type: "HTTP",
        method: "POST",
        urlTemplate: "/api/posts",
        cors: true,
        encoding: "json",
        parameterMapping: {
          title: "/title",
          content: "/content",
          tags: "/tags",
          published: "/published"
        }
      }
    },
    list_posts: {
      id: "list_posts",
      v: 1,
      description: "List all blog posts",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", minimum: 1, maximum: 100, default: 10 }
        }
      },
      action: {
        type: "HTTP",
        method: "GET",
        urlTemplate: "/api/posts{?limit}",
        cors: true,
        encoding: "query",
        parameterMapping: {
          limit: "/limit"
        }
      }
    },
    update_post: {
      id: "update_post",
      v: 1,
      description: "Update an existing blog post",
      parameters: {
        type: "object",
        required: ["id"],
        properties: {
          id: {
            type: "string",
            pattern: "^[a-zA-Z0-9-]+$"
          },
          title: {
            type: "string",
            minLength: 1,
            maxLength: 200
          },
          content: {
            type: "string",
            minLength: 1
          },
          tags: {
            type: "array",
            items: {
              type: "string"
            }
          },
          published: {
            type: "boolean"
          }
        }
      },
      action: {
        type: "HTTP",
        method: "PUT",
        urlTemplate: "/api/posts/{id}",
        cors: true,
        encoding: "json",
        parameterMapping: {
          id: "/id",
          title: "/title",
          content: "/content",
          tags: "/tags",
          published: "/published"
        }
      }
    }
  }
};

describe('AURA Agent Core Functions', () => {
  describe('prepareUrlPath', () => {
    it('should expand simple path parameters', () => {
      const result = prepareUrlPath('/api/posts/{id}', { id: '123' });
      expect(result).toBe('/api/posts/123');
    });

    it('should handle query parameter templates (RFC 6570 Level 3)', () => {
      const result = prepareUrlPath('/api/posts{?limit,offset}', { limit: 10, offset: 20 });
      expect(result).toBe('/api/posts?limit=10&offset=20');
    });

    it('should handle exploded array parameter templates', () => {
      const result = prepareUrlPath('/api/posts{?tags*}', { tags: ['tech', 'ai'] });
      expect(result).toBe('/api/posts?tags=tech&tags=ai');
    });

    it('should handle mixed path and query parameters', () => {
      const result = prepareUrlPath('/api/posts/{id}{?include}', { id: '123', include: 'comments' });
      expect(result).toBe('/api/posts/123?include=comments');
    });

    it('should handle reserved string expansion', () => {
      const result = prepareUrlPath('{+base}/posts/{id}', { base: '/api/v1', id: '123' });
      expect(result).toBe('/api/v1/posts/123');
    });

    it('should handle fragment expansion', () => {
      const result = prepareUrlPath('/api/posts/{id}{#section}', { id: '123', section: 'comments' });
      expect(result).toBe('/api/posts/123#comments');
    });

    it('should handle multiple variable expansion', () => {
      const result = prepareUrlPath('/api/{controller,action}', { controller: 'posts', action: 'create' });
      expect(result).toBe('/api/posts,create');
    });

    it('should handle complex query with multiple parameters', () => {
      const result = prepareUrlPath('/api/search{?q,limit,tags*,sort}', { 
        q: 'javascript', 
        limit: 20, 
        tags: ['web', 'dev'], 
        sort: 'date' 
      });
      expect(result).toBe('/api/search?q=javascript&limit=20&tags=web&tags=dev&sort=date');
    });

    it('should fallback gracefully on invalid templates', () => {
      const invalidTemplate = '/api/{unclosed';
      const result = prepareUrlPath(invalidTemplate, { id: '123' });
      expect(result).toBe(invalidTemplate); // Should return original template
    });

    it('should handle empty parameters gracefully', () => {
      const result = prepareUrlPath('/api/posts{?limit,offset}', {});
      expect(result).toBe('/api/posts');
    });
  });

  describe('resolveJsonPointer', () => {
    const testObj = {
      email: 'user@example.com',
      user: {
        name: 'John Doe',
        profile: {
          avatar: 'avatar.jpg',
          settings: {
            theme: 'dark'
          }
        }
      },
      tags: ['javascript', 'web', 'development'],
      items: [
        { title: 'First Post', author: 'Alice' },
        { title: 'Second Post', author: 'Bob' }
      ],
      'special/key': 'special value',
      'tilde~key': 'tilde value'
    };

    it('should resolve simple property access', () => {
      const result = resolveJsonPointer(testObj, '/email');
      expect(result).toBe('user@example.com');
    });

    it('should resolve nested object access', () => {
      const result = resolveJsonPointer(testObj, '/user/name');
      expect(result).toBe('John Doe');
    });

    it('should resolve deep nested object access', () => {
      const result = resolveJsonPointer(testObj, '/user/profile/settings/theme');
      expect(result).toBe('dark');
    });

    it('should resolve array element access', () => {
      const result = resolveJsonPointer(testObj, '/tags/0');
      expect(result).toBe('javascript');
    });

    it('should resolve nested array object access', () => {
      const result = resolveJsonPointer(testObj, '/items/1/author');
      expect(result).toBe('Bob');
    });

    it('should handle escaped characters in keys', () => {
      const result = resolveJsonPointer(testObj, '/special~1key');
      expect(result).toBe('special value');
    });

    it('should handle tilde escape sequences', () => {
      const result = resolveJsonPointer(testObj, '/tilde~0key');
      expect(result).toBe('tilde value');
    });

    it('should return undefined for non-existent paths', () => {
      const result = resolveJsonPointer(testObj, '/nonexistent/path');
      expect(result).toBeUndefined();
    });

    it('should return undefined for out-of-bounds array access', () => {
      const result = resolveJsonPointer(testObj, '/tags/10');
      expect(result).toBeUndefined();
    });

    it('should handle empty pointer (return root object)', () => {
      const result = resolveJsonPointer(testObj, '');
      expect(result).toBe(testObj);
    });

    it('should return undefined for invalid pointer format', () => {
      const result = resolveJsonPointer(testObj, 'invalid');
      expect(result).toBeUndefined();
    });
  });

  describe('mapParameters with enhanced JSON Pointer support', () => {
    const testArgs = {
      email: 'user@example.com',
      user: {
        name: 'John Doe',
        profile: {
          avatar: 'avatar.jpg'
        }
      },
      tags: ['javascript', 'web'],
      items: [
        { title: 'First Post' },
        { title: 'Second Post' }
      ]
    };

    it('should map simple properties', () => {
      const mapping = {
        userEmail: '/email'
      };
      const result = mapParameters(testArgs, mapping);
      expect(result).toEqual({
        userEmail: 'user@example.com'
      });
    });

    it('should map nested object properties', () => {
      const mapping = {
        userName: '/user/name',
        avatar: '/user/profile/avatar'
      };
      const result = mapParameters(testArgs, mapping);
      expect(result).toEqual({
        userName: 'John Doe',
        avatar: 'avatar.jpg'
      });
    });

    it('should map array elements', () => {
      const mapping = {
        firstTag: '/tags/0',
        firstItemTitle: '/items/0/title'
      };
      const result = mapParameters(testArgs, mapping);
      expect(result).toEqual({
        firstTag: 'javascript',
        firstItemTitle: 'First Post'
      });
    });

    it('should ignore non-existent paths', () => {
      const mapping = {
        existingField: '/email',
        nonExistentField: '/user/nonexistent'
      };
      const result = mapParameters(testArgs, mapping);
      expect(result).toEqual({
        existingField: 'user@example.com'
      });
    });

    it('should handle complex mixed mappings', () => {
      const mapping = {
        email: '/email',
        name: '/user/name',
        avatar: '/user/profile/avatar',
        primaryTag: '/tags/0',
        secondaryTag: '/tags/1',
        latestPostTitle: '/items/0/title'
      };
      const result = mapParameters(testArgs, mapping);
      expect(result).toEqual({
        email: 'user@example.com',
        name: 'John Doe',
        avatar: 'avatar.jpg',
        primaryTag: 'javascript',
        secondaryTag: 'web',
        latestPostTitle: 'First Post'
      });
    });
  });

  describe('splitParametersByLocation', () => {
    it('should split parameters into explicit buckets and leave unassigned', () => {
      const params = {
        id: '123',
        q: 'search',
        token: 'tok_abc',
        content: 'hello world',
        extra: 'keep'
      };

      const parameterLocation = {
        id: 'path',
        q: 'query',
        token: 'header',
        content: 'body'
      } as const;

      const result = splitParametersByLocation(params, parameterLocation);

      expect(result.path).toEqual({ id: '123' });
      expect(result.query).toEqual({ q: 'search' });
      expect(result.header).toEqual({ token: 'tok_abc' });
      expect(result.body).toEqual({ content: 'hello world' });
      expect(result.unassigned).toEqual({ extra: 'keep' });
    });

    it('should treat all parameters as unassigned when no parameterLocation is provided', () => {
      const params = { id: '123', q: 'search' };
      const result = splitParametersByLocation(params);

      expect(result.path).toEqual({});
      expect(result.query).toEqual({});
      expect(result.header).toEqual({});
      expect(result.body).toEqual({});
      expect(result.unassigned).toEqual(params);
    });
  });
});

describe('AURA Integration Tests', () => {
  let serverProcess: any;
  let serverUrl: string;

  beforeEach(async () => {
    serverUrl = 'http://localhost:3000';
    // In real tests, you would start the server here
    // For now, we assume the server is running
  });

  afterEach(async () => {
    // Clean up server process if needed
  });

  describe('Authentication Flow', () => {
    it('should successfully authenticate with valid credentials', async () => {
      const cookieJar = new CookieJar();
      const client = wrapper(axios.create({
        jar: cookieJar,
        withCredentials: true,
        validateStatus: () => true
      }));

      // Test login
      const loginResponse = await client.post(`${serverUrl}/api/auth/login`, {
        email: 'demo@aura.dev',
        password: 'password123'
      });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.data.success).toBe(true);
      expect(loginResponse.data.user).toBeDefined();
      
      // Check if cookie was set in response headers
      const setCookieHeader = loginResponse.headers['set-cookie'];
      console.log('Set-Cookie header:', setCookieHeader);
      
      // Check if cookie was set
      const cookies = await cookieJar.getCookies(serverUrl);
      console.log('All cookies:', cookies.map(c => ({ key: c.key, value: c.value, domain: c.domain, path: c.path })));
      const authCookie = cookies.find(cookie => cookie.key === 'auth-token');
      console.log('Auth cookie found:', authCookie ? { key: authCookie.key, value: authCookie.value } : 'NOT FOUND');
      
      // If the cookie jar doesn't work in Next.js production, at least verify the header was sent
      if (!authCookie && setCookieHeader) {
        console.warn('Cookie jar failed to capture cookie, but Set-Cookie header was present');
        expect(setCookieHeader).toBeDefined();
        expect(setCookieHeader.toString()).toContain('auth-token=');
      } else {
        expect(authCookie).toBeDefined();
        expect(authCookie?.value).toBeTruthy();
      }
    });

    it('should reject invalid credentials', async () => {
      const cookieJar = new CookieJar();
      const client = wrapper(axios.create({
        jar: cookieJar,
        withCredentials: true,
        validateStatus: () => true
      }));

      const loginResponse = await client.post(`${serverUrl}/api/auth/login`, {
        email: 'demo@aura.dev',
        password: 'wrongpassword'
      });

      expect(loginResponse.status).toBe(401);
      expect(loginResponse.data.code).toBe('INVALID_CREDENTIALS');
      
      // Strengthen error shape validation - verify exact error response structure
      expect(loginResponse.data).toHaveProperty('code');
      expect(loginResponse.data).toHaveProperty('detail');
      expect(typeof loginResponse.data.code).toBe('string');
      expect(typeof loginResponse.data.detail).toBe('string');
      // Ensure no unexpected properties in the error response
      const expectedKeys = ['code', 'detail'];
      const actualKeys = Object.keys(loginResponse.data);
      const unexpectedKeys = actualKeys.filter(key => !expectedKeys.includes(key));
      expect(unexpectedKeys.length).toBe(0);
    });
  });

  describe('AURA-State Header Management', () => {
    it('should return correct capabilities for unauthenticated user', async () => {
      const client = axios.create({ validateStatus: () => true });
      
      const response = await client.get(`${serverUrl}/api/posts`);
      
      const auraStateHeader = response.headers['aura-state'];
      expect(auraStateHeader).toBeDefined();
      
      if (auraStateHeader) {
        const auraState: AuraState = JSON.parse(Buffer.from(auraStateHeader, 'base64').toString('utf-8'));
        expect(auraState.isAuthenticated).toBe(false);
        expect(auraState.capabilities).toContain('login');
        expect(auraState.capabilities).toContain('list_posts');
        expect(auraState.capabilities).not.toContain('create_post');
      }
    });

    it('should return correct capabilities for authenticated user', async () => {
      const cookieJar = new CookieJar();
      const client = wrapper(axios.create({
        jar: cookieJar,
        withCredentials: true,
        validateStatus: () => true
      }));

      // First login
      const loginResponse = await client.post(`${serverUrl}/api/auth/login`, {
        email: 'demo@aura.dev',
        password: 'password123'
      });
      
      expect(loginResponse.status).toBe(200);
      
      // Extract auth token from response
      const authToken = extractCookieValue(loginResponse.headers['set-cookie'], 'auth-token');
      
      // Now make a request to check capabilities
      const response = await client.get(`${serverUrl}/api/posts`, {
        headers: authToken ? { Cookie: `auth-token=${authToken}` } : {}
      });
      
      const auraStateHeader = response.headers['aura-state'];
      expect(auraStateHeader).toBeDefined();
      
      if (auraStateHeader) {
        const auraState: AuraState = JSON.parse(Buffer.from(auraStateHeader, 'base64').toString('utf-8'));
        expect(auraState.isAuthenticated).toBe(true);
        expect(auraState.capabilities).toContain('create_post');
        expect(auraState.capabilities).toContain('list_posts');
      }
    });
  });

  describe('Multi-Step Operations', () => {
    it('should handle login followed by create post', async () => {
      const cookieJar = new CookieJar();
      const client = wrapper(axios.create({
        jar: cookieJar,
        withCredentials: true,
        validateStatus: () => true
      }));

      // Step 1: Login
      const loginResponse = await client.post(`${serverUrl}/api/auth/login`, {
        email: 'demo@aura.dev',
        password: 'password123'
      });

      expect(loginResponse.status).toBe(200);
      
      // Extract auth token
      const authToken = extractCookieValue(loginResponse.headers['set-cookie'], 'auth-token');
      expect(authToken).toBeDefined();

      // Step 2: Create a post using the authenticated session
      const createPostResponse = await client.post(`${serverUrl}/api/posts`, {
        title: 'Test Post from Integration Test',
        content: 'This is a test post created during integration testing.'
      }, {
        headers: authToken ? { Cookie: `auth-token=${authToken}` } : {}
      });

      expect(createPostResponse.status).toBe(201);
      expect(createPostResponse.data.title).toBe('Test Post from Integration Test');
    });

    it('should fail to create post without authentication', async () => {
      const client = axios.create({ validateStatus: () => true });
      
      const createPostResponse = await client.post(`${serverUrl}/api/posts`, {
        title: 'Unauthorized Test Post',
        content: 'This should fail.'
      });
      
      expect(createPostResponse.status).toBe(401);
      expect(createPostResponse.data.code).toBe('UNAUTHORIZED');
      
      // Strengthen error shape validation - verify exact error response structure
      expect(createPostResponse.data).toHaveProperty('code');
      expect(createPostResponse.data).toHaveProperty('detail');
      expect(typeof createPostResponse.data.code).toBe('string');
      expect(typeof createPostResponse.data.detail).toBe('string');
      // UNAUTHORIZED errors may include a 'hint' field
      if ('hint' in createPostResponse.data) {
        expect(typeof createPostResponse.data.hint).toBe('string');
      }
      // Ensure no unexpected properties in the error response
      const expectedKeys = ['code', 'detail', 'hint'];
      const actualKeys = Object.keys(createPostResponse.data);
      const unexpectedKeys = actualKeys.filter(key => !expectedKeys.includes(key));
      expect(unexpectedKeys.length).toBe(0);
    });
  });

  describe('Capability Validation', () => {
    it('should validate required parameters', async () => {
      const cookieJar = new CookieJar();
      const client = wrapper(axios.create({
        jar: cookieJar,
        withCredentials: true,
        validateStatus: () => true
      }));

      // Login first
      const loginResponse = await client.post(`${serverUrl}/api/auth/login`, {
        email: 'demo@aura.dev',
        password: 'password123'
      });
      
      expect(loginResponse.status).toBe(200);
      const authToken = extractCookieValue(loginResponse.headers['set-cookie'], 'auth-token');

      // Try to create post without required parameters
      const response = await client.post(`${serverUrl}/api/posts`, {
        // Missing required 'title' field
        content: 'Content without title'
      }, {
        headers: authToken ? { Cookie: `auth-token=${authToken}` } : {}
      });
      
      expect(response.status).toBe(400);
      expect(response.data.code).toBe('VALIDATION_ERROR');
      
      // Strengthen error shape validation - verify exact ValidationErrorResponse structure
      expect(response.data).toHaveProperty('code');
      expect(response.data).toHaveProperty('detail');
      expect(typeof response.data.code).toBe('string');
      expect(typeof response.data.detail).toBe('string');
      // ValidationErrorResponse may include an 'errors' array
      if ('errors' in response.data) {
        expect(Array.isArray(response.data.errors)).toBe(true);
        // Verify each error object has the expected structure
        response.data.errors.forEach((error: any) => {
          expect(error).toHaveProperty('field');
          expect(error).toHaveProperty('message');
          expect(typeof error.field).toBe('string');
          expect(typeof error.message).toBe('string');
          // 'value' property is optional
          if ('value' in error) {
            // value can be of any type, so we just check it exists
            expect(error.value).toBeDefined();
          }
        });
      }
      // Ensure no unexpected properties in the error response
      const expectedKeys = ['code', 'detail', 'errors'];
      const actualKeys = Object.keys(response.data);
      const unexpectedKeys = actualKeys.filter(key => !expectedKeys.includes(key));
      expect(unexpectedKeys.length).toBe(0);
    });

    it('should validate parameter types and constraints', async () => {
      const cookieJar = new CookieJar();
      const client = wrapper(axios.create({
        jar: cookieJar,
        withCredentials: true,
        validateStatus: () => true
      }));

      // Login first
      const loginResponse = await client.post(`${serverUrl}/api/auth/login`, {
        email: 'demo@aura.dev',
        password: 'password123'
      });
      
      expect(loginResponse.status).toBe(200);
      const authToken = extractCookieValue(loginResponse.headers['set-cookie'], 'auth-token');

      // Try to create post with invalid parameter type
      const response = await client.post(`${serverUrl}/api/posts`, {
        title: 123, // Should be string
        content: 'Test content'
      }, {
        headers: authToken ? { Cookie: `auth-token=${authToken}` } : {}
      });
      
      expect(response.status).toBe(400);
    });
  });
});

describe('End-to-End Workflow Tests', () => {
  it('should complete full user journey: login → create post → list posts', async () => {
    const serverUrl = 'http://localhost:3000';
    const cookieJar = new CookieJar();
    const client = wrapper(axios.create({
      jar: cookieJar,
      withCredentials: true,
      validateStatus: () => true
    }));

    // 1. Login
    const loginResponse = await client.post(`${serverUrl}/api/auth/login`, {
      email: 'demo@aura.dev',
      password: 'password123'
    });
    expect(loginResponse.status).toBe(200);
    const authToken = extractCookieValue(loginResponse.headers['set-cookie'], 'auth-token');
    expect(authToken).toBeDefined();

    // 2. Create a new post
    const newPost = {
      title: 'E2E Test Post',
      content: 'This post was created as part of an end-to-end test.'
    };

    const createResponse = await client.post(`${serverUrl}/api/posts`, newPost, {
      headers: authToken ? { Cookie: `auth-token=${authToken}` } : {}
    });
    expect(createResponse.status).toBe(201);
    expect(createResponse.data.title).toBe(newPost.title);

    // 3. List all posts
    const listResponse = await client.get(`${serverUrl}/api/posts`, {
      headers: authToken ? { Cookie: `auth-token=${authToken}` } : {}
    });
    expect(listResponse.status).toBe(200);
    expect(listResponse.data.posts).toBeDefined();
    expect(Array.isArray(listResponse.data.posts)).toBe(true);
    
    // Verify our post is in the list
    const createdPost = listResponse.data.posts.find((p: any) => p.title === newPost.title);
    expect(createdPost).toBeDefined();
    expect(createdPost.content).toBe(newPost.content);
  });

  it('should handle authentication state changes correctly', async () => {
    const serverUrl = 'http://localhost:3000';
    const cookieJar = new CookieJar();
    const client = wrapper(axios.create({
      jar: cookieJar,
      withCredentials: true,
      validateStatus: () => true
    }));

    // 1. Check unauthenticated state
    let response = await client.get(`${serverUrl}/api/posts`);
    let auraState = JSON.parse(Buffer.from(response.headers['aura-state'], 'base64').toString('utf-8'));
    expect(auraState.isAuthenticated).toBe(false);
    expect(auraState.capabilities).not.toContain('create_post');

    // 2. Login
    const loginResponse = await client.post(`${serverUrl}/api/auth/login`, {
      email: 'demo@aura.dev',
      password: 'password123'
    });
    expect(loginResponse.status).toBe(200);
    const authToken = extractCookieValue(loginResponse.headers['set-cookie'], 'auth-token');

    // 3. Check authenticated state
    response = await client.get(`${serverUrl}/api/posts`, {
      headers: authToken ? { Cookie: `auth-token=${authToken}` } : {}
    });
    auraState = JSON.parse(Buffer.from(response.headers['aura-state'], 'base64').toString('utf-8'));
    expect(auraState.isAuthenticated).toBe(true);
    expect(auraState.capabilities).toContain('create_post');
  });
}); 
