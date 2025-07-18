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
import { prepareUrlPath } from './agent';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { AuraManifest, AuraState } from '@aura/protocol';

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

    it('should remove query parameter templates from URL', () => {
      const result = prepareUrlPath('/api/posts{?limit,offset}', { limit: 10, offset: 0 });
      expect(result).toBe('/api/posts');
    });

    it('should handle exploded array parameter templates', () => {
      const result = prepareUrlPath('/api/posts{?tags*}', { tags: ['tech', 'ai'] });
      expect(result).toBe('/api/posts');
    });

    it('should handle mixed path and query parameters', () => {
      const result = prepareUrlPath('/api/posts/{id}{?include}', { id: '123', include: 'comments' });
      expect(result).toBe('/api/posts/123');
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
    expect(Array.isArray(listResponse.data)).toBe(true);
    
    // Verify our post is in the list
    const createdPost = listResponse.data.find((p: any) => p.title === newPost.title);
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