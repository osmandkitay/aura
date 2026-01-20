# aura-protocol

The core TypeScript definitions and JSON Schema for the AURA protocol.

## Installation

```bash
npm install aura-protocol
```

## Usage

```typescript
import { AuraManifest, AuraCapability, AuraState } from 'aura-protocol';

// Use the TypeScript interfaces for type safety
const manifest: AuraManifest = {
  $schema: 'https://unpkg.com/aura-protocol@1.0.5/dist/aura-v1.0.schema.json',
  protocol: 'AURA',
  version: '1.0',
  site: {
    name: 'My AURA Site',
    url: 'https://example.com'
  },
  resources: {},
  capabilities: {}
};
```

## JSON Schema Validation

This package includes a generated JSON Schema for validating AURA manifests:

```typescript
import Ajv from 'ajv';
import * as fs from 'fs';
import * as path from 'path';

// Load the schema
const schemaPath = path.join(__dirname, '../dist/aura-v1.0.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

// Validate a manifest
const ajv = new Ajv();
const validate = ajv.compile(schema);
const isValid = validate(manifest);
```

## Protocol Standards Compliance

### RFC 6570 URI Templates

AURA implementations **MUST** support **Level 3** URI Templates as defined by [RFC 6570](https://tools.ietf.org/html/rfc6570). This includes:

- **Level 1**: Simple string expansion (`{var}`)
- **Level 2**: Reserved string expansion (`{+var}`) and fragment expansion (`{#var}`)
- **Level 3**: Multiple variable expansion (`{var,hello}`, `{+x,hello,y}`) and query expansion (`{?x,y}`, `{&x,y}`)

**Examples of supported URI templates:**
```
/api/posts/{id}                    # Simple path parameter
/api/posts{?limit,offset}          # Query parameters
/api/search{?q,tags*}              # Exploded array parameters
/api/posts/{id}{?include}          # Mixed path and query
{+base}/posts/{id}                 # Reserved expansion
/api/posts/{id}{#section}          # Fragment expansion
```

Level 4 features (prefix modifiers like `{var:3}`) are **OPTIONAL** but **RECOMMENDED** for advanced implementations.

### JSON Pointer (RFC 6901)

AURA implementations **MUST** support [RFC 6901 JSON Pointer](https://tools.ietf.org/html/rfc6901) syntax for parameter mapping, including:

- Simple property access: `"/email"` → `args.email`
- Nested object access: `"/user/profile/name"` → `args.user.profile.name`
- Array element access: `"/items/0/title"` → `args.items[0].title`
- Escaped characters: `"/path~1to~0property"` → `args["path/to~property"]`

**Examples of supported JSON Pointer mappings:**
```json
{
  "parameterMapping": {
    "email": "/email",
    "userName": "/user/name", 
    "firstTag": "/tags/0",
    "settingsTheme": "/settings/theme/mode"
  }
}
```

### Compliance Requirements

**For AURA Servers:**
- **MUST** provide valid URI templates in capability `urlTemplate` fields
- **MUST** use JSON Pointer syntax in `parameterMapping` fields
- **SHOULD** test templates with various parameter combinations

**For AURA Clients:**
- **MUST** implement RFC 6570 Level 3 URI template expansion
- **MUST** implement RFC 6901 JSON Pointer resolution
- **MUST** handle expansion errors gracefully with fallback behavior

**Reference Implementation:**
The AURA reference client demonstrates full compliance using the `url-template` library for RFC 6570 support and a custom JSON Pointer resolver for RFC 6901 compliance.

## JSON Schema Generation

AURA Protocol uses automated JSON Schema generation to ensure consistency between TypeScript interfaces and validation schemas.

### How Schema Generation Works

The schema generation process uses the `typescript-json-schema` library to automatically generate JSON Schema from TypeScript interfaces:

1. **Source Analysis**: The generator analyzes `src/index.ts` and extracts TypeScript interface definitions
2. **Schema Creation**: Creates JSON Schema definitions for `AuraManifest` and related types
3. **Schema Enhancement**: Adds metadata, format definitions, and refinements
4. **Multi-Schema Output**: Generates both the main schema and individual type schemas

### Generated Schema Files

After running `pnpm run generate-schema`, the following files are created in `dist/`:

- **`aura-v1.0.schema.json`**: Main AURA manifest schema
- **`capability.schema.json`**: Schema for individual capabilities
- **`resource.schema.json`**: Schema for resource definitions
- **`httpaction.schema.json`**: Schema for HTTP action definitions
- **`aurastate.schema.json`**: Schema for AURA state headers

### Schema Features

**Metadata Integration:**
- `$schema`: JSON Schema draft-07 compliance
- `$id`: Canonical schema URL (`https://aura.dev/schemas/v1.0.json`)
- **Title & Description**: Human-readable schema information

**Format Definitions:**
- **Email**: Email address validation
- **ISO Date**: Date-time format validation
- **URI**: URI format validation

**Type Safety:**
- **Record Types**: Proper handling of `Record<string, Resource>` and `Record<string, Capability>`
- **Nested Definitions**: Complex type relationships maintained
- **Required Fields**: Automatic detection from TypeScript interfaces

### Manual Schema Generation

```bash
# Generate all schemas
pnpm run generate-schema

# Build package (includes schema generation)
pnpm build
```

### Schema Validation in Code

Use the generated schemas for runtime validation:

```typescript
import Ajv from 'ajv';
import * as fs from 'fs';
import * as path from 'path';
import { AuraManifest } from 'aura-protocol';

// Load and compile schema
const schemaPath = path.join(__dirname, '../dist/aura-v1.0.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

// Validate manifest
const manifest: AuraManifest = {
  $schema: 'https://unpkg.com/aura-protocol@1.0.5/dist/aura-v1.0.schema.json',
  protocol: 'AURA',
  version: '1.0',
  site: { name: 'Example', url: 'https://example.com' },
  resources: {},
  capabilities: {}
};

const isValid = validate(manifest);
if (!isValid) {
  console.error('Validation errors:', validate.errors);
}
```

### CLI Validation Tool

The package includes a CLI tool for validating AURA manifests:

```bash
# Validate local manifest
npx -y -p aura-protocol aura-validate .well-known/aura.json

# Note: Remote URL validation (--url) is currently disabled.
# Download the manifest first, then validate locally:
curl -fsSL https://example.com/.well-known/aura.json -o aura.json
npx -y -p aura-protocol aura-validate aura.json

# Detailed validation output
npx -y -p aura-protocol aura-validate --verbose .well-known/aura.json

# Machine-readable JSON output
npx -y -p aura-protocol aura-validate --json .well-known/aura.json

# Use custom schema
npx -y -p aura-protocol aura-validate --schema custom-schema.json manifest.json
```

### Schema Customization

For custom validation needs, you can extend the base schema:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "allOf": [
    { "$ref": "https://aura.dev/schemas/v1.0.json" },
    {
      "properties": {
        "customField": {
          "type": "string",
          "description": "Custom extension field"
        }
      }
    }
  ]
}
```

## Development

```bash
# Build the package (includes schema generation)
pnpm build

# Run tests
pnpm test

# Generate JSON Schema only
pnpm run generate-schema

# Validate generated schemas
pnpm test -- --grep "schema"
```

## License

MIT 
