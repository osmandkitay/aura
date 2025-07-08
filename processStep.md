# Actionable Steps to Refine the AURA Protocol Implementation

This document provides a clear, step-by-step guide for implementing the recommended improvements to the AURA project. Each step includes the reasoning behind the change, the specific files to modify, and the exact actions to take.

---

## Step 1: Centralize `AURA-State` Header Generation in Middleware ✅

### The Issue
The `AURA-State` header, which is critical for communicating context to the agent, is currently being generated in two separate locations:
1.  In `middleware.ts` for every incoming request.
2.  In `pages/api/auth/login.ts` specifically after a successful login.

This creates code duplication and two sources of truth for the same piece of logic.

### Reasoning
Adhering to the **Single Source of Truth** principle is crucial for system predictability and maintainability. The middleware is the ideal location to manage a cross-cutting concern like the `AURA-State` header. The state should always be derived from the current request context (i.e., the presence of an `auth-token` cookie). The login endpoint's only responsibility should be to perform authentication and set the cookie. The correct, authenticated state will then be reflected on the *next* request processed by the middleware.

### Affected Files
- `packages/reference-server/pages/api/auth/login.ts`

### Action
**Modify the login API handler to remove redundant state generation.**

1.  Open the file `packages/reference-server/pages/api/auth/login.ts`.
2.  Locate and **delete** the entire code block responsible for creating and setting the `AURA-State` header. The block to remove is:

    ```typescript
    // Set correct AURA-State header for authenticated user
    const auraState = {
      isAuthenticated: true,
      context: {
        path: '/api/auth/login',
        timestamp: new Date().toISOString(),
      },
      capabilities: ['list_posts', 'create_post', 'read_post', 'update_post', 'delete_post', 'get_profile', 'update_profile'],
    };
    const auraStateBase64 = Buffer.from(JSON.stringify(auraState)).toString('base64');
    res.setHeader('AURA-State', auraStateBase64);
    ```

3.  Save the file. No changes are needed in `middleware.ts`, as it already correctly generates the state based on the cookie.

---

## Step 2: Improve JSON Schema Precision ✅

### The Issue
The generated `aura-v1.0.schema.json` is not as precise as it could be. The definitions for `resources` and `capabilities` are generic `{"type": "object"}`, which validates that they are objects but does not validate the structure of the `Resource` and `Capability` objects *within* them.

### Reasoning
A more precise JSON Schema provides stronger static validation, serves as better documentation, and makes the protocol definition itself more robust. This reduces the reliance on custom logic in the `aura-validate` tool for basic structure checking, allowing it to focus on more complex semantic validation.

### Affected Files
- `packages/aura-protocol/scripts/generate-schema.ts`

### Action
**Modify the schema generation script to add detailed validation for `resources` and `capabilities`.**

1.  Open the file `packages/aura-protocol/scripts/generate-schema.ts`.
2.  Navigate to the end of the script, just before the `fs.writeFileSync` call for `aura-v1.0.schema.json`.
3.  **Add** the following code block. This code will modify the generated schema in memory to use `additionalProperties` with a reference to the `Capability` and `Resource` definitions, ensuring that every item within the `capabilities` and `resources` objects is validated against its proper schema.

    ```typescript
    // Add this block before the final writeFileSync
    
    // Refine the schema to enforce the structure of records
    const resourceSchemaName = 'Resource';
    const capabilitySchemaName = 'Capability';
    
    if (schema.definitions) {
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
    }
    
    // End of the new block
    
    // This line should already exist
    fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2));
    ```
4.  Save the file.
5.  Run the schema generation script again from the `packages/aura-protocol` directory to apply the changes:
    ```bash
    pnpm run generate-schema
    ```
    Or run the full build from the root:
    ```bash
    pnpm run build
    ```

---

## Step 3: Clean Up Unused Development Scripts ✅

### The Issue
The file `test-hash.js` exists in the project root. It appears to be a temporary development script that is no longer in use and is out of sync with the actual password hash used in the reference server.

### Reasoning
Maintaining good project hygiene is essential for collaboration and long-term maintenance. Removing dead or unused code reduces clutter and prevents potential confusion for developers navigating the codebase. Every file in the repository should have a clear and current purpose.

### Affected Files
- `aura/test-hash.js`

### Action
**Delete the unused file from the project.**

1.  From your terminal at the project root (`aura/`), execute the following command:
    ```bash
    rm test-hash.js
    ```
2.  Commit this deletion to your version control system.

---

## Step 4: Honor `parameterMapping` and `encoding` in the Agent ✅

### The Issue
The reference client’s `expandUriTemplate` and `executeAction` logic ignores the manifest’s `capability.action.parameterMapping` and `encoding` hints. It simply URL-encodes arguments into the path or body/query based on the HTTP verb, which can diverge from a manifest that explicitly wants certain parameters in the query string or mapped to different paths.

### Reasoning
By respecting `parameterMapping` and `encoding`, you ensure the agent always constructs requests exactly as the site declares—no guesswork or brittle assumptions. This keeps the agent in sync with the protocol’s declarative promise and makes it a more robust and compliant reference implementation.

### Affected Files
- `packages/reference-client/src/agent.ts`

### Action
**Refactor `executeAction` and `expandUriTemplate` to be fully spec-compliant.**

1.  **Modify `executeAction`** to be the primary driver of request construction logic. It should no longer rely on simple HTTP verb checks. Instead, it should inspect `capability.action.encoding`.

2.  **Modify `expandUriTemplate`** to only handle path parameter replacement (e.g., `/api/posts/{id}`). It should no longer be responsible for query parameter logic.

3.  **Implement the new logic:**
    - In `executeAction`, determine the request `data` (for the body) and `params` (for the query string) based on the `encoding` property.
    - Use the `parameterMapping` to correctly map the `args` from the LLM to the request body or query parameters. The current implementation does not do this, which is a critical gap.
    - Ensure that all arguments passed in the request originate from the `parameterMapping` logic, not from the raw `args` object.

---

## Step 5: Strip Non-standard `defaultProperties` from the Generated Schema ✅

### The Issue
The JSON Schema generated by `typescript-json-schema` includes a `"defaultProperties"` keyword, which is not part of the official JSON Schema Draft-07 specification. While Ajv in its current loose mode ignores it, this can cause validation errors with stricter tools or future configurations.

### Reasoning
Keeping your schema strictly compliant with the public standard ensures maximum portability and prevents subtle validation lapses. A clean, standard-compliant schema is a core asset of an open protocol.

### Affected Files
- `packages/aura-protocol/scripts/generate-schema.ts`

### Action
**Add a cleanup function to the schema generation script.**

1.  Open the file `packages/aura-protocol/scripts/generate-schema.ts`.
2.  Before the final `fs.writeFileSync(outputPath, ...)` line, insert the following recursive cleanup function and call it:

    ```typescript
    // Add this block before the final writeFileSync

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

    // End of the new block
    ```
3.  Save the file and re-generate the schema by running `pnpm run build` from the root or `pnpm run generate-schema` from within the `packages/aura-protocol` directory. Verify that the `defaultProperties` key is no longer present in the output file.
