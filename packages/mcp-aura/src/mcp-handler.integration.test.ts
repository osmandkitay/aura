import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { handleMCPRequest, clearAdapterCache, getSiteInfo, handleMCPRequestBatch } from './mcp-handler.js';
import type { MCPRequest, MCPResponse } from './mcp-handler.js';
import axios from 'axios';

/**
 * Integration tests for MCP Handler
 * 
 * These tests verify the entire workflow from MCP request to AURA server response.
 * They require a running instance of the reference-server.
 * 
 * Prerequisites:
 * - reference-server running on http://localhost:3000
 * - Server should have the demo user (demo@aura.dev) available for login
 */
describe('MCP Handler Integration Tests', () => {
  const REFERENCE_SERVER_URL = 'http://localhost:3000';
  const DEMO_USER_EMAIL = 'demo@aura.dev';
  const DEMO_USER_PASSWORD = 'password123';

  beforeAll(async () => {
    // Verify that the reference server is running
    try {
      console.log('Checking if reference server is running...');
      const response = await axios.get(`${REFERENCE_SERVER_URL}/.well-known/aura.json`, {
        timeout: 5000,
      });
      
      if (response.status !== 200) {
        throw new Error(`Server returned status ${response.status}`);
      }
      
      console.log('✅ Reference server is running and accessible');
    } catch (error) {
      console.error('❌ Reference server is not accessible. Please start it first.');
      console.error('Run: cd packages/reference-server && npm run dev');
      throw new Error(`Reference server is not running at ${REFERENCE_SERVER_URL}. Error: ${error}`);
    }
  });

  beforeEach(() => {
    // Clear adapter cache before each test to ensure clean state
    clearAdapterCache();
  });

  afterAll(() => {
    // Clean up after all tests
    clearAdapterCache();
  });

  describe('Site Information Retrieval', () => {
    it('should successfully fetch site information', async () => {
      const response = await getSiteInfo(REFERENCE_SERVER_URL);
      
      expect(response.success).toBe(true);
      expect(response.manifest).toBeDefined();
      expect(response.manifest?.siteName).toBe('AURA Lighthouse Demo');
      expect(response.manifest?.siteUrl).toBe('https://aura-lighthouse.example.com');
      expect(response.manifest?.capabilities).toContain('list_posts');
      expect(response.manifest?.capabilities).toContain('create_post');
      expect(response.availableCapabilities).toBeDefined();
    });

    it('should handle invalid site URL gracefully', async () => {
      const response = await getSiteInfo('http://invalid-url-that-does-not-exist.com');
      
      expect(response.success).toBe(false);
      expect(response.status).toBe(400); // Pre-flight error should have status 400  
      expect(response.error).toBeDefined();
      expect(response.error).toContain('Failed to fetch manifest');
    });
  });

  describe('Basic Capability Execution', () => {
    it('should execute list_posts capability successfully', async () => {
      const request: MCPRequest = {
        siteUrl: REFERENCE_SERVER_URL,
        capabilityId: 'list_posts',
        args: {},
        requestId: 'test-list-posts-1',
      };

      const response = await handleMCPRequest(request);
      
      expect(response.success).toBe(true);
      expect(response.status).toBe(200);
      expect(response.requestId).toBe('test-list-posts-1');
      expect(response.data).toBeDefined();
      expect(response.data.posts).toBeDefined();
      expect(Array.isArray(response.data.posts)).toBe(true);
      expect(response.availableCapabilities).toContain('list_posts');
      expect(response.manifest).toBeDefined();
    });

    it('should handle non-existent capability gracefully', async () => {
      const request: MCPRequest = {
        siteUrl: REFERENCE_SERVER_URL,
        capabilityId: 'non_existent_capability',
        args: {},
        requestId: 'test-invalid-capability',
      };

      const response = await handleMCPRequest(request);
      
      expect(response.success).toBe(false);
      expect(response.status).toBe(400); // Pre-flight error should have status 400
      expect(response.error).toBeDefined();
      expect(response.error).toContain('not found in manifest');
      expect(response.requestId).toBe('test-invalid-capability');
    });
  });

  describe('Authentication and Protected Resources', () => {
    it('should handle protected capability without authentication (401 error)', async () => {
      const request: MCPRequest = {
        siteUrl: REFERENCE_SERVER_URL,
        capabilityId: 'create_post',
        args: {
          title: 'Test Post',
          content: 'This should fail without authentication',
        },
        requestId: 'test-unauthorized',
      };

      const response = await handleMCPRequest(request);
      
      // The request should complete but return a 401 status
      expect(response.success).toBe(false); // success is based on 2xx status codes
      expect(response.status).toBe(401);
      expect(response.requestId).toBe('test-unauthorized');
    });

    it('should successfully login and maintain session state', async () => {
      // First, login
      const loginRequest: MCPRequest = {
        siteUrl: REFERENCE_SERVER_URL,
        capabilityId: 'login',
        args: {
          email: DEMO_USER_EMAIL,
          password: DEMO_USER_PASSWORD,
        },
        requestId: 'test-login',
      };

      const loginResponse = await handleMCPRequest(loginRequest);
      
      expect(loginResponse.success).toBe(true);
      expect(loginResponse.status).toBe(200);
      expect(loginResponse.state).toBeDefined();
      expect(loginResponse.data.user).toBeDefined();
      expect(loginResponse.data.user.email).toBe(DEMO_USER_EMAIL);
      expect(loginResponse.availableCapabilities).toContain('create_post');
      expect(loginResponse.availableCapabilities).toContain('logout');
    });
  });

  describe('Full Workflow: Login and Create Post', () => {
    it('should complete full login and create post workflow', async () => {
      // Step 1: Login
      const loginRequest: MCPRequest = {
        siteUrl: REFERENCE_SERVER_URL,
        capabilityId: 'login',
        args: {
          email: DEMO_USER_EMAIL,
          password: DEMO_USER_PASSWORD,
        },
        requestId: 'workflow-login',
      };

      const loginResponse = await handleMCPRequest(loginRequest);
      
      expect(loginResponse.success).toBe(true);
      expect(loginResponse.status).toBe(200);
      expect(loginResponse.data.user).toBeDefined();
      expect(loginResponse.data.user.email).toBe(DEMO_USER_EMAIL);
      
      // Step 2: Create a post (should now work because we're authenticated)
      const createPostRequest: MCPRequest = {
        siteUrl: REFERENCE_SERVER_URL,
        capabilityId: 'create_post',
        args: {
          title: 'Integration Test Post',
          content: 'This post was created by the MCP integration test',
        },
        requestId: 'workflow-create-post',
      };

      const createPostResponse = await handleMCPRequest(createPostRequest);
      
      expect(createPostResponse.success).toBe(true);
      expect(createPostResponse.status).toBe(201);
      expect(createPostResponse.data).toBeDefined();
      expect(createPostResponse.data.id).toBeDefined();
      expect(createPostResponse.data.title).toBe('Integration Test Post');
      
      // Step 3: Verify the post was created by listing posts
      const listPostsRequest: MCPRequest = {
        siteUrl: REFERENCE_SERVER_URL,
        capabilityId: 'list_posts',
        args: {},
        requestId: 'workflow-verify-post',
      };

      const listPostsResponse = await handleMCPRequest(listPostsRequest);
      
      expect(listPostsResponse.success).toBe(true);
      expect(listPostsResponse.status).toBe(200);
      expect(listPostsResponse.data.posts).toBeDefined();
      expect(Array.isArray(listPostsResponse.data.posts)).toBe(true);
      
      // Find our created post
      const createdPost = listPostsResponse.data.posts.find(
        (post: any) => post.id === createPostResponse.data.id
      );
      
      expect(createdPost).toBeDefined();
      expect(createdPost.title).toBe('Integration Test Post');
      expect(createdPost.content).toBe('This post was created by the MCP integration test');
    });
  });

  describe('Batch Request Processing', () => {
    it('should handle batch requests correctly', async () => {
      const batchRequests: MCPRequest[] = [
        {
          siteUrl: REFERENCE_SERVER_URL,
          capabilityId: 'list_posts',
          args: {},
          requestId: 'batch-1',
        },
        {
          siteUrl: REFERENCE_SERVER_URL,
          capabilityId: 'login',
          args: {
            email: DEMO_USER_EMAIL,
            password: DEMO_USER_PASSWORD,
          },
          requestId: 'batch-2',
        },
      ];

      const responses = await handleMCPRequestBatch(batchRequests);
      
      expect(responses).toHaveLength(2);
      
      // Both requests should succeed
      expect(responses[0].success).toBe(true);
      expect(responses[0].requestId).toBe('batch-1');
      expect(responses[1].success).toBe(true);
      expect(responses[1].requestId).toBe('batch-2');
      
      // Login response should include user data
      expect(responses[1].data.user).toBeDefined();
      expect(responses[1].data.user.email).toBe(DEMO_USER_EMAIL);
    });

    it('should handle mixed success/failure in batch requests', async () => {
      const batchRequests: MCPRequest[] = [
        {
          siteUrl: REFERENCE_SERVER_URL,
          capabilityId: 'list_posts',
          args: {},
          requestId: 'batch-success',
        },
        {
          siteUrl: REFERENCE_SERVER_URL,
          capabilityId: 'non_existent_capability',
          args: {},
          requestId: 'batch-failure',
        },
      ];

      const responses = await handleMCPRequestBatch(batchRequests);
      
      expect(responses).toHaveLength(2);
      
      // First should succeed, second should fail
      expect(responses[0].success).toBe(true);
      expect(responses[0].requestId).toBe('batch-success');
      expect(responses[1].success).toBe(false);
      expect(responses[1].status).toBe(400); // Pre-flight error should have status 400
      expect(responses[1].requestId).toBe('batch-failure');
      expect(responses[1].error).toContain('not found in manifest');
    });
  });

  describe('Error Propagation and Handling', () => {
    it('should handle missing required fields gracefully', async () => {
      const invalidRequest = {
        siteUrl: REFERENCE_SERVER_URL,
        // Missing capabilityId
        args: {},
        requestId: 'test-missing-capability',
      } as MCPRequest;

      const response = await handleMCPRequest(invalidRequest);
      
      expect(response.success).toBe(false);
      expect(response.status).toBe(400); // Pre-flight error should have status 400
      expect(response.error).toBe('Missing required field: capabilityId');
      expect(response.requestId).toBe('test-missing-capability');
    });

    it('should handle missing siteUrl gracefully', async () => {
      const invalidRequest = {
        // Missing siteUrl
        capabilityId: 'list_posts',
        args: {},
        requestId: 'test-missing-site',
      } as MCPRequest;

      const response = await handleMCPRequest(invalidRequest);
      
      expect(response.success).toBe(false);
      expect(response.status).toBe(400); // Pre-flight error should have status 400
      expect(response.error).toBe('Missing required field: siteUrl');
      expect(response.requestId).toBe('test-missing-site');
    });

    it('should handle server errors correctly', async () => {
      // Try to create a post with invalid data to trigger a server error
      const request: MCPRequest = {
        siteUrl: REFERENCE_SERVER_URL,
        capabilityId: 'create_post',
        args: {
          // Missing required title field
          content: 'This should cause a validation error',
        },
        requestId: 'test-server-error',
      };

      const response = await handleMCPRequest(request);
      
      // The request completes but with an error status
      expect(response.success).toBe(false);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.requestId).toBe('test-server-error');
    });

    it('should properly differentiate between pre-flight errors (400) and server errors (401+)', async () => {
      // Test 1: Pre-flight error - non-existent capability should return 400
      const preflightRequest: MCPRequest = {
        siteUrl: REFERENCE_SERVER_URL,
        capabilityId: 'definitely_does_not_exist',
        args: {},
        requestId: 'test-preflight-400',
      };

      const preflightResponse = await handleMCPRequest(preflightRequest);
      
      expect(preflightResponse.success).toBe(false);
      expect(preflightResponse.status).toBe(400); // Pre-flight validation failure
      expect(preflightResponse.error).toContain('not found in manifest');
      expect(preflightResponse.requestId).toBe('test-preflight-400');

      // Test 2: Server error - authentication failure should return 401
      const serverErrorRequest: MCPRequest = {
        siteUrl: REFERENCE_SERVER_URL,
        capabilityId: 'create_post',
        args: { title: 'Test', content: 'Test content' },
        requestId: 'test-server-401',
      };

      const serverErrorResponse = await handleMCPRequest(serverErrorRequest);
      
      expect(serverErrorResponse.success).toBe(false);
      expect(serverErrorResponse.status).toBe(401); // Server-side authentication error
      expect(serverErrorResponse.requestId).toBe('test-server-401');

      // Verify the status codes are different and appropriate
      expect(preflightResponse.status).not.toBe(serverErrorResponse.status);
      expect(preflightResponse.status!).toBeLessThan(serverErrorResponse.status!);
    });
  });

  describe('Session Management and State Persistence', () => {
    it('should maintain session across multiple requests', async () => {
      // Login first
      const loginRequest: MCPRequest = {
        siteUrl: REFERENCE_SERVER_URL,
        capabilityId: 'login',
        args: {
          email: DEMO_USER_EMAIL,
          password: DEMO_USER_PASSWORD,
        },
        requestId: 'session-login',
      };

      const loginResponse = await handleMCPRequest(loginRequest);
      expect(loginResponse.success).toBe(true);
      
      // Make another request that should use the same session
      const profileRequest: MCPRequest = {
        siteUrl: REFERENCE_SERVER_URL,
        capabilityId: 'get_profile',
        args: {},
        requestId: 'session-profile',
      };

      const profileResponse = await handleMCPRequest(profileRequest);
      
      // This should succeed because we're still logged in
      expect(profileResponse.success).toBe(true);
      expect(profileResponse.status).toBe(200);
      expect(profileResponse.data).toBeDefined();
    });

    it('should handle logout and session invalidation', async () => {
      // Login first
      const loginRequest: MCPRequest = {
        siteUrl: REFERENCE_SERVER_URL,
        capabilityId: 'login',
        args: {
          email: DEMO_USER_EMAIL,
          password: DEMO_USER_PASSWORD,
        },
        requestId: 'logout-login',
      };

      const loginResponse = await handleMCPRequest(loginRequest);
      expect(loginResponse.success).toBe(true);
      
      // Logout
      const logoutRequest: MCPRequest = {
        siteUrl: REFERENCE_SERVER_URL,
        capabilityId: 'logout',
        args: {},
        requestId: 'logout-test',
      };

      const logoutResponse = await handleMCPRequest(logoutRequest);
      expect(logoutResponse.success).toBe(true);
      
      // Try to access a protected resource - should fail
      const protectedRequest: MCPRequest = {
        siteUrl: REFERENCE_SERVER_URL,
        capabilityId: 'create_post',
        args: {
          title: 'This should fail',
          content: 'User is logged out',
        },
        requestId: 'logout-protected',
      };

      const protectedResponse = await handleMCPRequest(protectedRequest);
      expect(protectedResponse.success).toBe(false);
      expect(protectedResponse.status).toBe(401);
    });
  });
});
