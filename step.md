# **Refactoring AURA: From v1.0 to the "v1.3 Production-Ready" Protocol**

## **1\. Introduction**

This document outlines the refactoring steps required to evolve the current AURA proof-of-concept (v1.0) into a robust, scalable, and efficient protocol ready for real-world implementation.

This plan moves AURA to a stable, API-driven architecture, decoupling the agent from the UI and focusing on performance, developer experience, and security.

The goals are to:

1. **Decouple the Agent from the UI:** Actions will be executed via stable API endpoints.  
2. **Improve Performance & Efficiency:** Use a single site-wide manifest and lightweight HTTP headers for page-specific state.  
3. **Enhance Developer Experience (DX):** Introduce a formal schema, validation tools, and code generators.  
4. **Increase Robustness & Security:** Add policies for rate limiting, authentication, and CSRF protection.

## **2\. Core Protocol Redesign (@aura/protocol)**

The foundation of the refactor lies in evolving the core data structures for production use.

### **2.1. Introduce a Central AuraManifest**

The AuraAssertion concept is replaced by a single, site-wide AuraManifest, served from /.well-known/aura.json.

### **2.2. Separate Capabilities from Resources**

To improve clarity, we separate *what* can be done (Capability) from *where* it can be done (Resource).

// packages/aura-protocol/src/index.ts

export interface AuraManifest {  
  $schema: string; // e.g., "https://aura.dev/schemas/v1.3.json"  
  id?: string; // Canonical, absolute URL for the manifest  
  protocol: 'AURA';  
  version: '1.3';  
  site: { /\* ... \*/ };  
  resources: Record\<string, Resource\>;  
  capabilities: Record\<string, Capability\>;  
  policy?: Policy;  
}

export interface Resource {  
  uriPattern: string; // e.g., "/articles/{id}"  
  description: string;  
  operations: {  
    GET?: { capabilityId: string; };  
    POST?: { capabilityId: string; };  
    // ...  
  };  
}

### **2.3. Redefine Capability with a Concrete Action**

This is the most critical change, making capabilities self-executing contracts.

// packages/aura-protocol/src/index.ts

export interface Capability {  
  id: string;  
  // Versioning: A simple integer incremented for each breaking change.  
  v: number;  
  description: string;  
  parameters?: import('json-schema').JSONSchema7;  
  action: HttpAction;  
}

export interface HttpAction {  
  type: 'HTTP';  
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';  
  // Adheres to RFC 6570 URI Template, e.g., "/api/posts/{postId}{?tags\*}"  
  urlTemplate: string;  
  // Hint for browser-based agents to avoid CORS issues  
  cors?: boolean;  
  // Defines how parameters are sent  
  encoding?: 'json' | 'form-data' | 'multipart' | 'query';  
  // Maps capability parameters to the HTTP request using JSON-Pointer syntax  
  parameterMapping: Record\<string, string\>;  
  // Security policy for this specific action  
  security?: {  
    // Defines CSRF token handling. Can be a static header or a dynamic fetch endpoint.  
    csrf?: 'none' | 'header:X-CSRF-TOKEN' | \`fetch:${string}\`; // e.g., "fetch:/api/csrf-token"  
  };  
}

### **2.4. Introduce Policy and AURA-State Header**

We add a top-level Policy object and use an HTTP header for dynamic context.

// packages/aura-protocol/src/index.ts

export interface Policy {  
  // Machine-readable rate limit  
  rateLimit?: {  
    limit: number; // e.g., 120  
    window: 'second' | 'minute' | 'hour';  
  };  
  // Provides a hint to the agent about authentication  
  authHint?: 'none' | 'cookie' | 'bearer' | 'oauth2' | '401\_challenge';  
}

// The AURA-State header is a Base64-encoded JSON object in the HTTP response.  
// e.g., AURA-State: eyJpc0F1dGhlbnRpY2F0ZWQiOnRydWUsImNvbnRleHQiOnsicG9zdElkIjoiNDIifX0=

### **2.5. Refine BEPCommand to AURAEvent for Asynchronous Callbacks**

While most actions are standard HTTP requests, some interactions (like solving a captcha or completing an OAuth flow) require the browser to send data back to the agent. A minimal AURAEvent is introduced for this purpose.

export interface AURAEvent {  
  protocol: 'AURAEvent';  
  version: '1.0';  
  eventId: string;  
  payload: {  
    type: 'AUTH\_TOKEN\_ACQUIRED' | 'CAPTCHA\_SOLVED' | 'REDIRECT\_OCCURRED';  
    data: any;  
  };  
}

## **3\. Server-Side Refactoring (aura-lighthouse-app)**

### **3.1. Implement Manifest Endpoint**

**Action:**

* Serve the manifest from /.well-known/aura.json, ensuring it includes the Access-Control-Allow-Origin header for cross-origin agents.  
* **For Production:** Generate this file at build time or serve it from an API endpoint with aggressive caching.

### **3.2. Implement AURA-State Header**

**Action:**

* Use a server-side mechanism that has session access (e.g., getServerSideProps) to add the AURA-State header.  
* **Crucially**, ensure the server also sends Access-Control-Expose-Headers: AURA-State, Location, Set-Cookie so agents can handle auth flows and redirects correctly.  
* **Documentation:** Note that CDNs (like CloudFront/Akamai) may need explicit configuration to forward and expose custom headers.

### **3.3. Create Real, Resilient API Endpoints**

**Action:**

* Create the API endpoints defined in the manifest.  
* These endpoints should return structured, machine-readable error codes (e.g., { "code": "NEEDS\_MFA", "detail": "MFA required", "hint": "totp" }).

## **4\. Agent Refactoring (ai-core-cli)**

### **4.1. Update Discovery and Execution Logic**

**Action:**

1. Fetch the manifest from /.well-known/aura.json.  
2. The new flow:  
   a. The LLM identifies the capabilityId to execute, ideally using schema-based function calling to reduce errors.  
   b. The agent constructs the HTTP request according to the action definition.  
   c. The agent reads the AURA-State header and persists it in a local cache (e.g., in an OS temp directory with a .lock file to handle concurrency).

## **5\. Browser Adapter Refactoring (aura-adapter)**

### **5.1. Minimize Content Script to an event-handler.ts**

**Action:**

* Replace command-executor.ts with a smaller event-handler.ts responsible for:  
  * Listening for auth-related pop-ups or new tabs (chrome.tabs.onCreated).  
  * Capturing Set-Cookie headers or tokens.  
  * Sending this information back to the ai-core using the AURAEvent protocol, buffering events to IndexedDB if the WebSocket connection is down.

### **5.2. Implement Reliable Header Detection**

**Action:**

* Use the chrome.webRequest API (or declarativeNetRequest for MV3 compliance) to passively listen to navigation events and read the AURA-State header from responses without making an extra network request.

## **6\. Schema and Validation Tooling**

### **Action:**

1. **Publish @aura/schema:** Generate and publish a JSON Schema from the TypeScript types. Include $defs for common formats (e.g., Email, ISO-Date) to promote standardization.  
2. **Create npx aura-validate:** A CLI tool to validate manifests against the official schema.  
3. **Create npx aura-openapi:** A generator that converts an AuraManifest into an OpenAPI 3.0 specification, providing instant documentation and compatibility with a vast ecosystem of tools.

## **7\. Implementation Priority**

To achieve a runnable end-to-end demo at each stage, implement in this order:

1. **Protocol Refactor:** Update the types in @aura/protocol, then publish the compiled @aura/schema and the aura-validate tool.  
2. **Static Manifest:** Ship a valid aura.json file so the validator has a real target.  
3. **CLI & GET Action:** Rewire the CLI to fetch the manifest and execute a simple GET capability.  
4. **AURA-State Header:** Implement the header on the server and have the CLI log its value.  
5. **AURAEvent Plumbing:** Implement a minimal event round-trip (e.g., emit a dummy REDIRECT\_OCCURRED event) to verify the WebSocket channel works.  
6. **Adapter Sniffing:** Update the browser adapter to use the webRequest API for header detection.  
7. **Retire DOM Executor:** With all other pieces in place, the legacy DOM manipulation code can be safely removed.