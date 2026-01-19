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

// Refine the schema to enforce the structure of records
const resourceSchemaName = 'Resource';
const capabilitySchemaName = 'Capability';

if (schema.definitions) {
  // Get the Resource and Capability schemas to include them in the main schema
  const resourceSchema = generator.getSchemaForSymbol('Resource');
  const capabilitySchema = generator.getSchemaForSymbol('Capability');

  // Add Resource and Capability definitions to the main schema if they don't exist
  if (resourceSchema && !schema.definitions[resourceSchemaName]) {
    schema.definitions[resourceSchemaName] = resourceSchema;
  }

  if (capabilitySchema && !schema.definitions[capabilitySchemaName]) {
    schema.definitions[capabilitySchemaName] = capabilitySchema;
  }

  // Find the generated name for Record<string, Resource> and refine it
  const resourceRecordKey = Object.keys(schema.definitions).find(k => k.includes('Record<string,Resource>'));
  if (resourceRecordKey && schema.definitions[resourceSchemaName]) {
    console.log(`Refining schema for ${resourceRecordKey}...`);
    schema.definitions[resourceRecordKey] = {
      title: resourceRecordKey,
      type: 'object',
      additionalProperties: {
        $ref: `#/definitions/${resourceSchemaName}`
      }
    };
  }

  // Find the generated name for Record<string, Capability> and refine it
  const capabilityRecordKey = Object.keys(schema.definitions).find(k => k.includes('Record<string,Capability>'));
  if (capabilityRecordKey && schema.definitions[capabilitySchemaName]) {
    console.log(`Refining schema for ${capabilityRecordKey}...`);
    schema.definitions[capabilityRecordKey] = {
      title: capabilityRecordKey,
      type: 'object',
      additionalProperties: {
        $ref: `#/definitions/${capabilitySchemaName}`
      }
    };
  }

  // Fix JSONSchema reference issue by moving it to top level
  const capabilityDef = schema.definitions[capabilitySchemaName];
  if (capabilityDef && typeof capabilityDef === 'object' && 'definitions' in capabilityDef && capabilityDef.definitions) {
    console.log('Moving JSONSchema definition to top level...');
    const nestedDefs = capabilityDef.definitions as any;

    if (nestedDefs['JSONSchema']) {
      schema.definitions['JSONSchema'] = nestedDefs['JSONSchema'];
    }
    if (nestedDefs['Record<string,JSONSchema>']) {
      schema.definitions['Record<string,JSONSchema>'] = nestedDefs['Record<string,JSONSchema>'];
    }
    if (nestedDefs['HttpAction']) {
      schema.definitions['HttpAction'] = nestedDefs['HttpAction'];
    }
    if (nestedDefs['Record<string,string>']) {
      schema.definitions['Record<string,string>'] = nestedDefs['Record<string,string>'];
    }
    if (nestedDefs['ParameterLocation']) {
      schema.definitions['ParameterLocation'] = nestedDefs['ParameterLocation'];
    }

    const paramLocRecordKey = Object.keys(nestedDefs).find(k => k.includes('Record<string,ParameterLocation>'));
    if (paramLocRecordKey) {
      schema.definitions[paramLocRecordKey] = nestedDefs[paramLocRecordKey];
    }

    // Remove the nested definitions to avoid duplication
    delete capabilityDef.definitions;
  }
}

// Remove non-standard keywords to ensure schema portability
function purgeDefaultProps(obj: any) {
  if (typeof obj !== 'object' || obj === null) return;

  delete obj.defaultProperties;

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      purgeDefaultProps(obj[key]);
    }
  }
}

purgeDefaultProps(schema);

const outputPath = path.join(outputDir, 'aura-v1.0.schema.json');
fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2));

console.log(`Schema generated successfully at: ${outputPath}`);

// Also generate schemas for other important types
const additionalTypes = ['Capability', 'Resource', 'HttpAction', 'AuraState'];

additionalTypes.forEach(typeName => {
  const typeSchema = generator.getSchemaForSymbol(typeName);
  if (typeSchema) {
    // Clean up non-standard properties for additional schemas too
    purgeDefaultProps(typeSchema);

    const typeOutputPath = path.join(outputDir, `${typeName.toLowerCase()}.schema.json`);
    fs.writeFileSync(typeOutputPath, JSON.stringify(typeSchema, null, 2));
    console.log(`Schema for ${typeName} generated at: ${typeOutputPath}`);
  }
}); 