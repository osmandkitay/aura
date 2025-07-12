// packages/aura-protocol/src/schema-sync.test.ts

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Load the generated JSON schema, which is the artifact we are testing.
const schemaPath = path.join(__dirname, '../dist/aura-v1.0.schema.json');
if (!fs.existsSync(schemaPath)) {
  throw new Error(`Schema file not found at ${schemaPath}. Run 'npm run build' in the protocol package first.`);
}
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

/**
 * Helper function to compare required properties cleanly.
 * @param definition The schema definition to check.
 * @param expected The expected array of required properties.
 */
function assertRequiredProperties(definition: any, expected: string[]) {
  // Sort both arrays to ensure comparison is not order-dependent.
  const actualRequired = (definition?.required || []).sort();
  const expectedRequired = [...expected].sort();
  expect(actualRequired).toEqual(expectedRequired);
}

describe('JSON Schema and TypeScript Interface Synchronization', () => {

  it('should have correct required fields for AuraManifest', () => {
    const expected = ['protocol', 'version', 'site', 'resources', 'capabilities', '$schema'];
    assertRequiredProperties(schema, expected);
  });

  it('should have correct required fields for Resource', () => {
    const expected = ['uriPattern', 'description', 'operations'];
    const definition = schema.definitions?.Resource;
    expect(definition).toBeDefined();
    assertRequiredProperties(definition, expected);
  });

  it('should have correct required fields for Capability', () => {
    const expected = ['id', 'v', 'description', 'action'];
    const definition = schema.definitions?.Capability;
    expect(definition).toBeDefined();
    assertRequiredProperties(definition, expected);
  });

  it('should have correct required fields for HttpAction', () => {
    const expected = ['type', 'method', 'urlTemplate', 'parameterMapping'];
    const definition = schema.definitions?.HttpAction;
    expect(definition).toBeDefined();
    assertRequiredProperties(definition, expected);
  });

  it('should have correct required fields for Policy', () => {
    const definition = schema.definitions?.Policy;
    // Policy itself is optional, but if present, it has no required fields at its top level.
    const expected: string[] = [];
    expect(definition).toBeDefined();
    assertRequiredProperties(definition, expected);
  });

}); 