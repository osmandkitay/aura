# **AURA Protocol Codebase Refinement Plan**

## **Introduction**

This document provides a step-by-step guide to implement the refinements discussed in the initial analysis. The AURA project is already of exceptionally high quality. These changes will resolve a few minor inconsistencies, primarily in test data, and improve the overall robustness of the reference implementation, making it an even stronger standard for others to follow.

Each step includes the reasoning behind the change, a detailed implementation guide, and a clear, imperative action command.

### **Step 1: Correct the Inconsistency in agent.test.ts** ✅

This is the most critical change as it corrects a failing test and ensures test data is valid.

#### **Reasoning**

The integration test should return correct capabilities for authenticated user in packages/reference-client/src/agent.test.ts asserts that the AURA-State for a logged-in user contains the 'update\_post' capability. However, the mockManifest used for this test does not include a definition for update\_post, which causes the test to fail. The fix is to add the missing capability to the mock data, making the test valid and self-contained.

#### **Implementation**

In the file aura/packages/reference-client/src/agent.test.ts, locate the mockManifest constant. Inside its capabilities object, you need to add the definition for update\_post. For maximum consistency, this definition should mirror the one from the reference server's actual manifest.

Here is the capability block to add:

// This block should be added inside the \`capabilities: {}\` object of the \`mockManifest\`  
update\_post: {  
  id: "update\_post",  
  v: 1,  
  description: "Update an existing blog post",  
  parameters: {  
    type: "object",  
    required: \["id"\],  
    properties: {  
      id: { type: "string" },  
      title: { type: "string", minLength: 1 },  
      content: { type: "string", minLength: 1 }  
    }  
  },  
  action: {  
    type: "HTTP",  
    method: "PUT",  
    urlTemplate: "/api/posts/{id}",  
    cors: true,  
    encoding: "json",  
    parameterMapping: {  
      id: "/id",  
      title: "/title",  
      content: "/content"  
    }  
  }  
},

#### **Action**

**1\. Add the update\_post capability definition to the mockManifest constant in the file aura/packages/reference-client/src/agent.test.ts.**

### **Step 2: Align create\_post Mock with the Reference Implementation** ✅

This change improves the fidelity of the test data, making the client's tests a more accurate reflection of the server's behavior.

#### **Reasoning**

The create\_post capability defined in the mockManifest of agent.test.ts is missing the tags and published parameters that are present in the reference server's live aura.json manifest. While not breaking the existing tests, aligning the mock data prevents future confusion and ensures that tests can be written against the full capability definition.

#### **Implementation**

In the file aura/packages/reference-client/src/agent.test.ts, find the create\_post capability within the mockManifest. You need to update both its parameters and action.parameterMapping sections.

**1\. Update the parameters.properties object:**

// Inside mockManifest \-\> capabilities \-\> create\_post \-\> parameters \-\> properties  
properties: {  
  title: { type: "string", minLength: 1, maxLength: 200 },  
  content: { type: "string", minLength: 1 },  
  // ADD THESE TWO PROPERTIES  
  tags: { type: "array", items: { type: "string" } },  
  published: { type: "boolean", default: false }  
}

**2\. Update the action.parameterMapping object:**

// Inside mockManifest \-\> capabilities \-\> create\_post \-\> action  
parameterMapping: {  
  title: "/title",  
  content: "/content",  
  // ADD THESE TWO MAPPINGS  
  tags: "/tags",  
  published: "/published"  
}

#### **Action**

**2\. Update the create\_post capability in the mockManifest of aura/packages/reference-client/src/agent.test.ts to include definitions and mappings for tags and published.**

### **Step 3: Refactor Middleware for Dynamic Capability Management**

This change enhances the maintainability of the reference server by removing hardcoded values. The next step will make this change production-ready.

#### **Reasoning**

The server's middleware.ts currently uses a hardcoded array to define which capabilities are available. By reading the capabilities directly from the manifest file, we create a single source of truth, making the server more robust and easier to maintain.

#### **Implementation**

Modify the file aura/packages/reference-server/middleware.ts. You will replace the static logic with a dynamic approach. Note that the import statement suggested here will be replaced by a more robust method in Step 4\.

// This is the conceptual change. Step 4 will provide the production-safe implementation.  
import manifest from '../public/.well-known/aura.json';

const authenticatedCapabilities \= Object.keys(manifest.capabilities);  
const unauthenticatedCapabilities \= \['list\_posts', 'read\_post', 'login'\];

// ... inside middleware  
const capabilities \= isAuthenticated  
    ? authenticatedCapabilities  
    : unauthenticatedCapabilities;

#### **Action**

**3\. Conceptually prepare to refactor aura/packages/reference-server/middleware.ts to dynamically load the capability list from aura.json instead of using a hardcoded array.**

### **Step 4: Ensure Production-Ready Manifest Loading in Middleware**

This new step addresses the excellent feedback from your team and makes the dynamic loading from Step 3 reliable in a production environment.

#### **Reasoning**

Your team correctly pointed out that a direct import of a JSON file from the public directory is unreliable in a Next.js production build (next build). The public directory is for static assets served to the client, not for server-side modules. The build process will likely fail or the file will not be found at runtime. The correct and most robust server-side approach is to read the file directly from the filesystem using Node.js's fs and path modules.

#### **Implementation**

Modify the file aura/packages/reference-server/middleware.ts to use fs.readFileSync. This ensures the manifest is read reliably every time the middleware is executed.

import { NextResponse } from 'next/server';  
import type { NextRequest } from 'next/server';  
// 1\. Import Node.js modules for file system access  
import fs from 'fs';  
import path from 'path';

// 2\. Read the manifest file reliably  
const manifestPath \= path.join(process.cwd(), 'public', '.well-known', 'aura.json');  
const manifestFile \= fs.readFileSync(manifestPath, 'utf-8');  
const manifest \= JSON.parse(manifestFile);

// 3\. Define capability sets based on the loaded manifest  
const allDefinedCapabilities \= Object.keys(manifest.capabilities);  
const unauthenticatedCapabilities \= \['list\_posts', 'read\_post', 'login'\];  
const authenticatedCapabilities \= allDefinedCapabilities; 

export function middleware(request: NextRequest) {  
  const response \= NextResponse.next();  
  const authCookie \= request.cookies.get('auth-token');  
  const isAuthenticated \= \!\!(authCookie?.value);  
    
  // 4\. Use the dynamically defined capability sets  
  const capabilities \= isAuthenticated  
    ? authenticatedCapabilities  
    : unauthenticatedCapabilities;

  const auraState \= {  
    isAuthenticated,  
    context: {  
      path: request.nextUrl.pathname,  
      timestamp: new Date().toISOString(),  
    },  
    capabilities,  
  };

  const auraStateBase64 \= Buffer.from(JSON.stringify(auraState)).toString('base64');  
  response.headers.set('AURA-State', auraStateBase64);

  return response;  
}

#### **Action**

**4\. Refactor aura/packages/reference-server/middleware.ts to use fs.readFileSync and path.join to reliably load aura.json in both development and production environments.**