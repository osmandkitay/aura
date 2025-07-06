import { describe, it, expect, beforeAll } from 'vitest';
import { AuraManifest } from './index.js';
import * as Ajv from 'ajv';
import * as fs from 'fs';
import * as path from 'path';

describe('AURA Protocol JSON Schema Validation', () => {
  let ajv: Ajv.default;
  let schema: any;

  beforeAll(() => {
    // Load the generated JSON schema
    const schemaPath = path.join(__dirname, '../dist/aura-v1.0.schema.json');
    
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at ${schemaPath}. Run 'npm run build' first.`);
    }
    
    schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
    ajv = new Ajv.default({ allErrors: true, strict: false });
  });

  it('should validate a complete valid manifest using JSON schema', () => {
    const manifest = {
      $schema: 'https://aura.dev/schemas/v1.0.json',
      protocol: 'AURA',
      version: '1.0',
      site: {
        name: 'Test Site',
        description: 'A test site',
        url: 'https://example.com'
      },
      resources: {
        posts: {
          uriPattern: '/api/posts/{id}',
          description: 'Blog posts',
          operations: {
            GET: { capabilityId: 'read_post' }
          }
        }
      },
      capabilities: {
        read_post: {
          id: 'read_post',
          v: 1,
          description: 'Read a post',
          parameters: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string' }
            }
          },
          action: {
            type: 'HTTP',
            method: 'GET',
            urlTemplate: '/api/posts/{id}',
            parameterMapping: {
              id: '/id'
            }
          }
        }
      }
    };

    const validate = ajv.compile(schema);
    const valid = validate(manifest);

    expect(valid).toBe(true);
    expect(validate.errors).toBeNull();
  });

  it('should validate a minimal manifest using JSON schema', () => {
    const minimalManifest = {
      $schema: 'https://aura.dev/schemas/v1.0.json',
      protocol: 'AURA',
      version: '1.0',
      site: {
        name: 'Minimal Site',
        url: 'https://minimal.com'
      },
      resources: {},
      capabilities: {}
    };

    const validate = ajv.compile(schema);
    const valid = validate(minimalManifest);

    expect(valid).toBe(true);
    expect(validate.errors).toBeNull();
  });

  it('should reject invalid manifests missing required fields', () => {
    const invalidManifest = {
      $schema: 'https://aura.dev/schemas/v1.0.json',
      protocol: 'AURA',
      // Missing version field
      site: {
        name: 'Test Site',
        url: 'https://example.com'
      },
      resources: {},
      capabilities: {}
    };

    const validate = ajv.compile(schema);
    const valid = validate(invalidManifest);

    expect(valid).toBe(false);
    expect(validate.errors).not.toBeNull();
    expect(validate.errors).toHaveLength(1);
    expect(validate.errors![0].instancePath).toBe('');
    expect(validate.errors![0].message).toContain('version');
  });

  it('should reject manifests with invalid protocol value', () => {
    const invalidManifest = {
      $schema: 'https://aura.dev/schemas/v1.0.json',
      protocol: 'INVALID_PROTOCOL',
      version: '1.0',
      site: {
        name: 'Test Site',
        url: 'https://example.com'
      },
      resources: {},
      capabilities: {}
    };

    const validate = ajv.compile(schema);
    const valid = validate(invalidManifest);

    expect(valid).toBe(false);
    expect(validate.errors).not.toBeNull();
    expect(validate.errors!.length).toBeGreaterThan(0);
    
    // Should have an error about protocol value
    const protocolError = validate.errors!.find(error => 
      error.instancePath === '/protocol' || 
      (error.instancePath === '' && error.message?.includes('protocol'))
    );
    expect(protocolError).toBeDefined();
  });

  it('should reject manifests with invalid site structure', () => {
    const invalidManifest = {
      $schema: 'https://aura.dev/schemas/v1.0.json',
      protocol: 'AURA',
      version: '1.0',
      site: {
        // Missing required name field
        url: 'https://example.com'
      },
      resources: {},
      capabilities: {}
    };

    const validate = ajv.compile(schema);
    const valid = validate(invalidManifest);

    expect(valid).toBe(false);
    expect(validate.errors).not.toBeNull();
    expect(validate.errors!.length).toBeGreaterThan(0);
    
    // Should have an error about missing name field
    const nameError = validate.errors!.find(error => 
      error.instancePath === '/site' && error.message?.includes('name')
    );
    expect(nameError).toBeDefined();
  });

  it('should validate manifests with capability structure (current schema is permissive)', () => {
    const manifest = {
      $schema: 'https://aura.dev/schemas/v1.0.json',
      protocol: 'AURA',
      version: '1.0',
      site: {
        name: 'Test Site',
        url: 'https://example.com'
      },
      resources: {},
      capabilities: {
        some_capability: {
          // The main schema doesn't enforce capability structure details
          v: 1,
          description: 'Test capability',
          parameters: {
            type: 'object',
            properties: {}
          },
          action: {
            type: 'HTTP',
            method: 'GET',
            urlTemplate: '/api/test'
          }
        }
      }
    };

    const validate = ajv.compile(schema);
    const valid = validate(manifest);

    // The main schema is currently permissive for capabilities
    expect(valid).toBe(true);
  });

  it('should validate capabilities with proper parameter mapping', () => {
    const manifest = {
      $schema: 'https://aura.dev/schemas/v1.0.json',
      protocol: 'AURA',
      version: '1.0',
      site: {
        name: 'Test Site',
        url: 'https://example.com'
      },
      resources: {
        users: {
          uriPattern: '/api/users/{id}',
          description: 'User management',
          operations: {
            GET: { capabilityId: 'get_user' },
            POST: { capabilityId: 'create_user' }
          }
        }
      },
      capabilities: {
        get_user: {
          id: 'get_user',
          v: 1,
          description: 'Get user by ID',
          parameters: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string' }
            }
          },
          action: {
            type: 'HTTP',
            method: 'GET',
            urlTemplate: '/api/users/{id}',
            parameterMapping: {
              id: '/id'
            }
          }
        },
        create_user: {
          id: 'create_user',
          v: 1,
          description: 'Create a new user',
          parameters: {
            type: 'object',
            required: ['name', 'email'],
            properties: {
              name: { type: 'string' },
              email: { type: 'string', format: 'email' }
            }
          },
          action: {
            type: 'HTTP',
            method: 'POST',
            urlTemplate: '/api/users',
            parameterMapping: {
              name: '/name',
              email: '/email'
            }
          }
        }
      }
    };

    const validate = ajv.compile(schema);
    const valid = validate(manifest);

    expect(valid).toBe(true);
    expect(validate.errors).toBeNull();
  });

  it('should validate manifests with resources (current schema is permissive for detailed structure)', () => {
    const manifest = {
      $schema: 'https://aura.dev/schemas/v1.0.json',
      protocol: 'AURA',
      version: '1.0',
      site: {
        name: 'Test Site',
        url: 'https://example.com'
      },
      resources: {
        posts: {
          // The main schema doesn't enforce resource structure details
          description: 'Blog posts',
          operations: {
            GET: { capabilityId: 'some_capability' }
          }
        }
      },
      capabilities: {
        test_capability: {
          id: 'test_capability',
          v: 1,
          description: 'Test capability',
          parameters: {
            type: 'object',
            properties: {}
          },
          action: {
            type: 'HTTP',
            method: 'GET',
            urlTemplate: '/api/test'
          }
        }
      }
    };

    const validate = ajv.compile(schema);
    const valid = validate(manifest);

    // The main schema is currently permissive for resources and capabilities
    expect(valid).toBe(true);
  });
}); 