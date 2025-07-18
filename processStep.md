AURA Protocol: Implementation Refinement Plan
This document outlines a series of focused improvements to enhance the robustness, clarity, and testability of the AURA reference implementation. The goal is to solidify the foundation, ensuring it is as error-free and maintainable as possible, in alignment with the project's core philosophy.

------------------------------------------------

✅ Step 1: Create Unit Tests for the Core Validation Utility
Objective
To create fast, isolated unit tests for the central validation logic in packages/reference-server/lib/validator.ts. While the existing integration tests are excellent for verifying the complete API flow, unit tests will allow us to test the validator's internal functions (like type conversion and error formatting) with precision and without the overhead of the Next.js server. This leads to more reliable code and faster feedback during development.

Reasoning
A core principle of a robust system is to have confidence in its individual components. By testing the validator in isolation, we can easily simulate edge cases and ensure that its behavior is correct under all conditions, which is more difficult and slower to do with full integration tests.

Affected Files
A new file to be created: packages/reference-server/lib/validator.test.ts

Action Plan
Create the new test file at packages/reference-server/lib/validator.test.ts.

Write unit tests to verify the convertParameterTypes function.

Test standard conversions: "true" → true, "123" → 123, "a,b,c" → ['a','b','c'].

Test that non-string inputs (e.g., numbers, booleans, pre-existing arrays) are passed through without modification.

Test that an invalid number string (e.g., "12a") remains as the original string, allowing the ajv validator to later catch and report the type mismatch accurately.

Write unit tests to verify the extractRequestParameters function.

Simulate NextApiRequest objects to confirm that parameters are correctly extracted from req.body for json encoding and from req.query for query encoding.

Test the parameter overwrite behavior: for a POST or PUT request where a key exists in both req.query and req.body, assert that the value from req.body is the final value.

Write unit tests to verify the validateRequest function's behavior and error handling.

Test a capability that has no parameters defined in the manifest (e.g., get_profile). Assert that validateRequest returns { isValid: true }.

Test a call to validateRequest with a non-existent capabilityId. Assert that it returns the standardized "no schema found" error object and does not throw an unhandled exception.

Test that when validation fails, the function returns a response object with isValid: false and an error object that strictly follows the { "code": "VALIDATION_ERROR", ... } structure, including a detailed errors array.

Incorporate the clearValidationCache() function within the test suite's setup logic (e.g., beforeEach or afterEach) to ensure that tests run in isolation and do not influence each other.

------------------------------------------------

✅ Step 2: Make Parameter Extraction More Explicit
Objective
To refactor the parameter extraction logic in the validator to be more explicit and robust by clearly distinguishing between parameters that come from the URL (path and query string) and those that come from the request payload (body).

Reasoning
The current implementation correctly merges parameters. However, making this process more explicit improves the code's clarity and reduces the risk of subtle bugs, such as a parameter in the body accidentally overwriting a required parameter from the path. This change makes the system's behavior easier to reason about, which is fundamental to the project's philosophy.

Affected Files
packages/reference-server/lib/validator.ts

Action Plan
Modify the extractRequestParameters function in validator.ts.

The function should create a new, unified parameters object.

First, copy all properties from req.query into this new object. Add a code comment explaining that in Next.js, req.query contains both dynamic route parameters (e.g., id from /posts/[id].ts) and query string parameters.

Next, if the request method is POST or PUT and req.body is an object, copy all properties from req.body into the parameters object. This ensures that payload parameters intentionally overwrite any query string parameters with the same name, which is standard API behavior.

Explicitly ignore req.body for GET requests, regardless of the encoding hint in the manifest, to adhere to web standards.

Add specific unit tests for the new logic in validator.test.ts.

Test a GET request to /posts/123?foo=bar. Assert the final parameters object is { id: '123', foo: 'bar' }.

Test a PUT request to /posts/123 with a body of { "title": "New Title" }. Assert the final parameters object is { id: '123', title: 'New Title' }.

Test the overwrite behavior: a PUT request to /posts/123?title=old with a body of { "title": "new" } must result in a parameters object where title is "new".

------------------------------------------------

✅ Step 3: Implement Manifest and Route Synchronization Check
Objective
To create an automated test that ensures every capabilityId used in the API routes is actually defined in the aura.json manifest.

Reasoning
This "meta-test" acts as a safeguard against configuration drift. It prevents runtime errors that could occur if a developer renames or removes a capability in the manifest but forgets to update the code that uses it (or vice-versa). It enforces consistency between the public contract (aura.json) and the implementation.

Affected Files
A new file to be created, for example: packages/reference-server/test/manifest-sync.test.ts

Action Plan
Create a new test file for this synchronization check.

In the test, programmatically find all API route files in the pages/api directory.

Parse each file's content to find all instances where validateRequest(req, 'some_capability_id') is called, and extract the capabilityId strings.

Load the public/.well-known/aura.json manifest.

Assert that every capabilityId extracted from the code exists as a key in the manifest.capabilities object. If any are missing, the test should fail with a descriptive error message.

------------------------------------------------

✅ Step 4: Enhance Production-Readiness
Objective
To add small but high-impact changes that improve the server's robustness and debuggability in a production environment.

Reasoning
A system that is easy to debug is more robust. These changes provide better visibility into the server's configuration and ensure that its error responses remain consistent over time.

Affected Files
packages/reference-server/lib/validator.ts

Existing integration tests (e.g., packages/reference-client/src/agent.test.ts).

Action Plan
Add startup logging to loadManifest in validator.ts.

When the manifest is successfully loaded for the first time, log the absolute path of the file that was used (e.g., console.log('[AURA] Loaded manifest from: /path/to/project/...')). This makes it trivial to verify that the correct manifest file is being used in a deployed environment.

Strengthen integration tests for error shapes.

In an existing integration test that checks for a 400 or 401 error (like in agent.test.ts), add an assertion to verify that the error response body contains the exact expected keys (code, detail, etc.). This guards against accidental changes to the error contract that could break an agent's ability to parse responses.