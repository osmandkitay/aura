# AURA Manifest Validation Guide

This guide explains how to validate AURA manifests to ensure they comply with the protocol specification and work correctly with AI agents.

## 🎯 Overview

AURA manifest validation ensures your `aura.json` file:
- Follows the AURA v1.0 specification
- Has valid structure with all required fields
- Works with AI agents effectively
- Adheres to RFC 6570 (URI Templates) and RFC 6901 (JSON Pointer)

## 🛠️ Validation Tools

### CLI Validation Tool

```bash
# Install AURA protocol package
npm install -g @aura/protocol

# Validate local manifest
aura-validate .well-known/aura.json

# Validate remote manifest
aura-validate --url https://example.com/.well-known/aura.json

# Detailed validation
aura-validate --verbose .well-known/aura.json

# Machine-readable output
aura-validate --json .well-known/aura.json
```

### Programmatic Validation

```typescript
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { AuraManifest } from '@aura/protocol';
import * as fs from 'fs';
import * as path from 'path';

// Load AURA JSON Schema
const schemaPath = path.join(__dirname, 'node_modules/@aura/protocol/dist/aura-v1.0.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

// Create validator
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

// Validate manifest
function validateManifest(manifest: any): { valid: boolean; errors: any[] } {
  const valid = validate(manifest);
  return {
    valid,
    errors: validate.errors || []
  };
}

// Example usage
const manifest = {
  $schema: 'https://aura.dev/schemas/v1.0.json',
  protocol: 'AURA',
  version: '1.0',
  site: {
    name: 'My AURA Site',
    url: 'https://example.com'
  },
  resources: {},
  capabilities: {}
};

const result = validateManifest(manifest);
if (!result.valid) {
  console.error('Validation errors:', result.errors);
}
```

## 📋 Validation Checklist

### Core Manifest Structure

**Required Fields:**
- [ ] `$schema`: Schema URL (`https://aura.dev/schemas/v1.0.json`)
- [ ] `protocol`: Must be `"AURA"`
- [ ] `version`: Must be `"1.0"`
- [ ] `site`: Site information object
- [ ] `resources`: Resources dictionary (can be empty)
- [ ] `capabilities`: Capabilities dictionary (can be empty)

**Site Object:**
- [ ] `name`: Site name (string)
- [ ] `url`: Canonical site URL (valid URI)
- [ ] `description`: Optional site description (string)

### Resource Validation

Each resource must have:
- [ ] `uriPattern`: Valid RFC 6570 URI Template
- [ ] `description`: Descriptive and clear
- [ ] `operations`: Maps HTTP methods to valid capability IDs
- [ ] All referenced `capabilityId`s exist in capabilities section

### Capability Validation

Each capability must have:
- [ ] `id`: Unique identifier
- [ ] `v`: Positive integer version number
- [ ] `description`: Explains what the capability does
- [ ] `action`: Valid HttpAction
- [ ] `parameters`: Valid JSON Schema (if present)

### HTTP Action Validation

- [ ] `type`: Exactly `"HTTP"`
- [ ] `method`: Valid HTTP method (GET, POST, PUT, DELETE)
- [ ] `urlTemplate`: Valid RFC 6570 URI Template
- [ ] `parameterMapping`: Uses valid JSON Pointer syntax
- [ ] Parameter mappings reference fields in `parameters` schema
- [ ] URI template variables match parameter mapping keys

## 🔍 Common Validation Errors

### 1. Missing Required Fields

```json
{
  "error": "Missing required property: version",
  "path": "/"
}
```

**Solution:**
```json
{
  "$schema": "https://aura.dev/schemas/v1.0.json",
  "protocol": "AURA",
  "version": "1.0"
}
```

### 2. Invalid URI Templates

```json
{
  "error": "Invalid URI template: /api/posts/{id",
  "path": "/capabilities/read_post/action/urlTemplate"
}
```

**Solution:**
```json
{
  "urlTemplate": "/api/posts/{id}" // Fixed: added closing brace
}
```

### 3. Invalid JSON Pointer

```json
{
  "error": "Invalid JSON Pointer: #/id",
  "path": "/capabilities/read_post/action/parameterMapping/id"
}
```

**Solution:**
```json
{
  "parameterMapping": {
    "id": "/id" // Fixed: starts with /
  }
}
```

### 4. Undefined Capability References

```json
{
  "error": "Undefined capability reference: create_post",
  "path": "/resources/posts/operations/POST/capabilityId"
}
```

**Solution:**
Add the missing capability:
```json
{
  "capabilities": {
    "create_post": {
      "id": "create_post",
      "v": 1,
      "description": "Create a new post"
    }
  }
}
```

### 5. Mismatched Parameter Mappings

```json
{
  "error": "Parameter mapping 'title' not found in parameters schema"
}
```

**Solution:**
Ensure mappings match schema:
```json
{
  "parameters": {
    "type": "object",
    "properties": {
      "title": { "type": "string" }
    }
  },
  "action": {
    "parameterMapping": {
      "title": "/title"
    }
  }
}
```

## 🧪 Testing Validation

### Automated Testing

```typescript
import { describe, it, expect } from 'vitest';
import { validateManifest } from '../src/validation';

describe('Manifest Validation', () => {
  it('should validate complete manifest', () => {
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
          description: 'Read a blog post',
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

    const result = validateManifest(manifest);
    expect(result.valid).toBe(true);
  });

  it('should reject invalid manifests', () => {
    const invalidManifest = {
      protocol: 'AURA'
      // Missing required fields
    };

    const result = validateManifest(invalidManifest);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
```

### CI/CD Integration

```yaml
# .github/workflows/validate-manifest.yml
name: Validate AURA Manifest
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm install -g @aura/protocol
        
      - name: Validate manifest
        run: |
          aura-validate public/.well-known/aura.json
          aura-validate --verbose public/.well-known/aura.json
```

## 🔧 Advanced Validation

### URI Template Validation

```typescript
import { parseTemplate } from 'url-template';

function validateUriTemplate(template: string): { valid: boolean; error?: string } {
  try {
    const parsed = parseTemplate(template);
    
    // Test expansion with sample data
    const expanded = parsed.expand({
      id: 'test',
      limit: 10,
      tags: ['tag1', 'tag2']
    });
    
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid URI template: ${error.message}`
    };
  }
}
```

### JSON Pointer Validation

```typescript
function validateJsonPointer(pointer: string): { valid: boolean; error?: string } {
  if (!pointer.startsWith('/')) {
    return {
      valid: false,
      error: 'JSON Pointer must start with /'
    };
  }
  
  const segments = pointer.split('/').slice(1);
  
  for (const segment of segments) {
    if (segment.includes('~') && !segment.match(/~[01]/)) {
      return {
        valid: false,
        error: 'Invalid escape sequence in JSON Pointer'
      };
    }
  }
  
  return { valid: true };
}
```

### Custom Validation Rules

```typescript
interface ValidationRule {
  name: string;
  check: (manifest: AuraManifest) => ValidationError[];
}

const customRules: ValidationRule[] = [
  {
    name: 'capability-naming',
    check: (manifest) => {
      const errors: ValidationError[] = [];
      
      Object.keys(manifest.capabilities).forEach(capId => {
        if (!capId.match(/^[a-z][a-z0-9_]*$/)) {
          errors.push({
            rule: 'capability-naming',
            path: `/capabilities/${capId}`,
            message: 'Capability IDs should use snake_case',
            severity: 'warning'
          });
        }
      });
      
      return errors;
    }
  }
];
```

## 📊 Best Practices

### 1. Validate Early and Often
- Development: Validate on every save
- Testing: Include validation in test suite
- CI/CD: Validate before deployment
- Production: Monitor manifest accessibility

### 2. Clear Error Handling
```typescript
function formatValidationError(error: any): string {
  const location = error.instancePath || 'root';
  const field = error.schemaPath?.split('/').pop() || 'unknown';
  
  return `${location}: ${error.message} (${field})`;
}
```

### 3. Version Compatibility
```typescript
function checkVersionCompatibility(manifest: AuraManifest): boolean {
  const supportedVersions = ['1.0'];
  return supportedVersions.includes(manifest.version);
}
```

---

Proper manifest validation ensures your AURA implementation works reliably with AI agents and follows protocol standards. Use these tools and techniques to catch errors early and maintain quality across deployments. 