// packages/reference-client/src/agent.ts
import 'dotenv/config';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import OpenAI from 'openai';
import { AuraManifest, AuraState } from '@aura/protocol';

// Enable cookie support
const cookieJar = new CookieJar();
const client = wrapper(axios.create({
  jar: cookieJar,
  withCredentials: true,
}));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Fetches the AURA manifest from a given base URL.
 */
async function fetchManifest(baseUrl: string): Promise<AuraManifest> {
    const manifestUrl = `${baseUrl}/.well-known/aura.json`;
    console.log(`[1/X] Fetching AURA manifest from ${manifestUrl}...`);
    const response = await client.get<AuraManifest>(manifestUrl);
    console.log(`[1/X] Success. Site: ${response.data.site.name}`);
    return response.data;
}

/**
 * Uses an LLM to decide which capability to use based on a user prompt.
 */
async function planAction(manifest: AuraManifest, prompt: string, state?: AuraState | null): Promise<{ capabilityId: string; args: any; }> {
    console.log(`[Planning] Analyzing prompt: "${prompt}"`);
    
    // Filter available capabilities based on current state
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

    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            {
                role: 'system',
                content: `You are an AI agent controller. Your task is to select the single best capability to fulfill the user's request. 
                Current site state: ${JSON.stringify(state, null, 2)}
                Available capabilities: ${availableCapabilities.join(', ')}`
            },
            { role: 'user', content: prompt }
        ],
        tools: tools as any,
        tool_choice: 'auto',
    });

    const toolCall = completion.choices[0].message.tool_calls?.[0];
    if (!toolCall) {
        throw new Error("LLM did not select a capability to execute.");
    }

    console.log(`[Planning] Selected capability: ${toolCall.function.name}`);
    return {
        capabilityId: toolCall.function.name,
        args: JSON.parse(toolCall.function.arguments),
    };
}

/**
 * Detects if a prompt requires multiple steps and breaks it down
 */
async function analyzePromptComplexity(prompt: string): Promise<string[]> {
    console.log(`[Analysis] Checking if prompt requires multiple steps...`);
    
    // Simple pattern-based detection for common multi-step patterns
    const loginThenCreatePattern = /login.*(?:and|then|,).*(?:create|post|add)/i;
    
    if (loginThenCreatePattern.test(prompt)) {
        console.log(`[Analysis] Detected login + create pattern`);
        
        // Extract email and password for login
        const emailMatch = prompt.match(/email\s+([^\s]+)/i);
        const passwordMatch = prompt.match(/password\s+([^\s,]+)/i);
        
        // Extract title and content for post
        const titleMatch = prompt.match(/title\s+['"]([^'"]+)['"]/i);
        const contentMatch = prompt.match(/content\s+['"]([^'"]+)['"]/i);
        
        if (emailMatch && passwordMatch) {
            const loginStep = `login with email ${emailMatch[1]} and password ${passwordMatch[1]}`;
            
            let createStep = 'create a new blog post';
            if (titleMatch && contentMatch) {
                createStep = `create a new blog post with title "${titleMatch[1]}" and content "${contentMatch[1]}"`;
            } else if (titleMatch) {
                createStep = `create a new blog post with title "${titleMatch[1]}"`;
            }
            
            const steps = [loginStep, createStep];
            console.log(`[Analysis] Broken down into ${steps.length} steps:`, steps);
            return steps;
        }
    }
    
    // Simple heuristics for other multi-step patterns
    const multiStepIndicators = [
        /(?:first|1\.)\s*\w+.*(?:second|2\.|then|next)/i,
        /\w+.*(?:and then|then)\s*\w+/i
    ];
    
    const hasMultipleSteps = multiStepIndicators.some(pattern => pattern.test(prompt));
    
    if (hasMultipleSteps) {
        console.log(`[Analysis] Multi-step operation detected, falling back to LLM parsing`);
        
        // Use LLM to break down complex prompts
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `Break down this user request into 2-3 ordered steps that can be accomplished via API calls. Each step should be a single action like "login with credentials" or "create blog post with title X". Return only the steps as a JSON array of strings.`
                },
                { role: 'user', content: prompt }
            ],
        });
        
        try {
            const response = completion.choices[0].message.content;
            const steps = JSON.parse(response || '[]');
            
            if (Array.isArray(steps) && steps.length > 1 && steps.length <= 3) {
                console.log(`[Analysis] LLM broke down into ${steps.length} steps:`, steps);
                return steps;
            }
        } catch (error) {
            console.log(`[Analysis] Failed to parse LLM steps, treating as single step`);
        }
    }
    
    console.log(`[Analysis] Single-step operation detected`);
    return [prompt];
}

/**
 * Simple URI template expansion for AURA protocol - handles only path parameters
 */
export function expandUriTemplate(template: string, args: any): string {
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
 * Maps arguments according to the capability's parameterMapping.
 * Uses JSON Pointer syntax (e.g., "/email" maps to args.email).
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
    const templateUrl = expandUriTemplate(capability.action.urlTemplate, args);
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
        const manifest = await fetchManifest(url);
        
        // Analyze if this is a multi-step operation
        const steps = await analyzePromptComplexity(prompt);
        
        let currentState: AuraState | null = null;
        const allResults: any[] = [];
        
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            console.log(`\n--- Step ${i + 1}/${steps.length}: "${step}" ---`);
            
            const { capabilityId, args } = await planAction(manifest, step, currentState);
            const result = await executeAction(url, manifest, capabilityId, args, i + 1, steps.length);
            
            allResults.push({
                step: i + 1,
                prompt: step,
                capability: capabilityId,
                status: result.status,
                data: result.data,
                state: result.state
            });
            
            // Update current state for next step
            currentState = result.state;
            
            console.log(`Step ${i + 1} Status:`, result.status);
            if (result.status >= 400) {
                console.log(`Step ${i + 1} Error:`, JSON.stringify(result.data, null, 2));
                if (steps.length > 1) {
                    console.log(`\n❌ Multi-step operation failed at step ${i + 1}. Stopping execution.`);
                    break;
                }
            } else {
                console.log(`Step ${i + 1} Success:`, JSON.stringify(result.data, null, 2));
            }
            
            // Brief pause between steps
            if (i < steps.length - 1) {
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