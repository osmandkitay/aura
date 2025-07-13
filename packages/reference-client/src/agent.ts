// packages/reference-client/src/agent.ts
import 'dotenv/config';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import OpenAI from 'openai';
import { AuraManifest, AuraState } from '@aura/protocol';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';

// Define persistent storage path for cookies
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COOKIE_FILE_PATH = path.join(__dirname, '.aura-cookies.json');

// Enable cookie support
let cookieJar: CookieJar = new CookieJar();
const client = wrapper(axios.create({
  jar: cookieJar,
  withCredentials: true,
}));

/**
 * Loads the CookieJar from the persistent file.
 * Returns a new CookieJar if the file doesn't exist or cannot be read.
 */
async function loadCookieJar(): Promise<CookieJar> {
  try {
    if (fs.existsSync(COOKIE_FILE_PATH)) {
      const cookieJson = await fs.promises.readFile(COOKIE_FILE_PATH, 'utf-8');
      const deserializedJar = JSON.parse(cookieJson);
      return CookieJar.fromJSON(deserializedJar);
    }
  } catch (error) {
    console.warn('[State] Could not load cookies, starting a new session.', error);
  }
  return new CookieJar();
}

/**
 * Saves the CookieJar to the persistent file.
 */
async function saveCookieJar(jar: CookieJar): Promise<void> {
  try {
    const cookieJson = JSON.stringify(jar.toJSON(), null, 2);
    await fs.promises.writeFile(COOKIE_FILE_PATH, cookieJson, 'utf-8');
  } catch (error) {
    console.error('[State] Failed to save cookies.', error);
  }
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Loads and compiles the AURA JSON Schema for validation.
 */
function loadAuraSchema() {
    const schemaPath = path.join(__dirname, '../../aura-protocol/dist/aura-v1.0.schema.json');
    
    if (!fs.existsSync(schemaPath)) {
        throw new Error(`AURA schema not found at ${schemaPath}. Please run 'pnpm build' in the aura-protocol package.`);
    }
    
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
    const schema = JSON.parse(schemaContent);
    
    const ajv = new Ajv({
        allErrors: true,
        verbose: true,
        strict: false // Allow additional keywords from TypeScript JSON Schema
    });
    
    return ajv.compile(schema);
}

/**
 * Fetches the AURA manifest from a given base URL with comprehensive error handling and validation.
 */
async function fetchManifest(baseUrl: string): Promise<AuraManifest> {
    const manifestUrl = `${baseUrl}/.well-known/aura.json`;
    console.log(`[1/X] Fetching AURA manifest from ${manifestUrl}...`);
    
    try {
        // Make the HTTP request with proper error handling
        const response = await client.get<AuraManifest>(manifestUrl, {
            timeout: 10000, // 10 second timeout
            validateStatus: (status) => status >= 200 && status < 300 // Only accept success codes
        });
        
        // Validate response content type
        const contentType = response.headers['content-type'];
        if (!contentType || !contentType.includes('application/json')) {
            console.warn(`[1/X] Warning: Unexpected content type: ${contentType}`);
        }
        
        // Validate the manifest against JSON Schema
        const validateSchema = loadAuraSchema();
        const isValid = validateSchema(response.data);
        
        if (!isValid) {
            console.error(`[1/X] ❌ Manifest validation failed:`);
            validateSchema.errors?.forEach((error) => {
                const instancePath = error.instancePath || '/';
                console.error(`  - ${instancePath}: ${error.message}`);
            });
            throw new Error(`Invalid AURA manifest: Schema validation failed`);
        }
        
        console.log(`[1/X] ✅ Success. Site: ${response.data.site.name}`);
        console.log(`[1/X] ✅ Manifest validated successfully`);
        
        return response.data;
        
    } catch (error: any) {
        // Handle different types of errors with specific messages
        if (error.code === 'ECONNREFUSED') {
            throw new Error(`Connection refused: Cannot reach server at ${baseUrl}. Is the server running?`);
        } else if (error.code === 'ENOTFOUND') {
            throw new Error(`Host not found: ${baseUrl}. Please check the URL.`);
        } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            throw new Error(`Request timeout: Server at ${baseUrl} took too long to respond.`);
        } else if (error.response) {
            // Server responded with error status
            const status = error.response.status;
            const statusText = error.response.statusText;
            
            if (status === 404) {
                throw new Error(`AURA manifest not found at ${manifestUrl}. This site may not support the AURA protocol.`);
            } else if (status === 403) {
                throw new Error(`Access forbidden: Cannot access AURA manifest at ${manifestUrl}.`);
            } else if (status >= 500) {
                throw new Error(`Server error (${status}): ${statusText}. Please try again later.`);
            } else {
                throw new Error(`HTTP error (${status}): ${statusText}`);
            }
        } else if (error.message.includes('Invalid AURA manifest')) {
            // Re-throw validation errors as-is
            throw error;
        } else if (error.message.includes('JSON')) {
            throw new Error(`Invalid JSON response from ${manifestUrl}. The server may not be returning valid AURA manifest.`);
        } else {
            // Generic error
            throw new Error(`Failed to fetch AURA manifest from ${manifestUrl}: ${error.message}`);
        }
    }
}

/**
 * Creates a complete execution plan for a user prompt, breaking it down into structured steps.
 * Each step contains both the capability to execute and its arguments.
 */
async function createExecutionPlan(manifest: AuraManifest, prompt: string, state?: AuraState | null): Promise<{ capabilityId: string; args: any; }[]> {
    console.log(`[Planning] Creating execution plan for prompt: "${prompt}"`);

    const availableCapabilities = state?.capabilities || Object.keys(manifest.capabilities);
    const tools = availableCapabilities.map(capId => {
        const cap = manifest.capabilities[capId];
        if (!cap) return null;
        return {
            type: 'function' as const,
            function: {
                name: cap.id,
                description: cap.description,
                parameters: cap.parameters || { type: 'object', properties: {} },
            },
        };
    }).filter(Boolean);

    // Add a special planning function that returns structured execution plan
    const planningTool = {
        type: 'function' as const,
        function: {
            name: 'create_execution_plan',
            description: 'Creates a structured execution plan with multiple steps',
            parameters: {
                type: 'object',
                properties: {
                    steps: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                capabilityId: { type: 'string' },
                                args: { type: 'object' }
                            },
                            required: ['capabilityId', 'args']
                        }
                    }
                },
                required: ['steps']
            }
        }
    };

    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            {
                role: 'system',
                content: `You are an AI agent controller. Your task is to analyze the user's request and break it down into a sequence of executable steps.
                
                If the request requires multiple steps, use the create_execution_plan function to return a structured plan.
                If the request is a single step, you can either use create_execution_plan with one step, or call the capability directly.
                
                Current site state: ${JSON.stringify(state, null, 2)}
                Available capabilities: ${availableCapabilities.join(', ')}
                
                Each step should contain:
                - capabilityId: the name of the capability to execute
                - args: an object containing the parameters for that capability
                
                Break down complex requests like "login and create a post" into separate steps.`
            },
            { role: 'user', content: prompt }
        ],
        tools: [planningTool, ...tools] as any,
        tool_choice: 'auto',
    });

    const toolCall = completion.choices[0].message.tool_calls?.[0];
    if (!toolCall) {
        throw new Error("LLM failed to generate an execution plan.");
    }

    console.log(`[Planning] LLM selected tool: ${toolCall.function.name}`);
    
    if (toolCall.function.name === 'create_execution_plan') {
        // Multi-step plan
        const planData = JSON.parse(toolCall.function.arguments);
        console.log(`[Planning] Multi-step plan generated with ${planData.steps.length} steps`);
        return planData.steps;
    } else {
        // Single step - capability called directly
        console.log(`[Planning] Single-step plan: ${toolCall.function.name}`);
        return [{
            capabilityId: toolCall.function.name,
            args: JSON.parse(toolCall.function.arguments),
        }];
    }
}



/**
 * Prepares the URL path by expanding path parameters (e.g., /posts/{id}) and
 * stripping the query parameter template (e.g., {?limit,offset}).
 * Query parameters are handled separately during the request execution.
 */
export function prepareUrlPath(template: string, args: any): string {
    let url = template;

    // Remove any query parameter templates from the URL template
    // (these will be handled by executeAction based on encoding/parameterMapping)
    url = url.replace(/\{\?[^}]+\}/, '');

    // Handle path parameters like {id}
    Object.keys(args).forEach(paramKey => {
        const paramValue = args[paramKey];
        if (paramValue !== undefined) {
            url = url.replace(`{${paramKey}}`, encodeURIComponent(paramValue));
        }
    });

    return url;
}

/**
 * Maps arguments from the LLM response to a new object based on the capability's
 * parameterMapping.
 *
 * This function uses a simplified implementation of JSON Pointer syntax.
 * It currently only supports top-level, non-nested pointers.
 * For example:
 * - `"/email"` maps to `args.email`
 * - `"/title"` maps to `args.title`
 *
 * Nested pointers like `"/user/name"` are not supported in this reference client.
 *
 * @param args The arguments object, typically from the LLM.
 * @param parameterMapping The mapping from the capability definition.
 * @returns A new object with keys and values mapped for the HTTP request.
 */
function mapParameters(args: any, parameterMapping: Record<string, string>): any {
    const mapped: any = {};
    
    for (const [paramName, jsonPointer] of Object.entries(parameterMapping)) {
        // Simple JSON Pointer implementation for basic cases like "/email", "/title", etc.
        if (jsonPointer.startsWith('/')) {
            const key = jsonPointer.slice(1); // Remove leading "/"
            if (args[key] !== undefined) {
                mapped[paramName] = args[key];
            }
        }
    }
    
    return mapped;
}

/**
 * Executes the chosen capability via a direct HTTP request.
 * Honors the capability's encoding and parameterMapping properties.
 */
async function executeAction(baseUrl: string, manifest: AuraManifest, capabilityId: string, args: any, stepNumber: number, totalSteps: number): Promise<{ status: number; data: any; state: AuraState | null; }> {
    console.log(`[${stepNumber}/${totalSteps}] Executing capability "${capabilityId}"...`);
    const capability = manifest.capabilities[capabilityId];
    if (!capability) throw new Error(`Capability ${capabilityId} not found.`);

    // Expand URI template for path parameters only
    const templateUrl = prepareUrlPath(capability.action.urlTemplate, args);
    const fullUrl = `${baseUrl}${templateUrl}`;

    // Determine request data and params based on encoding and parameterMapping
    let requestData: any = null;
    let queryParams: any = null;

    if (capability.action.parameterMapping) {
        // Use parameterMapping to map args to the request
        const mappedParams = mapParameters(args, capability.action.parameterMapping);
        
        // Determine where to put the mapped parameters based on encoding
        if (capability.action.encoding === 'json') {
            // Send parameters in request body as JSON
            requestData = mappedParams;
        } else if (capability.action.encoding === 'query') {
            // Send parameters as query string
            queryParams = mappedParams;
        } else {
            // Fallback to method-based logic for capabilities without explicit encoding
            if (capability.action.method === 'GET' || capability.action.method === 'DELETE') {
                queryParams = mappedParams;
            } else {
                requestData = mappedParams;
            }
        }
    } else {
        // Fallback for capabilities without parameterMapping (use raw args)
        if (capability.action.method === 'GET' || capability.action.method === 'DELETE') {
            queryParams = args;
        } else {
            requestData = args;
        }
    }

    const paramsInfo = queryParams ? `with query params: ${JSON.stringify(queryParams)}` : '';
    const dataInfo = requestData ? `with body data: ${JSON.stringify(requestData)}` : '';
    console.log(`[${stepNumber}/${totalSteps}] Expanded URL: ${fullUrl} ${paramsInfo} ${dataInfo}`);

    const response = await client({
        method: capability.action.method,
        url: fullUrl,
        data: requestData,
        params: queryParams,
        validateStatus: () => true, // Accept all status codes
    });

    // Save the state of the cookie jar after the request
    await saveCookieJar(cookieJar);

    const auraStateHeader = response.headers['aura-state'];
    let auraState: AuraState | null = null;
    if (auraStateHeader) {
        auraState = JSON.parse(Buffer.from(auraStateHeader, 'base64').toString('utf-8'));
    }

    console.log(`[${stepNumber}/${totalSteps}] Execution complete. Status: ${response.status}`);
    return { status: response.status, data: response.data, state: auraState };
}

// Main execution flow
async function main() {
    const url = process.argv[2];
    const prompt = process.argv[3];

    if (!url || !prompt) {
        console.error('Usage: npm run agent <url> "<prompt>"');
        process.exit(1);
    }

    try {
        // Load persistent cookie jar
        cookieJar = await loadCookieJar();
        client.defaults.jar = cookieJar;

        const manifest = await fetchManifest(url);
        
        // Get the full execution plan ONCE at the beginning
        const executionPlan = await createExecutionPlan(manifest, prompt, null);
        
        let currentState: AuraState | null = null;
        const allResults: any[] = [];
        
        for (let i = 0; i < executionPlan.length; i++) {
            const step = executionPlan[i];
            const { capabilityId, args } = step;
            
            console.log(`\n--- Step ${i + 1}/${executionPlan.length}: Executing "${capabilityId}" ---`);
            
            // No need to plan again, just execute!
            const result = await executeAction(url, manifest, capabilityId, args, i + 1, executionPlan.length);
            
            allResults.push({
                step: i + 1,
                capability: capabilityId,
                args: args,
                status: result.status,
                data: result.data,
                state: result.state
            });
            
            // Update current state for next step
            currentState = result.state;
            
            console.log(`Step ${i + 1} Status:`, result.status);
            if (result.status >= 400) {
                console.log(`Step ${i + 1} Error:`, JSON.stringify(result.data, null, 2));
                if (executionPlan.length > 1) {
                    console.log(`\n❌ Multi-step operation failed at step ${i + 1}. Stopping execution.`);
                    break;
                }
            } else {
                console.log(`Step ${i + 1} Success:`, JSON.stringify(result.data, null, 2));
            }
            
            // Brief pause between steps
            if (i < executionPlan.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        console.log('\n=== FINAL EXECUTION SUMMARY ===');
        allResults.forEach((result, index) => {
            console.log(`Step ${index + 1}: ${result.capability} - Status ${result.status}`);
        });
        
        if (allResults.length > 0) {
            const finalResult = allResults[allResults.length - 1];
            console.log('\nFinal AURA-State:', JSON.stringify(finalResult.state, null, 2));
        }
        console.log('===============================\n');

    } catch (error) {
        console.error("\n❌ An error occurred:", (error as Error).message);
    }
}

// Avoid executing the CLI flow when the module is imported in a test environment
if (process.env.NODE_ENV !== 'test') {
  main();
} 