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
import { expandUriTemplate } from './agent';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { AuraManifest, AuraState } from '@aura/protocol';

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
  describe('expandUriTemplate', () => {
    it('should expand simple path parameters', () => {
      const result = expandUriTemplate('/api/posts/{id}', { id: '123' });
      expect(result).toBe('/api/posts/123');
    });

    it('should remove query parameter templates from URL', () => {
      const result = expandUriTemplate('/api/posts{?limit,offset}', { limit: 10, offset: 0 });
      expect(result).toBe('/api/posts');
    });

    it('should handle exploded array parameter templates', () => {
      const result = expandUriTemplate('/api/posts{?tags*}', { tags: ['tech', 'ai'] });
      expect(result).toBe('/api/posts');
    });

    it('should handle mixed path and query parameters', () => {
      const result = expandUriTemplate('/api/posts/{id}{?include}', { id: '123', include: 'comments' });
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
      
      // Check if cookie was set
      const cookies = await cookieJar.getCookies(serverUrl);
      const authCookie = cookies.find(cookie => cookie.key === 'auth-token');
      expect(authCookie).toBeDefined();
      expect(authCookie?.value).toBeTruthy();
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
      await client.post(`${serverUrl}/api/auth/login`, {
        email: 'demo@aura.dev',
        password: 'password123'
      });

      // Then make a request to check state
      const response = await client.get(`${serverUrl}/api/posts`);
      
      const auraStateHeader = response.headers['aura-state'];
      expect(auraStateHeader).toBeDefined();
      
      if (auraStateHeader) {
        const auraState: AuraState = JSON.parse(Buffer.from(auraStateHeader, 'base64').toString('utf-8'));
        expect(auraState.isAuthenticated).toBe(true);
        expect(auraState.capabilities).toContain('create_post');
        expect(auraState.capabilities).toContain('list_posts');
        expect(auraState.capabilities).toContain('update_post');
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
      
      // Step 2: Create post (should now work)
      const createPostResponse = await client.post(`${serverUrl}/api/posts`, {
        title: 'Test Post from Integration Test',
        content: 'This is a test post created during integration testing.'
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

      // First login to pass authentication
      await client.post(`${serverUrl}/api/auth/login`, {
        email: 'demo@aura.dev',
        password: 'password123'
      });
      
      // Try to create post without required fields
      const response = await client.post(`${serverUrl}/api/posts`, {
        title: 'Incomplete Post'
        // Missing content
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
      await client.post(`${serverUrl}/api/auth/login`, {
        email: 'demo@aura.dev',
        password: 'password123'
      });

      // Try to create post with invalid data
      const response = await client.post(`${serverUrl}/api/posts`, {
        title: '', // Empty title should fail
        content: 'Valid content'
      });
      
      expect(response.status).toBe(400);
    });
  });
});

describe('End-to-End Workflow Tests', () => {
  it('should complete full user journey: login → create post → list posts', async () => {
    const cookieJar = new CookieJar();
    const client = wrapper(axios.create({
      jar: cookieJar,
      withCredentials: true,
      validateStatus: () => true
    }));

    const serverUrl = 'http://localhost:3000';

    // Step 1: Login
    const loginResponse = await client.post(`${serverUrl}/api/auth/login`, {
      email: 'demo@aura.dev',
      password: 'password123'
    });
    expect(loginResponse.status).toBe(200);

    // Step 2: Create a new post
    const newPost = {
      title: `E2E Test Post ${Date.now()}`,
      content: 'This post was created during end-to-end testing.',
      tags: ['test', 'e2e'],
      published: true
    };

    const createResponse = await client.post(`${serverUrl}/api/posts`, newPost);
    expect(createResponse.status).toBe(201);
    expect(createResponse.data.title).toBe(newPost.title);

    // Step 3: List posts and verify our post is included
    const listResponse = await client.get(`${serverUrl}/api/posts`);
    expect(listResponse.status).toBe(200);
    expect(listResponse.data.posts).toBeDefined();
    expect(Array.isArray(listResponse.data.posts)).toBe(true);
    
    // Find our post in the list
    const ourPost = listResponse.data.posts.find((post: any) => post.title === newPost.title);
    expect(ourPost).toBeDefined();
    expect(ourPost.content).toBe(newPost.content);
  });

  it('should handle authentication state changes correctly', async () => {
    const cookieJar = new CookieJar();
    const client = wrapper(axios.create({
      jar: cookieJar,
      withCredentials: true,
      validateStatus: () => true
    }));

    const serverUrl = 'http://localhost:3000';

    // Check initial unauthenticated state
    let response = await client.get(`${serverUrl}/api/posts`);
    let auraState = JSON.parse(Buffer.from(response.headers['aura-state'], 'base64').toString('utf-8'));
    expect(auraState.isAuthenticated).toBe(false);

    // Login
    await client.post(`${serverUrl}/api/auth/login`, {
      email: 'demo@aura.dev',
      password: 'password123'
    });

    // Check authenticated state
    response = await client.get(`${serverUrl}/api/posts`);
    auraState = JSON.parse(Buffer.from(response.headers['aura-state'], 'base64').toString('utf-8'));
    expect(auraState.isAuthenticated).toBe(true);
    expect(auraState.capabilities).toContain('create_post');
  });
}); 