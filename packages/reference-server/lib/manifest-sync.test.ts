import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Manifest and Route Synchronization Check', () => {
  it('should ensure all capabilityIds used in API routes are defined in the aura.json manifest', async () => {
    // Step 1: Find all API route files in the pages/api directory
    const apiRoutesDir = path.join(__dirname, '../pages/api');
    const apiFiles = findApiFiles(apiRoutesDir);
    
    // Step 2: Extract all capabilityId strings from validateRequest calls
    const usedCapabilityIds = new Set<string>();
    
    for (const filePath of apiFiles) {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const capabilityIds = extractCapabilityIds(fileContent, filePath);
      capabilityIds.forEach(id => usedCapabilityIds.add(id));
    }
    
    // Step 3: Load the aura.json manifest
    const manifestPath = path.join(__dirname, '../public/.well-known/aura.json');
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);
    
    // Step 4: Verify that every capabilityId from code exists in manifest.capabilities
    const manifestCapabilityIds = new Set(Object.keys(manifest.capabilities || {}));
    
    const missingCapabilities: string[] = [];
    for (const capabilityId of usedCapabilityIds) {
      if (!manifestCapabilityIds.has(capabilityId)) {
        missingCapabilities.push(capabilityId);
      }
    }
    
    // Step 5: Assert synchronization
    expect(missingCapabilities).toEqual([]);
    
    if (missingCapabilities.length > 0) {
      throw new Error(
        `The following capability IDs are used in API routes but missing from aura.json manifest:\n` +
        missingCapabilities.map(id => `  - "${id}"`).join('\n') +
        `\n\nPlease add these capabilities to the manifest or remove them from the code.`
      );
    }
    
    // Log successful synchronization for visibility
    console.log(`[MANIFEST_SYNC] ✅ All ${usedCapabilityIds.size} capability IDs are properly synchronized between API routes and manifest`);
    console.log(`[MANIFEST_SYNC] Verified capability IDs: ${Array.from(usedCapabilityIds).sort().join(', ')}`);
  });
});

/**
 * Recursively find all .ts files in the API routes directory (excluding .test.ts files)
 */
function findApiFiles(dir: string): string[] {
  const files: string[] = [];
  
  if (!fs.existsSync(dir)) {
    return files;
  }
  
  const entries = fs.readdirSync(dir);
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      // Recursively search subdirectories
      files.push(...findApiFiles(fullPath));
    } else if (stat.isFile() && entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      // Include .ts files but exclude test files
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Extract capability IDs from validateRequest function calls in the file content
 */
function extractCapabilityIds(fileContent: string, filePath: string): string[] {
  const capabilityIds: string[] = [];
  
  // Regular expression to match validateRequest(req, 'capability_id') calls
  // This handles both single and double quotes, and allows for whitespace
  const validateRequestRegex = /validateRequest\s*\(\s*[^,]+,\s*['"`]([^'"`]+)['"`]\s*\)/g;
  
  let match;
  while ((match = validateRequestRegex.exec(fileContent)) !== null) {
    const capabilityId = match[1];
    if (capabilityId) {
      capabilityIds.push(capabilityId);
      
      // Log for debugging/visibility
      const relativePath = path.relative(process.cwd(), filePath);
      console.log(`[MANIFEST_SYNC] Found capability ID "${capabilityId}" in ${relativePath}`);
    }
  }
  
  return capabilityIds;
} 