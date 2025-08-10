#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { defineCommand, runMain } from 'citty';
import * as Ajv from 'ajv';
import { red, green, blue, cyan, yellow, gray } from 'kleur';
// import axios from 'axios';

interface ValidationResult {
  valid: boolean;
  errors?: any[] | null;
  manifest?: any;
  source?: string;
  warnings?: string[];
}

const main = defineCommand({
  meta: {
    name: 'aura-validate',
    description: 'Validate AURA manifest files against the official schema',
    version: '1.0.0',
  },
  args: {
    file: {
      type: 'positional',
      description: 'Path to the manifest file (default: .well-known/aura.json)',
      required: false,
    },
    url: {
      type: 'string',
      description: 'Validate manifest from URL',
      alias: 'u',
    },
    schema: {
      type: 'string',
      description: 'Path to custom schema file',
      alias: 's',
    },
    verbose: {
      type: 'boolean',
      description: 'Show detailed validation output',
      alias: 'v',
    },
    json: {
      type: 'boolean',
      description: 'Output machine-readable JSON',
      alias: 'j',
    },
  },
  async run({ args }) {
    const result: ValidationResult = {
      valid: false,
      warnings: [],
    };

    try {
      // Determine manifest source
      let manifestData: any;
      let manifestSource: string;

      if (args.url) {
        // Fetch from URL - temporarily disabled
        const error = 'URL validation is temporarily disabled. Please use local file validation.';
        if (args.json) {
          console.log(JSON.stringify({ valid: false, error }, null, 2));
        } else {
          console.error(red(error));
        }
        process.exit(1);
      } else {
        // Read from file
        const manifestPath = args.file || path.join(process.cwd(), '.well-known', 'aura.json');
        if (!fs.existsSync(manifestPath)) {
          const error = `Manifest file not found: ${manifestPath}`;
          if (args.json) {
            console.log(JSON.stringify({ valid: false, error }, null, 2));
          } else {
            console.error(red(error));
          }
          process.exit(1);
        }
        manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        manifestSource = manifestPath;
      }

      result.manifest = manifestData;
      result.source = manifestSource;

      if (!args.json) {
        console.log(blue(`Validating manifest from: ${manifestSource}`));
      }

      // Load schema
      let schema: any;
      if (args.schema) {
        // Custom schema
        if (!fs.existsSync(args.schema)) {
          const error = `Schema file not found: ${args.schema}`;
          if (args.json) {
            console.log(JSON.stringify({ valid: false, error }, null, 2));
          } else {
            console.error(red(error));
          }
          process.exit(1);
        }
        schema = JSON.parse(fs.readFileSync(args.schema, 'utf-8'));
      } else {
        // Default schema from dist
        const schemaPath = path.join(__dirname, '../../dist/aura-v1.0.schema.json');
        if (!fs.existsSync(schemaPath)) {
          const error = 'Default schema not found. Run "npm run build" first.';
          if (args.json) {
            console.log(JSON.stringify({ valid: false, error }, null, 2));
          } else {
            console.error(red(error));
          }
          process.exit(1);
        }
        schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
      }

      // Validate
      const ajv = new Ajv.default({ 
        allErrors: true, 
        verbose: args.verbose,
        strict: false // Allow additional keywords from TypeScript JSON Schema
      });
      const validate = ajv.compile(schema);
      const valid = validate(manifestData);

      result.valid = valid;

      if (valid) {
        if (!args.json) {
          console.log(green('✓ Manifest is valid!'));

          // Show summary
          console.log(cyan('\nManifest Summary:'));
          console.log(`  Protocol: ${manifestData.protocol} v${manifestData.version}`);
          console.log(`  Site: ${manifestData.site.name}`);
          console.log(`  Resources: ${Object.keys(manifestData.resources || {}).length}`);
          console.log(`  Capabilities: ${Object.keys(manifestData.capabilities || {}).length}`);

          if (args.verbose) {
            console.log(cyan('\nCapabilities:'));
            Object.entries(manifestData.capabilities || {}).forEach(([id, cap]: [string, any]) => {
              console.log(`  - ${id}: ${cap.description}`);
            });
          }
        }
      } else {
        result.errors = validate.errors;
        
        if (!args.json) {
          console.log(red('✗ Manifest is invalid!'));
          console.log(red('\nValidation errors:'));
          
          validate.errors?.forEach((error) => {
            const instancePath = error.instancePath || '/';
            console.log(red(`  ${instancePath}: ${error.message}`));
            if (error.params && args.verbose) {
              console.log(gray(`    Details: ${JSON.stringify(error.params)}`));
            }
          });
        }
      }

      // Additional checks
      if (manifestData.capabilities) {
        if (!args.json) {
          console.log(cyan('\nPerforming additional checks...'));
        }
        
        // Check for referenced capabilities in resources
        const referencedCapabilities = new Set<string>();
        Object.values(manifestData.resources || {}).forEach((resource: any) => {
          Object.values(resource.operations || {}).forEach((op: any) => {
            if (op.capabilityId) {
              referencedCapabilities.add(op.capabilityId);
            }
          });
        });

        // Check for unreferenced capabilities
        const definedCapabilities = new Set(Object.keys(manifestData.capabilities));
        const unreferenced = Array.from(definedCapabilities).filter(
          id => !referencedCapabilities.has(id)
        );
        
        if (unreferenced.length > 0) {
          const warning = `Unreferenced capabilities: ${unreferenced.join(', ')}`;
          result.warnings?.push(warning);
          if (!args.json) {
            console.log(yellow(`  ⚠ ${warning}`));
          }
        }

        // Check for undefined capability references
        const undefined = Array.from(referencedCapabilities).filter(
          id => !definedCapabilities.has(id)
        );
        
        if (undefined.length > 0) {
          const error = `Undefined capability references: ${undefined.join(', ')}`;
          result.errors = result.errors || [];
          result.errors.push({ message: error });
          result.valid = false;
          
          if (!args.json) {
            console.log(red(`  ✗ ${error}`));
          }
        }
      }

      if (args.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (result.valid) {
          console.log(green('\n✓ All checks passed!'));
        }
      }

      if (!result.valid) {
        process.exit(1);
      }
    } catch (error: any) {
      if (args.json) {
        console.log(JSON.stringify({ valid: false, error: error.message }, null, 2));
      } else {
        console.error(red(`Error: ${error.message}`));
      }
      process.exit(1);
    }
  },
});

runMain(main); 