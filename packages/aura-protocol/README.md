# @aura/protocol

The core TypeScript definitions and JSON Schema for the AURA protocol.

## Installation

```bash
npm install @aura/protocol
```

## Usage

```typescript
import { AuraManifest, AuraCapability, AuraState } from '@aura/protocol';

// Use the TypeScript interfaces for type safety
const manifest: AuraManifest = {
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

## Development

```bash
# Build the package
pnpm build

# Run tests
pnpm test

# Generate JSON Schema
pnpm run generate-schema
```

## License

MIT 