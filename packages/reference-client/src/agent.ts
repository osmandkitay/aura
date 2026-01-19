// packages/reference-client/src/agent.ts
import 'dotenv/config';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import OpenAI from 'openai';
import { AuraManifest, AuraState, ParameterLocation } from 'aura-protocol';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';
import { parseTemplate } from 'url-template';

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

// === Step 2 Enhancement Constants ===
const PLANNING_TOOL_VERSION = '1.0';
const MAX_OPENAI_RETRIES = 3;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

    // Canonical planning function definition (with versioning)
    const planningTool = {
        type: 'function' as const,
        function: {
            name: 'create_execution_plan',
            description: `Creates a structured execution plan with multiple steps (v${PLANNING_TOOL_VERSION})`,
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

    // Retry logic for the OpenAI call
    let completion: OpenAI.Chat.Completions.ChatCompletion;
    for (let attempt = 1; attempt <= MAX_OPENAI_RETRIES; attempt++) {
        try {
            completion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `You are an AI agent controller (v${PLANNING_TOOL_VERSION}). You MUST use the create_execution_plan(version:${PLANNING_TOOL_VERSION}) function to return a structured plan for the user's request.\n\nCurrent site state: ${JSON.stringify(state, null, 2)}\nAvailable capabilities: ${availableCapabilities.join(', ')}\nEach step should contain:\n- capabilityId: the name of the capability to execute\n- args: an object containing the parameters for that capability`
                    },
                    { role: 'user', content: prompt }
                ],
                tools: [planningTool, ...tools] as any,
                tool_choice: { type: 'function', function: { name: 'create_execution_plan' } } as any,
            });
            break; // success
        } catch (error) {
            console.warn(`[Planning] OpenAI call failed on attempt ${attempt}/${MAX_OPENAI_RETRIES}.`, (error as Error).message);
            if (attempt === MAX_OPENAI_RETRIES) {
                throw error;
            }
            // Exponential backoff
            await sleep(1000 * attempt);
        }
    }

    const toolCall = completion!.choices[0].message.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== 'create_execution_plan') {
        throw new Error('LLM failed to generate an execution plan using the required create_execution_plan function.');
    }

    const planData = JSON.parse(toolCall.function.arguments);
    console.log(`[Planning] Execution plan generated with ${planData.steps.length} steps`);
    return planData.steps;
}



/**
 * Prepares the URL path by expanding URI templates using RFC 6570 compliant expansion.
 * This now supports all levels of RFC 6570 URI Templates including query parameters,
 * fragment expansion, path segments, and reserved string expansion.
 */
export function prepareUrlPath(template: string, args: any): string {
    try {
        // Parse and expand the template using RFC 6570 compliant library
        const uriTemplate = parseTemplate(template);
        return uriTemplate.expand(args);
    } catch (error) {
        console.warn(`[URI Template] Failed to expand template "${template}":`, error);
        // Fallback to original URL template if expansion fails
        return template;
    }
}

/**
 * Maps arguments from the LLM response to a new object based on the capability's
 * parameterMapping using proper JSON Pointer syntax (RFC 6901).
 *
 * This function now supports full JSON Pointer syntax including nested pointers.
 * Examples:
 * - `"/email"` maps to `args.email`
 * - `"/user/name"` maps to `args.user.name`
 * - `"/items/0/title"` maps to `args.items[0].title`
 * - `"/settings/theme/dark"` maps to `args.settings.theme.dark`
 *
 * @param args The arguments object, typically from the LLM.
 * @param parameterMapping The mapping from the capability definition.
 * @returns A new object with keys and values mapped for the HTTP request.
 */
export function mapParameters(args: any, parameterMapping: Record<string, string>): any {
    const mapped: any = {};
    
    for (const [paramName, jsonPointer] of Object.entries(parameterMapping)) {
        if (jsonPointer.startsWith('/')) {
            const value = resolveJsonPointer(args, jsonPointer);
            if (value !== undefined) {
                mapped[paramName] = value;
            }
        }
    }
    
    return mapped;
}

export interface ParameterBuckets {
    path: Record<string, any>;
    query: Record<string, any>;
    header: Record<string, any>;
    body: Record<string, any>;
    unassigned: Record<string, any>;
}

/**
 * Splits parameters into path/query/header/body buckets based on parameterLocation.
 * Any parameters without an explicit location are returned in "unassigned".
 */
export function splitParametersByLocation(
    params: Record<string, any>,
    parameterLocation?: Record<string, ParameterLocation>
): ParameterBuckets {
    const buckets: ParameterBuckets = {
        path: {},
        query: {},
        header: {},
        body: {},
        unassigned: {}
    };

    if (!parameterLocation || Object.keys(parameterLocation).length === 0) {
        buckets.unassigned = { ...params };
        return buckets;
    }

    for (const [key, value] of Object.entries(params)) {
        const location = parameterLocation[key];
        if (!location) {
            buckets.unassigned[key] = value;
            continue;
        }

        switch (location) {
            case 'path':
                buckets.path[key] = value;
                break;
            case 'query':
                buckets.query[key] = value;
                break;
            case 'header':
                buckets.header[key] = value;
                break;
            case 'body':
                buckets.body[key] = value;
                break;
            default:
                buckets.unassigned[key] = value;
                break;
        }
    }

    return buckets;
}

/**
 * Resolves a JSON Pointer path to its value in the given object.
 * Implements RFC 6901 JSON Pointer specification.
 * 
 * @param obj The object to traverse
 * @param pointer The JSON Pointer string (e.g., "/user/name" or "/items/0/title")
 * @returns The resolved value or undefined if path doesn't exist
 */
export function resolveJsonPointer(obj: any, pointer: string): any {
    if (pointer === '') return obj;
    if (!pointer.startsWith('/')) return undefined;
    
    // Split path and decode special characters
    const tokens = pointer.slice(1).split('/').map(token => {
        // JSON Pointer escape sequences: ~1 becomes /, ~0 becomes ~
        return token.replace(/~1/g, '/').replace(/~0/g, '~');
    });
    
    let current = obj;
    for (const token of tokens) {
        if (current === null || current === undefined) {
            return undefined;
        }
        
        // Handle array indices and object properties
        if (Array.isArray(current)) {
            const index = parseInt(token, 10);
            if (isNaN(index) || index < 0 || index >= current.length) {
                return undefined;
            }
            current = current[index];
        } else if (typeof current === 'object') {
            current = current[token];
        } else {
            return undefined;
        }
    }
    
    return current;
}

/**
 * Executes the chosen capability via a direct HTTP request.
 * Honors the capability's encoding and parameterMapping properties.
 */
async function executeAction(baseUrl: string, manifest: AuraManifest, capabilityId: string, args: any, stepNumber: number, totalSteps: number): Promise<{ status: number; data: any; state: AuraState | null; }> {
    console.log(`[${stepNumber}/${totalSteps}] Executing capability "${capabilityId}"...`);
    const capability = manifest.capabilities[capabilityId];
    if (!capability) throw new Error(`Capability ${capabilityId} not found.`);

    // Map parameters if parameterMapping is defined
    let parametersToUse = args;
    if (capability.action.parameterMapping) {
        parametersToUse = mapParameters(args, capability.action.parameterMapping);
    }

    const hasParameterLocation = !!(capability.action.parameterLocation && Object.keys(capability.action.parameterLocation).length > 0);
    const parameterBuckets = splitParametersByLocation(parametersToUse, capability.action.parameterLocation);
    const templateArgs = hasParameterLocation
        ? { ...parameterBuckets.path, ...parameterBuckets.query, ...parameterBuckets.unassigned }
        : parametersToUse;

    // Expand URI template with proper RFC 6570 support
    const expandedUrl = prepareUrlPath(capability.action.urlTemplate, templateArgs);
    const fullUrl = `${baseUrl}${expandedUrl}`;

    // Determine request data based on encoding
    let requestData: any = null;
    let queryParams: any = null;
    let requestHeaders: Record<string, any> | undefined = undefined;

    const fallbackParams = hasParameterLocation ? parameterBuckets.unassigned : parametersToUse;

    // For URI templates that include query parameters (e.g., {?param1,param2}),
    // the expansion already handles them, so we only send body data for non-GET methods
    const urlObj = new URL(fullUrl, baseUrl);
    const urlHasQueryParams = urlObj.search !== '';

    if (hasParameterLocation) {
        if (Object.keys(parameterBuckets.header).length > 0) {
            requestHeaders = { ...parameterBuckets.header };
        }

        if (Object.keys(parameterBuckets.query).length > 0 && !urlHasQueryParams) {
            queryParams = { ...parameterBuckets.query };
        }

        if (Object.keys(parameterBuckets.body).length > 0) {
            requestData = { ...parameterBuckets.body };
        }
    }

    if (Object.keys(fallbackParams).length > 0) {
        if (capability.action.encoding === 'json') {
            requestData = requestData ? { ...requestData, ...fallbackParams } : fallbackParams;
        } else if (capability.action.encoding === 'query') {
            if (!urlHasQueryParams) {
                queryParams = queryParams ? { ...queryParams, ...fallbackParams } : fallbackParams;
            }
        } else {
            // Fallback to method-based logic for capabilities without explicit encoding
            if (capability.action.method === 'GET' || capability.action.method === 'DELETE') {
                if (!urlHasQueryParams) {
                    queryParams = queryParams ? { ...queryParams, ...fallbackParams } : fallbackParams;
                }
            } else {
                const hasQueryInTemplate = fullUrl.includes('?');
                if (!hasQueryInTemplate) {
                    requestData = requestData ? { ...requestData, ...fallbackParams } : fallbackParams;
                }
            }
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
        headers: requestHeaders,
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
        let executionPlan:
          { capabilityId: string; args: any }[] | undefined;
        try {
          executionPlan = await createExecutionPlan(manifest, prompt, null);
        } catch (error) {
          console.error('Failed to create an execution plan after multiple retries.', error);
          throw error; // Re-throw to be caught by outer catch
        }
        
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
