import * as TJS from 'typescript-json-schema';
import * as fs from 'fs';
import * as path from 'path';

// Options for the schema generator
const options: TJS.PartialArgs = {
  required: true,
  strictNullChecks: true,
  esModuleInterop: true,
  skipLibCheck: true,
  noExtraProps: false,
  defaultProps: true,
  titles: true,
  defaultNumberType: 'number',
  tsNodeRegister: true,
};

// Generate schema
const program = TJS.programFromConfig(
  path.join(__dirname, '../tsconfig.json'),
  [path.join(__dirname, '../src/index.ts')]
);

const generator = TJS.buildGenerator(program, options);

if (!generator) {
  console.error('Failed to create schema generator');
  process.exit(1);
}

// Generate schema for AuraManifest
const schema = generator.getSchemaForSymbol('AuraManifest');

if (!schema) {
  console.error('Failed to generate schema for AuraManifest');
  process.exit(1);
}

// Add additional schema metadata
schema.$schema = 'http://json-schema.org/draft-07/schema#';
schema.$id = 'https://aura.dev/schemas/v1.0.json';
schema.title = 'AURA Manifest v1.0';
schema.description = 'Schema for AURA (Agent-Usable Resource Assertion) manifest files';

// Add common format definitions
if (!schema.$defs) {
  schema.$defs = {};
}

schema.$defs.Email = {
  type: 'string',
  format: 'email',
  description: 'Email address format'
};

schema.$defs.ISODate = {
  type: 'string',
  format: 'date-time',
  description: 'ISO 8601 date-time format'
};

schema.$defs.URI = {
  type: 'string',
  format: 'uri',
  description: 'URI format'
};

// Write schema to file
const outputDir = path.join(__dirname, '../dist');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const outputPath = path.join(outputDir, 'aura-v1.0.schema.json');
fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2));

console.log(`Schema generated successfully at: ${outputPath}`);

// Also generate schemas for other important types
const additionalTypes = ['Capability', 'Resource', 'HttpAction', 'AuraState'];

additionalTypes.forEach(typeName => {
  const typeSchema = generator.getSchemaForSymbol(typeName);
  if (typeSchema) {
    const typeOutputPath = path.join(outputDir, `${typeName.toLowerCase()}.schema.json`);
    fs.writeFileSync(typeOutputPath, JSON.stringify(typeSchema, null, 2));
    console.log(`Schema for ${typeName} generated at: ${typeOutputPath}`);
  }
}); 