import axios from 'axios';
import { Command } from 'commander';
import OpenAI from 'openai';
import { WebSocketServer, WebSocket } from 'ws';
import { AuraManifest, Capability, AURAEvent, AuraState } from '@aura/protocol';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let wss: WebSocketServer | null = null;
let emissaryClient: WebSocket | null = null;
let openai: OpenAI;

// Cache directory for storing AURA state
const cacheDir = path.join(os.tmpdir(), 'aura-cli-cache');
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

function createWebSocketServer() {
  if (wss) {
    return wss;
  }
  
  wss = new WebSocketServer({ port: 8080 });
  console.log('AURA AI Core v1.3 is running. Waiting for Browser Adapter to connect on ws://localhost:8080...');

  wss.on('connection', (ws) => {
      console.log('Browser Adapter connected.');
      emissaryClient = ws;
      
      ws.on('message', (data) => {
        try {
          const event = JSON.parse(data.toString()) as AURAEvent;
          console.log('Received AURAEvent:', event);
          handleAURAEvent(event);
        } catch (error) {
          console.error('Error parsing AURAEvent:', error);
        }
      });
      
      ws.on('close', () => {
          console.log('Browser Adapter disconnected.');
          emissaryClient = null;
      });
      
      ws.on('error', (error) => {
          console.error('WebSocket Error:', error);
          emissaryClient = null;
      });
  });
  
  return wss;
}

function handleAURAEvent(event: AURAEvent) {
  switch (event.payload.type) {
    case 'AUTH_TOKEN_ACQUIRED':
      console.log('Auth token acquired:', event.payload.data);
      // Store auth token in cache
      fs.writeFileSync(
        path.join(cacheDir, 'auth-token.json'),
        JSON.stringify(event.payload.data)
      );
      break;
    case 'CAPTCHA_SOLVED':
      console.log('Captcha solved:', event.payload.data);
      break;
    case 'REDIRECT_OCCURRED':
      console.log('Redirect occurred:', event.payload.data);
      break;
  }
}

function parseAuraStateHeader(headers: any): AuraState | null {
  const auraStateHeader = headers['aura-state'];
  if (!auraStateHeader) return null;
  
  try {
    const decoded = Buffer.from(auraStateHeader, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch (error) {
    console.error('Error parsing AURA-State header:', error);
    return null;
  }
}

function buildHttpRequest(capability: Capability, args: Record<string, any>, baseUrl: string) {
  let url = `${baseUrl}${capability.action.urlTemplate}`;
  let params: Record<string, any> = {};
  let body: any = null;
  
  // Replace path parameters
  for (const [param, jsonPointer] of Object.entries(capability.action.parameterMapping)) {
    const value = jsonPointer === `/${param}` ? args[param] : null;
    if (value !== undefined && url.includes(`{${param}}`)) {
      url = url.replace(`{${param}}`, encodeURIComponent(value));
    } else if (value !== undefined) {
      params[param] = value;
    }
  }
  
  // Handle query parameters (RFC 6570 style)
  if (capability.action.encoding === 'query' || capability.action.method === 'GET') {
    const queryMatch = url.match(/\{[?&]([^}]+)\}/);
    if (queryMatch) {
      url = url.replace(queryMatch[0], '');
      const queryParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (Array.isArray(value)) {
          value.forEach(v => queryParams.append(key, v));
        } else if (value !== undefined) {
          queryParams.set(key, String(value));
        }
      }
      if (queryParams.toString()) {
        url += '?' + queryParams.toString();
      }
    }
  } else if (capability.action.method === 'POST' || capability.action.method === 'PUT' || capability.action.method === 'DELETE') {
    body = params;
  }
  
  return { url, body };
}

async function executeCapability(
  manifest: AuraManifest,
  capabilityId: string,
  args: Record<string, any>,
  baseUrl: string
) {
  const capability = manifest.capabilities[capabilityId];
  if (!capability) {
    throw new Error(`Capability ${capabilityId} not found`);
  }
  
  const { url, body } = buildHttpRequest(capability, args, baseUrl);
  
  console.log(`Executing ${capability.action.method} ${url}`);
  
  const headers: Record<string, string> = {
    'Content-Type': capability.action.encoding === 'json' ? 'application/json' : 'application/x-www-form-urlencoded',
  };
  
  // Add CSRF token if required
  if (capability.action.security?.csrf && capability.action.security.csrf.startsWith('header:')) {
    const headerName = capability.action.security.csrf.replace('header:', '');
    headers[headerName] = 'demo-csrf-token'; // In production, fetch this dynamically
  }
  
  // Add auth token if available
  const authTokenFile = path.join(cacheDir, 'auth-token.json');
  if (fs.existsSync(authTokenFile)) {
    const authData = JSON.parse(fs.readFileSync(authTokenFile, 'utf-8'));
    if (authData.token) {
      headers['Authorization'] = `Bearer ${authData.token}`;
    }
  }
  
  try {
    const response = await axios({
      method: capability.action.method,
      url,
      data: body,
      headers,
      validateStatus: () => true, // Don't throw on non-2xx status
    });
    
    // Parse AURA-State header
    const auraState = parseAuraStateHeader(response.headers);
    if (auraState) {
      console.log('AURA-State:', auraState);
      // Cache the state
      fs.writeFileSync(
        path.join(cacheDir, 'aura-state.json'),
        JSON.stringify(auraState)
      );
    }
    
    return {
      status: response.status,
      data: response.data,
      auraState,
    };
  } catch (error: any) {
    console.error('Error executing capability:', error.message);
    throw error;
  }
}

async function runAuraAgent(url: string, userPrompt: string, apiKey: string) {
  openai = new OpenAI({ apiKey });

  console.log(`[1/4] Fetching AURA manifest from ${url}/.well-known/aura.json...`);
  
  try {
    const response = await axios.get<AuraManifest>(`${url}/.well-known/aura.json`);
    const manifest = response.data;
    console.log(`[2/4] Capabilities found: ${Object.keys(manifest.capabilities).join(', ')}`);

    // Get current AURA state from cache
    let currentState: AuraState | null = null;
    const stateFile = path.join(cacheDir, 'aura-state.json');
    if (fs.existsSync(stateFile)) {
      currentState = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    }

    const systemPrompt = `You are an AI agent controller using AURA protocol v1.3. 
Your task is to determine which capability to execute based on the user's request.
Current AURA state: ${JSON.stringify(currentState, null, 2)}
User request: "${userPrompt}"
Available capabilities: ${JSON.stringify(manifest.capabilities, null, 2)}

Respond with a JSON object containing:
- capabilityId: the ID of the capability to execute
- arguments: an object with the parameters needed for the capability

Only respond with the raw JSON object and nothing else.`;

    console.log('[3/4] Requesting action plan from LLM...');
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }],
      response_format: { type: 'json_object' },
    });

    const actionPlan = completion.choices[0].message.content;
    if (!actionPlan) {
      throw new Error("LLM did not return a valid action plan.");
    }

    const { capabilityId, arguments: args } = JSON.parse(actionPlan);
    console.log(`[4/4] Executing capability: ${capabilityId}`);
    
    const result = await executeCapability(manifest, capabilityId, args, url);
    
    console.log('Result:', JSON.stringify(result, null, 2));
    
    // If not authenticated and login was attempted, save cookies
    if (capabilityId === 'login' && result.status === 200) {
      console.log('Login successful. Auth state updated.');
    }
    
  } catch (error: any) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

const program = new Command();
program
  .version('1.3.0')
  .description('AURA AI Core CLI v1.3')
  .option('-s, --server', 'Run in server mode only (WebSocket server)')
  .option('-t, --test', 'Send a test AURAEvent to connected adapter')
  .option('-u, --url <url>', 'URL of the AURA-enabled site')
  .option('-p, --prompt <prompt>', 'The command for the AI agent')
  .option('-k, --key <key>', 'OpenAI API Key')
  .option('-c, --clear-cache', 'Clear the AURA state cache')
  .action(async (options) => {
    if (options.clearCache) {
      console.log('Clearing AURA state cache...');
      fs.rmSync(cacheDir, { recursive: true, force: true });
      fs.mkdirSync(cacheDir, { recursive: true });
      console.log('Cache cleared.');
      return;
    }
    
    if (options.server) {
      createWebSocketServer();
      console.log('Running in server mode. WebSocket server is running on port 8080.');
      console.log('Press Ctrl+C to exit.');
      // Keep the process alive
      setInterval(() => {}, 1000);
      return;
    }
    
    if (options.test) {
      // Create server if it doesn't exist
      try {
        createWebSocketServer();
      } catch (error: any) {
        if (error.code === 'EADDRINUSE') {
          console.log('WebSocket server already running. Connecting to existing server...');
        } else {
          throw error;
        }
      }
      
      // Give a moment for connections to establish
      setTimeout(() => {
        if (emissaryClient && emissaryClient.readyState === WebSocket.OPEN) {
          const testEvent: AURAEvent = {
            protocol: 'AURAEvent',
            version: '1.0',
            eventId: 'test-' + Date.now(),
            payload: {
              type: 'AUTH_TOKEN_ACQUIRED',
              data: {
                token: 'test-auth-token',
                expiresAt: new Date(Date.now() + 3600000).toISOString(),
              }
            }
          };
          console.log('Sending test AURAEvent to adapter...');
          emissaryClient.send(JSON.stringify(testEvent));
          console.log('Test event sent successfully:', testEvent);
        } else {
          console.log('Adapter not connected. Make sure the browser extension is loaded and connected to the WebSocket server.');
        }
        process.exit(0);
      }, 1000);
      return;
    }
    
    if (!options.url || !options.prompt || !options.key) {
      console.error('Missing required options. Use -s for server mode, -t for test mode, or provide -u, -p, and -k for full operation.');
      process.exit(1);
    }
    
    createWebSocketServer();
    await runAuraAgent(options.url, options.prompt, options.key);
  });

program.parse(process.argv); 