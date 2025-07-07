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
    console.log(`[1/3] Fetching AURA manifest from ${manifestUrl}...`);
    const response = await client.get<AuraManifest>(manifestUrl);
    console.log(`[1/3] Success. Site: ${response.data.site.name}`);
    return response.data;
}

/**
 * Uses an LLM to decide which capability to use based on a user prompt.
 */
async function planAction(manifest: AuraManifest, prompt: string, state?: AuraState | null): Promise<{ capabilityId: string; args: any; }> {
    console.log(`[2/3] Planning action for prompt: "${prompt}"`);
    const tools = Object.values(manifest.capabilities).map(cap => ({
        type: 'function' as const,
        function: {
            name: cap.id,
            description: cap.description,
            parameters: cap.parameters || { type: 'object', properties: {} },
        },
    }));

    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            {
                role: 'system',
                content: `You are an AI agent controller. Your task is to select the single best capability to fulfill the user's request. Current site state is: ${JSON.stringify(state, null, 2)}`
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

    console.log(`[2/3] LLM selected capability: ${toolCall.function.name}`);
    return {
        capabilityId: toolCall.function.name,
        args: JSON.parse(toolCall.function.arguments),
    };
}

/**
 * Simple URI template expansion for AURA protocol
 */
function expandUriTemplate(template: string, args: any): { url: string; queryParams: any } {
    let url = template;
    let queryParams: any = {};

    // Handle query parameter templates like {?param1,param2,param3*}
    const queryMatch = url.match(/\{\?([^}]+)\}/);
    if (queryMatch) {
        const queryParamSpec = queryMatch[1];
        const paramNames = queryParamSpec.split(',');
        
        // Remove the query template from URL
        url = url.replace(/\{\?[^}]+\}/, '');
        
        // Process each parameter
        paramNames.forEach(paramName => {
            const isExploded = paramName.endsWith('*');
            const cleanParamName = isExploded ? paramName.slice(0, -1) : paramName;
            
            if (args[cleanParamName] !== undefined) {
                if (isExploded && Array.isArray(args[cleanParamName])) {
                    // For exploded arrays, add each item as a separate parameter
                    args[cleanParamName].forEach((item: any) => {
                        if (!queryParams[cleanParamName]) {
                            queryParams[cleanParamName] = [];
                        }
                        queryParams[cleanParamName].push(item);
                    });
                } else {
                    queryParams[cleanParamName] = args[cleanParamName];
                }
            }
        });
    }

    // Handle path parameters like {id}
    Object.keys(args).forEach(paramKey => {
        const paramValue = args[paramKey];
        if (paramValue !== undefined) {
            url = url.replace(`{${paramKey}}`, encodeURIComponent(paramValue));
        }
    });

    return { url, queryParams };
}

/**
 * Executes the chosen capability via a direct HTTP request.
 */
async function executeAction(baseUrl: string, manifest: AuraManifest, capabilityId: string, args: any): Promise<{ status: number; data: any; state: AuraState | null; }> {
    console.log(`[3/3] Executing capability "${capabilityId}"...`);
    const capability = manifest.capabilities[capabilityId];
    if (!capability) throw new Error(`Capability ${capabilityId} not found.`);

    // Expand URI template properly
    const { url: templateUrl, queryParams } = expandUriTemplate(capability.action.urlTemplate, args);
    const fullUrl = `${baseUrl}${templateUrl}`;

    console.log(`[3/3] Expanded URL: ${fullUrl}`, queryParams ? `with params: ${JSON.stringify(queryParams)}` : '');

    const response = await client({
        method: capability.action.method,
        url: fullUrl,
        data: (capability.action.method !== 'GET' && capability.action.method !== 'DELETE') ? args : null,
        params: (capability.action.method === 'GET' || capability.action.method === 'DELETE') ? queryParams : null,
        validateStatus: () => true, // Accept all status codes
    });

    const auraStateHeader = response.headers['aura-state'];
    let auraState: AuraState | null = null;
    if (auraStateHeader) {
        auraState = JSON.parse(Buffer.from(auraStateHeader, 'base64').toString('utf-8'));
    }

    console.log(`[3/3] Execution complete. Status: ${response.status}`);
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
        const { capabilityId, args } = await planAction(manifest, prompt);
        const result = await executeAction(url, manifest, capabilityId, args);

        console.log('\n--- Execution Result ---');
        console.log('Status:', result.status);
        console.log('Data:', JSON.stringify(result.data, null, 2));
        console.log('New AURA-State:', JSON.stringify(result.state, null, 2));
        console.log('----------------------\n');

    } catch (error) {
        console.error("\nAn error occurred:", (error as Error).message);
    }
}

main(); 