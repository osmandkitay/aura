#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import * as Ajv from 'ajv';
import chalk from 'chalk';
import axios from 'axios';

const program = new Command();

program
  .name('aura-validate')
  .description('Validate AURA manifest files against the official schema')
  .version('1.3.0')
  .argument('[file]', 'Path to the manifest file (default: .well-known/aura.json)')
  .option('-u, --url <url>', 'Validate manifest from URL')
  .option('-s, --schema <path>', 'Path to custom schema file')
  .option('-v, --verbose', 'Show detailed validation output')
  .action(async (file: string | undefined, options: any) => {
    try {
      // Determine manifest source
      let manifestData: any;
      let manifestSource: string;

      if (options.url) {
        // Fetch from URL
        console.log(chalk.blue(`Fetching manifest from ${options.url}...`));
        const response = await axios.get(options.url);
        manifestData = response.data;
        manifestSource = options.url;
      } else {
        // Read from file
        const manifestPath = file || path.join(process.cwd(), '.well-known', 'aura.json');
        if (!fs.existsSync(manifestPath)) {
          console.error(chalk.red(`Manifest file not found: ${manifestPath}`));
          process.exit(1);
        }
        manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        manifestSource = manifestPath;
      }

      console.log(chalk.blue(`Validating manifest from: ${manifestSource}`));

      // Load schema
      let schema: any;
      if (options.schema) {
        // Custom schema
        if (!fs.existsSync(options.schema)) {
          console.error(chalk.red(`Schema file not found: ${options.schema}`));
          process.exit(1);
        }
        schema = JSON.parse(fs.readFileSync(options.schema, 'utf-8'));
      } else {
        // Default schema from dist
        const schemaPath = path.join(__dirname, '../../dist/aura-v1.3.schema.json');
        if (!fs.existsSync(schemaPath)) {
          console.error(chalk.red('Default schema not found. Run "npm run build" first.'));
          process.exit(1);
        }
        schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
      }

      // Validate
      const ajv = new Ajv.default({ 
        allErrors: true, 
        verbose: options.verbose,
        strict: false // Allow additional keywords from TypeScript JSON Schema
      });
      const validate = ajv.compile(schema);
      const valid = validate(manifestData);

      if (valid) {
        console.log(chalk.green('✓ Manifest is valid!'));

        // Show summary
        console.log(chalk.cyan('\nManifest Summary:'));
        console.log(`  Protocol: ${manifestData.protocol} v${manifestData.version}`);
        console.log(`  Site: ${manifestData.site.name}`);
        console.log(`  Resources: ${Object.keys(manifestData.resources || {}).length}`);
        console.log(`  Capabilities: ${Object.keys(manifestData.capabilities || {}).length}`);

        if (options.verbose) {
          console.log(chalk.cyan('\nCapabilities:'));
          Object.entries(manifestData.capabilities || {}).forEach(([id, cap]: [string, any]) => {
            console.log(`  - ${id}: ${cap.description}`);
          });
        }
      } else {
        console.log(chalk.red('✗ Manifest is invalid!'));
        console.log(chalk.red('\nValidation errors:'));
        
        validate.errors?.forEach((error) => {
          const instancePath = error.instancePath || '/';
          console.log(chalk.red(`  ${instancePath}: ${error.message}`));
          if (error.params && options.verbose) {
            console.log(chalk.gray(`    Details: ${JSON.stringify(error.params)}`));
          }
        });

        process.exit(1);
      }

      // Additional checks
      if (manifestData.capabilities) {
        console.log(chalk.cyan('\nPerforming additional checks...'));
        
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
          console.log(chalk.yellow(`  ⚠ Unreferenced capabilities: ${unreferenced.join(', ')}`));
        }

        // Check for undefined capability references
        const undefined = Array.from(referencedCapabilities).filter(
          id => !definedCapabilities.has(id)
        );
        
        if (undefined.length > 0) {
          console.log(chalk.red(`  ✗ Undefined capability references: ${undefined.join(', ')}`));
        }
      }

      console.log(chalk.green('\n✓ All checks passed!'));
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program.parse(process.argv); 