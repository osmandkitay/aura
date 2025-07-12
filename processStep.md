# **AURA Project Enhancement Plan**

This document outlines a series of recommended improvements to the AURA project. The goal of these changes is to increase maintainability, reduce the risk of inconsistencies, and improve the overall clarity of the codebase. Each step includes an explanation of the problem, a proposed solution, and concrete action items.

## **Step 1: Decouple Capability Permissions from Middleware** ✅

### **Problem**

Currently, the permissions for which capabilities are available to authenticated vs. unauthenticated users are hardcoded directly into packages/reference-server/middleware.ts. This creates a tight coupling between the middleware logic and the aura.json manifest. If a new capability is added or permissions change, the middleware's code must be manually updated, creating a risk of the system's state becoming inconsistent with its advertised capabilities.

### **Solution**

Create a centralized, data-driven permission configuration that the middleware can consume. This will make the system more robust and easier to maintain. We will create a new file to store this mapping.

### **Action Items**

1. **Create a new file named** permissions.ts **inside** packages/reference-server/lib/**.**  
   * Add the following content to this file. This map will now be the single source of truth for capability permissions.

// packages/reference-server/lib/permissions.ts

/\*\*  
 \* Defines the authentication requirements for each capability.  
 \* This provides a single source of truth for permission checks.  
 \*/  
export const CAPABILITY\_PERMISSIONS: Record\<string, { authRequired: boolean }\> \= {  
  // Publicly available capabilities  
  'login': { authRequired: false },  
  'list\_posts': { authRequired: false },  
  'read\_post': { authRequired: false },

  // Capabilities requiring authentication  
  'create\_post': { authRequired: true },  
  'update\_post': { authRequired: true },  
  'delete\_post': { authRequired: true },  
  'get\_profile': { authRequired: true },  
  'update\_profile': { authRequired: true },  
};

/\*\*  
 \* Lists all capabilities defined in the system.  
 \* This should be kept in sync with aura.json.  
 \*/  
export const ALL\_CAPABILITIES \= Object.keys(CAPABILITY\_PERMISSIONS);

2. **Modify the** middleware.ts **file to use this new permission map.**  
   * Replace the hardcoded arrays with logic that filters capabilities based on the imported map and the user's authentication status.

// packages/reference-server/middleware.ts

import { NextResponse } from 'next/server';  
import type { NextRequest } from 'next/server';  
import { ALL\_CAPABILITIES, CAPABILITY\_PERMISSIONS } from './lib/permissions'; // Import the new config

export function middleware(request: NextRequest) {  
  // Get the response  
  const response \= NextResponse.next();

  // Get session/auth info  
  const authCookie \= request.cookies.get('auth-token');  
  const isAuthenticated \= \!\!(authCookie && authCookie.value && authCookie.value.length \> 0);

  // Determine available capabilities dynamically based on the permission map  
  const capabilities \= ALL\_CAPABILITIES.filter(capId \=\> {  
    const permission \= CAPABILITY\_PERMISSIONS\[capId\];  
    if (\!permission) return false; // Default to secure if not defined  
    return isAuthenticated ? true : \!permission.authRequired;  
  });

  // Create AURA-State object  
  const auraState \= {  
    isAuthenticated,  
    context: {  
      path: request.nextUrl.pathname,  
      timestamp: new Date().toISOString(),  
    },  
    capabilities,  
  };

  // Encode as Base64 and add to response headers  
  const auraStateBase64 \= Buffer.from(JSON.stringify(auraState)).toString('base64');  
  response.headers.set('AURA-State', auraStateBase64);

  return response;  
}

// Configure which paths the middleware runs on  
export const config \= {  
  matcher: \[  
    '/((?\!\_next/static|\_next/image|favicon.ico).\*)',  
  \],  
};

## **Step 2: Refine URI Template Handling for Clarity** ✅

### **Problem**

The function expandUriTemplate in packages/reference-client/src/agent.ts is misleadingly named. It only expands path parameters (e.g., {id}) and completely removes the query string portion of the template (e.g., {?limit}). The actual handling of query parameters is deferred to axios. This can confuse developers about the function's true purpose.

### **Solution**

Rename the function to more accurately describe what it does: preparing the base URL by expanding path variables.

### **Action Items**

1. **Rename the** expandUriTemplate **function in** packages/reference-client/src/agent.ts**.**  
   * Change the function name to prepareUrlPath.  
   * Update the function's comment to reflect its actual behavior.

// packages/reference-client/src/agent.ts

/\*\*  
 \* Prepares the URL path by expanding path parameters (e.g., /posts/{id}) and  
 \* stripping the query parameter template (e.g., {?limit,offset}).  
 \* Query parameters are handled separately during the request execution.  
 \*/  
export function prepareUrlPath(template: string, args: any): string {  
    let url \= template;

    // Remove any query parameter templates from the URL template  
    url \= url.replace(/\\{\\?\[^}\]+\\}/, '');

    // Handle path parameters like {id}  
    Object.keys(args).forEach(paramKey \=\> {  
        const paramValue \= args\[paramKey\];  
        if (paramValue \!== undefined) {  
            url \= url.replace(\`{${paramKey}}\`, encodeURIComponent(paramValue));  
        }  
    });

    return url;  
}

2. **Update the call to this function within** executeAction **in the same file.**  
   * Find the executeAction function and change the call from expandUriTemplate to prepareUrlPath.

// packages/reference-client/src/agent.ts

async function executeAction(...) {  
  // ...  
  const capability \= manifest.capabilities\[capabilityId\];  
  if (\!capability) throw new Error(\`Capability ${capabilityId} not found.\`);

  // Expand URI template for path parameters only  
  const templateUrl \= prepareUrlPath(capability.action.urlTemplate, args); // \<-- UPDATE THIS LINE  
  const fullUrl \= \`${baseUrl}${templateUrl}\`;

  // ...  
}

3. **Update the corresponding test file** packages/reference-client/src/agent.test.ts**.**  
   * Change the import and the test descriptions to use prepareUrlPath.

// packages/reference-client/src/agent.test.ts

// ...  
import { prepareUrlPath } from './agent'; // \<-- UPDATE THIS IMPORT  
// ...

describe('AURA Agent Core Functions', () \=\> {  
  describe('prepareUrlPath', () \=\> { // \<-- UPDATE THIS DESCRIPTION  
    it('should expand simple path parameters', () \=\> {  
      const result \= prepareUrlPath('/api/posts/{id}', { id: '123' }); // \<-- UPDATE FUNCTION CALL  
      expect(result).toBe('/api/posts/123');  
    });

    it('should remove query parameter templates from URL', () \=\> {  
      const result \= prepareUrlPath('/api/posts{?limit,offset}', { limit: 10, offset: 0 }); // \<-- UPDATE FUNCTION CALL  
      expect(result).toBe('/api/posts');  
    });

    // ... update other tests in this describe block  
  });  
});

## **Step 3: Add Clarity to Parameter Mapping Implementation** ✅

### **Problem**

The mapParameters function in packages/reference-client/src/agent.ts is a simplified implementation of the JSON Pointer standard (RFC 6901). It only handles top-level pointers (e.g., /email) and does not support nested objects or arrays. While this is sufficient for the current reference implementation, it could be a source of confusion or bugs if the protocol is used with more complex APIs.

### **Solution**

Add a detailed comment to the function to clearly state its scope and limitations. This manages expectations and prevents incorrect usage.

### **Action Items**

1. **Add a more descriptive comment to the** mapParameters **function.**  
   * In packages/reference-client/src/agent.ts, update the comment for the mapParameters function as follows:

// packages/reference-client/src/agent.ts

/\*\*  
 \* Maps arguments from the LLM response to a new object based on the capability's  
 \* parameterMapping.  
 \*  
 \* This function uses a simplified implementation of JSON Pointer syntax.  
 \* It currently only supports top-level, non-nested pointers.  
 \* For example:  
 \* \- \`"/email"\` maps to \`args.email\`  
 \* \- \`"/title"\` maps to \`args.title\`  
 \*  
 \* Nested pointers like \`"/user/name"\` are not supported in this reference client.  
 \*  
 \* @param args The arguments object, typically from the LLM.  
 \* @param parameterMapping The mapping from the capability definition.  
 \* @returns A new object with keys and values mapped for the HTTP request.  
 \*/  
function mapParameters(args: any, parameterMapping: Record\<string, string\>): any {  
    const mapped: any \= {};

    for (const \[paramName, jsonPointer\] of Object.entries(parameterMapping)) {  
        // Simplified JSON Pointer logic for top-level keys  
        if (jsonPointer.startsWith('/')) {  
            const key \= jsonPointer.slice(1); // Remove leading "/"  
            if (args\[key\] \!== undefined) {  
                mapped\[paramName\] \= args\[key\];  
            }  
        }  
    }

    return mapped;  
}

## **Step 4: Enforce Consistency Between TypeScript Interfaces and JSON Schema** ✅

### **Problem**

A subtle but critical risk in the project is "schema drift." The TypeScript interfaces (e.g., AuraManifest in src/index.ts) define which properties are optional (?) for developers, while the generated dist/aura-v1.0.schema.json defines this for validation tools via its required arrays. If these two sources of truth diverge, the build may succeed, but validation will fail unexpectedly, or worse, allow invalid data to be processed.

### **Solution**

Add a new, automated unit test to the aura-protocol package. This test will act as a safeguard, comparing the required fields in the generated JSON schema against a manually-maintained list of expected required fields for each major interface. It will fail the build if there is any mismatch, ensuring that any change to a field's optionality is intentional and synchronized.

### **Action Items**

1. **Create a new test file named** schema-sync.test.ts **inside** packages/aura-protocol/src/**.**  
   * Add the following content to this file. This test explicitly declares the expected required fields for each interface and compares them against the generated schema.

// packages/aura-protocol/src/schema-sync.test.ts

import { describe, it, expect } from 'vitest';  
import \* as fs from 'fs';  
import \* as path from 'path';

// Load the generated JSON schema, which is the artifact we are testing.  
const schemaPath \= path.join(\_\_dirname, '../dist/aura-v1.0.schema.json');  
if (\!fs.existsSync(schemaPath)) {  
  throw new Error(\`Schema file not found at ${schemaPath}. Run 'npm run build' in the protocol package first.\`);  
}  
const schema \= JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

/\*\*  
 \* Helper function to compare required properties cleanly.  
 \* @param definition The schema definition to check.  
 \* @param expected The expected array of required properties.  
 \*/  
function assertRequiredProperties(definition: any, expected: string\[\]) {  
  // Sort both arrays to ensure comparison is not order-dependent.  
  const actualRequired \= (definition?.required || \[\]).sort();  
  const expectedRequired \= \[...expected\].sort();  
  expect(actualRequired).toEqual(expectedRequired);  
}

describe('JSON Schema and TypeScript Interface Synchronization', () \=\> {

  it('should have correct required fields for AuraManifest', () \=\> {  
    const expected \= \['protocol', 'version', 'site', 'resources', 'capabilities', '$schema'\];  
    assertRequiredProperties(schema, expected);  
  });

  it('should have correct required fields for Resource', () \=\> {  
    const expected \= \['uriPattern', 'description', 'operations'\];  
    const definition \= schema.definitions?.Resource;  
    expect(definition).toBeDefined();  
    assertRequiredProperties(definition, expected);  
  });

  it('should have correct required fields for Capability', () \=\> {  
    const expected \= \['id', 'v', 'description', 'action'\];  
    const definition \= schema.definitions?.Capability;  
    expect(definition).toBeDefined();  
    assertRequiredProperties(definition, expected);  
  });

  it('should have correct required fields for HttpAction', () \=\> {  
    const definitionName \= Object.keys(schema.definitions?.Capability.definitions || {}).find(k \=\> k \=== 'HttpAction');  
    const definition \= schema.definitions?.Capability.definitions\[definitionName\!\];  
    const expected \= \['type', 'method', 'urlTemplate', 'parameterMapping'\];  
    expect(definition).toBeDefined();  
    assertRequiredProperties(definition, expected);  
  });

  it('should have correct required fields for Policy', () \=\> {  
    const definition \= schema.definitions?.Policy;  
    // Policy itself is optional, but if present, it has no required fields at its top level.  
    const expected: string\[\] \= \[\];  
    expect(definition).toBeDefined();  
    assertRequiredProperties(definition, expected);  
  });

});

2. **Run the test suite.**  
   * This new test will now be automatically included when you run pnpm test. It will fail if, for example, a developer removes the ? from policy?: Policy in src/index.ts but forgets to update the test, or if the schema generator produces an unexpected result. This enforces deliberate and synchronized changes.

## **Conclusion**

By implementing these four steps, the AURA project will be more robust, maintainable, and developer-friendly. Decoupling permissions and adding schema synchronization tests remove potential sources of critical bugs, while the other changes improve code clarity, making it easier for new contributors to understand the system's architecture and intent.