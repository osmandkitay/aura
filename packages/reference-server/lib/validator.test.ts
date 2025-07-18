import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { NextApiRequest } from 'next';
import { validateRequest, clearValidationCache } from './validator';

// Mock fs module for controlled testing
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

const mockFs = vi.mocked(await import('fs'));

// Sample manifest data for testing
const mockManifest = {
  "$schema": "https://aura.dev/schemas/v1.0.json",
  "protocol": "AURA",
  "version": "1.0",
  "site": {
    "name": "Test Site",
    "description": "Test",
    "url": "http://localhost:3000"
  },
  "capabilities": {
    "get_profile": {
      "id": "get_profile",
      "v": 1,
      "description": "Get current user's profile",
      "action": {
        "type": "HTTP",
        "method": "GET",
        "urlTemplate": "/api/user/profile",
        "cors": true,
        "parameterMapping": {}
      }
    },
    "list_posts": {
      "id": "list_posts",
      "v": 1,
      "description": "List posts with filtering",
      "parameters": {
        "type": "object",
        "properties": {
          "limit": {
            "type": "number",
            "minimum": 1,
            "maximum": 100,
            "default": 10
          },
          "offset": {
            "type": "number",
            "minimum": 0,
            "default": 0
          },
          "tags": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "active": {
            "type": "boolean"
          }
        }
      },
      "action": {
        "type": "HTTP",
        "method": "GET",
        "urlTemplate": "/api/posts{?limit,offset,tags*}",
        "cors": true,
        "encoding": "query"
      }
    },
    "create_post": {
      "id": "create_post",
      "v": 1,
      "description": "Create a new blog post",
      "parameters": {
        "type": "object",
        "required": ["title", "content"],
        "properties": {
          "title": {
            "type": "string",
            "minLength": 1,
            "maxLength": 200
          },
          "content": {
            "type": "string",
            "minLength": 1
          }
        }
      },
      "action": {
        "type": "HTTP",
        "method": "POST",
        "urlTemplate": "/api/posts",
        "cors": true,
        "encoding": "json"
      }
    },
    "read_post": {
      "id": "read_post",
      "v": 1,
      "description": "Read a specific blog post",
      "parameters": {
        "type": "object",
        "required": ["id"],
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-zA-Z0-9-]+$"
          }
        }
      },
      "action": {
        "type": "HTTP",
        "method": "GET",
        "urlTemplate": "/api/posts/{id}",
        "cors": true,
        "encoding": "query"
      }
    },
    "update_post": {
      "id": "update_post",
      "v": 1,
      "description": "Update a blog post",
      "parameters": {
        "type": "object",
        "required": ["id"],
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-zA-Z0-9-]+$"
          },
          "title": {
            "type": "string",
            "maxLength": 200
          }
        }
      },
      "action": {
        "type": "HTTP",
        "method": "PUT",
        "urlTemplate": "/api/posts/{id}",
        "cors": true,
        "encoding": "json"
      }
    }
  }
};

// Helper to create mock NextApiRequest
function createMockRequest(options: {
  method?: string;
  query?: Record<string, any>;
  body?: any;
}): NextApiRequest {
  return {
    method: options.method || 'GET',
    query: options.query || {},
    body: options.body || {},
    url: '',
    headers: {},
    cookies: {}
  } as NextApiRequest;
}

describe('Validator Unit Tests', () => {
  beforeEach(() => {
    // Clear cache before each test to ensure isolation
    clearValidationCache();
    
    // Setup mocks
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify(mockManifest));
  });

  afterEach(() => {
    // Clear cache after each test to ensure isolation
    clearValidationCache();
    vi.clearAllMocks();
  });

  describe('validateRequest function', () => {
    it('should return isValid: true for capability with no parameters (get_profile)', () => {
      const req = createMockRequest({
        method: 'GET',
        query: {},
        body: {}
      });

      const result = validateRequest(req, 'get_profile');
      
      // Current implementation treats capabilities without parameters as valid
      // since no validation is needed when there are no parameters to validate
      expect(result).toEqual({ isValid: true });
    });

    it('should return standardized error for non-existent capabilityId', () => {
      const req = createMockRequest({
        method: 'GET',
        query: {},
        body: {}
      });

      const result = validateRequest(req, 'non_existent_capability');
      
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.error).toEqual({
          code: 'VALIDATION_ERROR',
          detail: 'No validation schema found for capability: non_existent_capability'
        });
      }
    });

    it('should return isValid: true for valid parameters', () => {
      const req = createMockRequest({
        method: 'GET',
        query: {
          limit: '10',
          offset: '0',
          tags: 'tech,news',
          active: 'true'
        }
      });

      const result = validateRequest(req, 'list_posts');
      
      expect(result).toEqual({ isValid: true });
    });

    it('should return validation error with detailed errors array when validation fails', () => {
      const req = createMockRequest({
        method: 'POST',
        body: {
          title: '', // Invalid: too short
          content: 'Valid content'
        }
      });

      const result = validateRequest(req, 'create_post');
      
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.detail).toBe('Validation failed for capability: create_post');
        expect(result.error.errors).toBeDefined();
        expect(Array.isArray(result.error.errors)).toBe(true);
        expect(result.error.errors!.length).toBeGreaterThan(0);
      }
    });

    it('should return validation error for missing required parameters', () => {
      const req = createMockRequest({
        method: 'POST',
        body: {
          content: 'Valid content'
          // Missing required 'title' parameter
        }
      });

      const result = validateRequest(req, 'create_post');
      
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.errors).toBeDefined();
        
        // Check that there is at least one error for the missing required field
        expect(result.error.errors!.length).toBeGreaterThan(0);
        
        // AJV formats required property errors with the message containing the field name
        const requiredError = result.error.errors!.find(e => 
          e.message.includes('title') && e.message.includes('required')
        );
        expect(requiredError).toBeDefined();
        expect(requiredError!.message).toBe("must have required property 'title'");
      }
    });

    it('should convert parameter types correctly for query parameters', () => {
      const req = createMockRequest({
        method: 'GET',
        query: {
          limit: '25',           // String number should be converted
          offset: '5',           // String number should be converted  
          tags: 'tech,news,ai',  // Comma-separated string should become array
          active: 'true'         // String boolean should be converted
        }
      });

      const result = validateRequest(req, 'list_posts');
      
      expect(result).toEqual({ isValid: true });
    });

    it('should handle invalid number strings by leaving them as strings for ajv to catch', () => {
      const req = createMockRequest({
        method: 'GET',
        query: {
          limit: '12a',  // Invalid number string
          offset: '0'
        }
      });

      const result = validateRequest(req, 'list_posts');
      
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.errors).toBeDefined();
      }
    });

    it('should handle non-string inputs by passing them through unchanged', () => {
      const req = createMockRequest({
        method: 'GET',
        query: {
          limit: 10,        // Already a number
          offset: 0,        // Already a number  
          active: true,     // Already a boolean
          tags: ['tech', 'news']  // Already an array
        }
      });

      const result = validateRequest(req, 'list_posts');
      
      expect(result).toEqual({ isValid: true });
    });
  });

  describe('Parameter extraction behavior', () => {
    it('should extract parameters from req.query for query encoding (GET request)', () => {
      const req = createMockRequest({
        method: 'GET',
        query: {
          id: '123',
          foo: 'bar'
        }
      });

      const result = validateRequest(req, 'list_posts');
      
      // This should work as the parameters come from query
      expect(result.isValid).toBe(true);
    });

    it('should extract parameters from req.body for json encoding (POST request)', () => {
      const req = createMockRequest({
        method: 'POST',
        body: {
          title: 'Test Post',
          content: 'This is test content'
        }
      });

      const result = validateRequest(req, 'create_post');
      
      expect(result).toEqual({ isValid: true });
    });

    it('should handle parameter overwrite behavior for PUT requests (body over query)', () => {
      const req = createMockRequest({
        method: 'PUT',
        query: {
          id: '123',
          title: 'old'  // This should be overwritten by body
        },
        body: {
          id: '123',    // Path parameter
          title: 'new'  // This should overwrite query parameter
        }
      });

      const result = validateRequest(req, 'update_post');
      
      // The validation should pass with the body value taking precedence
      expect(result).toEqual({ isValid: true });
    });
  });

  describe('Type conversion behavior', () => {
    it('should convert string numbers to actual numbers', () => {
      const req = createMockRequest({
        method: 'GET',
        query: {
          limit: '25',
          offset: '10'
        }
      });

      const result = validateRequest(req, 'list_posts');
      
      expect(result).toEqual({ isValid: true });
    });

    it('should convert string booleans to actual booleans', () => {
      const req = createMockRequest({
        method: 'GET',
        query: {
          active: 'true',
          limit: '10'
        }
      });

      const result = validateRequest(req, 'list_posts');
      
      expect(result).toEqual({ isValid: true });
    });

    it('should convert comma-separated strings to arrays', () => {
      const req = createMockRequest({
        method: 'GET',
        query: {
          tags: 'tech,news,science',
          limit: '10'
        }
      });

      const result = validateRequest(req, 'list_posts');
      
      expect(result).toEqual({ isValid: true });
    });

    it('should handle false boolean conversion correctly', () => {
      const req = createMockRequest({
        method: 'GET',
        query: {
          active: 'false',
          limit: '10'
        }
      });

      const result = validateRequest(req, 'list_posts');
      
      expect(result).toEqual({ isValid: true });
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle manifest loading errors gracefully', () => {
      // Mock a file system error
      mockFs.existsSync.mockReturnValue(false);
      
      const req = createMockRequest({
        method: 'GET'
      });

      const result = validateRequest(req, 'any_capability');
      
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.detail).toContain('Internal validation error');
      }
    });

    it('should handle schema compilation errors gracefully', () => {
      // Mock manifest with invalid schema
      const invalidManifest = {
        ...mockManifest,
        capabilities: {
          invalid_capability: {
            id: 'invalid_capability',
            parameters: {
              type: 'invalid_type'  // This should cause compilation error
            }
          }
        }
      };
      
      mockFs.readFileSync.mockReturnValue(JSON.stringify(invalidManifest));
      
      const req = createMockRequest({
        method: 'GET'
      });

      const result = validateRequest(req, 'invalid_capability');
      
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should handle null and undefined parameters gracefully', () => {
      const req = createMockRequest({
        method: 'GET',
        query: {
          limit: null,
          offset: undefined,
          tags: 'tech,news'
        }
      });

      // Should not throw an error
      const result = validateRequest(req, 'list_posts');
      
      expect(result.isValid).toBeDefined();
    });
  });

  describe('Cache management', () => {
    it('should clear validation cache properly', () => {
      // First call should load and cache
      const req1 = createMockRequest({
        method: 'GET'
      });
      
      validateRequest(req1, 'get_profile');
      
      // Clear cache
      clearValidationCache();
      
      // Second call should reload (we can verify by checking if readFileSync is called again)
      const req2 = createMockRequest({
        method: 'GET'
      });
      
      validateRequest(req2, 'get_profile');
      
      // readFileSync should have been called at least twice (once for each validateRequest call after cache clear)
      expect(mockFs.readFileSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('Parameter extraction logic', () => {
    it('should extract parameters from query for GET request to /posts/123?foo=bar', () => {
      const req = createMockRequest({
        method: 'GET',
        query: { id: '123', foo: 'bar' },
        body: {}
      });

      const result = validateRequest(req, 'read_post');
      
      // Should be valid since read_post requires id parameter and we provided it
      expect(result.isValid).toBe(true);
    });

    it('should merge query and body parameters for PUT request to /posts/123', () => {
      const req = createMockRequest({
        method: 'PUT',
        query: { id: '123' },
        body: { title: 'New Title' }
      });

      const result = validateRequest(req, 'update_post');
      
      // Should be valid since update_post requires id (from query) and we're providing title (from body)
      expect(result.isValid).toBe(true);
    });

    it('should allow body parameters to overwrite query parameters for PUT requests', () => {
      const req = createMockRequest({
        method: 'PUT',
        query: { id: '123', title: 'old' },
        body: { title: 'new' }
      });

      const result = validateRequest(req, 'update_post');
      
      // Should be valid - body parameter 'title: new' should overwrite query parameter 'title: old'
      // The id '123' should still be available from query
      expect(result.isValid).toBe(true);
    });

    it('should ignore body for GET requests regardless of encoding hint', () => {
      const req = createMockRequest({
        method: 'GET',
        query: { id: '123' },
        body: { title: 'should be ignored' }
      });

      const result = validateRequest(req, 'read_post');
      
      // Should be valid - GET request should only use query parameters, body should be ignored
      expect(result.isValid).toBe(true);
    });

    it('should work with POST requests that merge query and body', () => {
      const req = createMockRequest({
        method: 'POST',
        query: { limit: '5' },
        body: { title: 'New Post', content: 'Post content' }
      });

      const result = validateRequest(req, 'create_post');
      
      // Should be valid - create_post needs title and content (from body), limit from query is optional
      expect(result.isValid).toBe(true);
    });
  });
}); 