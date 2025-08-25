import { AuraAdapter, ExecutionResult } from './AuraAdapter.js';
import type { AuraManifest, AuraState } from 'aura-protocol';

/**
 * MCP Request structure for AURA capability execution
 */
export interface MCPRequest {
  /** The target AURA site URL */
  siteUrl: string;
  /** The capability ID to execute */
  capabilityId: string;
  /** Arguments for the capability */
  args?: Record<string, any>;
  /** Optional request ID for tracking */
  requestId?: string;
}

/**
 * MCP Response structure for AURA capability execution
 */
export interface MCPResponse {
  /** Whether the request was successful */
  success: boolean;
  /** HTTP status code from the AURA server */
  status?: number;
  /** Response data from the capability execution */
  data?: any;
  /** Updated AURA state after execution */
  state?: AuraState | null;
  /** Error message if the request failed */
  error?: string;
  /** Request ID for tracking (if provided in request) */
  requestId?: string;
  /** Available capabilities in the current state */
  availableCapabilities?: string[];
  /** Site manifest information */
  manifest?: {
    siteName: string;
    siteUrl: string;
    capabilities: string[];
  };
}

/**
 * Cache for AuraAdapter instances to reuse connections
 * Key: siteUrl, Value: AuraAdapter instance
 */
const adapterCache = new Map<string, AuraAdapter>();

/**
 * Gets or creates an AuraAdapter instance for the given site URL
 * @param siteUrl - The base URL of the AURA-enabled site
 * @returns Promise resolving to a connected AuraAdapter instance
 */
async function getOrCreateAdapter(siteUrl: string): Promise<AuraAdapter> {
  // Normalize the site URL (remove trailing slash)
  const normalizedUrl = siteUrl.replace(/\/$/, '');
  
  // Check if we already have a connected adapter for this site
  let adapter = adapterCache.get(normalizedUrl);
  
  if (!adapter) {
    // Create new adapter and connect
    adapter = new AuraAdapter(normalizedUrl);
    await adapter.connect();
    adapterCache.set(normalizedUrl, adapter);
  } else if (!adapter.isReady()) {
    // Reconnect if the adapter is not ready
    await adapter.connect();
  }
  
  return adapter;
}

/**
 * Main MCP handler function that processes MCP requests and translates them to AURA calls
 * 
 * This is the thin glue layer that:
 * 1. Accepts MCP request objects
 * 2. Gets or creates an AuraAdapter instance for the target site
 * 3. Translates the MCP request into adapter.execute() calls
 * 4. Formats the ExecutionResult into MCP response structure
 * 
 * @param request - The MCP request object
 * @returns Promise resolving to the MCP response
 */
export async function handleMCPRequest(request: MCPRequest): Promise<MCPResponse> {
  const startTime = Date.now();
  
  try {
    // Validate the request
    if (!request.siteUrl) {
      return {
        success: false,
        status: 400, // Client-side validation error
        error: 'Missing required field: siteUrl',
        requestId: request.requestId,
      };
    }
    
    if (!request.capabilityId) {
      return {
        success: false,
        status: 400, // Client-side validation error
        error: 'Missing required field: capabilityId',
        requestId: request.requestId,
      };
    }

    console.log(`[MCP Handler] Processing request for capability "${request.capabilityId}" on site "${request.siteUrl}"`);

    // Get or create the adapter instance
    const adapter = await getOrCreateAdapter(request.siteUrl);
    
    // Execute the capability
    const result: ExecutionResult = await adapter.execute(
      request.capabilityId, 
      request.args || {}
    );

    // Get additional context for the response
    const availableCapabilities = adapter.getAvailableCapabilities();
    const manifest = adapter.getManifest();

    const duration = Date.now() - startTime;
    console.log(`[MCP Handler] Request completed in ${duration}ms with status ${result.status}`);

    // Format the response for MCP
    const response: MCPResponse = {
      success: result.status >= 200 && result.status < 400,
      status: result.status,
      data: result.data,
      state: result.state,
      requestId: request.requestId,
      availableCapabilities,
    };

    // Include manifest information if available
    if (manifest) {
      response.manifest = {
        siteName: manifest.site.name,
        siteUrl: manifest.site.url,
        capabilities: Object.keys(manifest.capabilities),
      };
    }

    return response;

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    console.error(`[MCP Handler] Request failed after ${duration}ms:`, errorMessage);

    return {
      success: false,
      status: 400, // Client-side error for pre-flight validation failures
      error: errorMessage,
      requestId: request.requestId,
    };
  }
}

/**
 * Batch handler for processing multiple MCP requests concurrently
 * @param requests - Array of MCP requests to process
 * @returns Promise resolving to array of MCP responses
 */
export async function handleMCPRequestBatch(requests: MCPRequest[]): Promise<MCPResponse[]> {
  console.log(`[MCP Handler] Processing batch of ${requests.length} requests`);
  
  const startTime = Date.now();
  
  try {
    // Process all requests concurrently
    const responses = await Promise.all(
      requests.map(request => handleMCPRequest(request))
    );
    
    const duration = Date.now() - startTime;
    const successCount = responses.filter(r => r.success).length;
    
    console.log(`[MCP Handler] Batch completed in ${duration}ms: ${successCount}/${requests.length} successful`);
    
    return responses;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Batch processing failed';
    
    console.error(`[MCP Handler] Batch failed after ${duration}ms:`, errorMessage);
    
    // Return error responses for all requests
    return requests.map(request => ({
      success: false,
      status: 400, // Client-side error for batch processing failures
      error: errorMessage,
      requestId: request.requestId,
    }));
  }
}

/**
 * Gets information about a site's capabilities without executing anything
 * @param siteUrl - The base URL of the AURA-enabled site
 * @returns Promise resolving to site information and capabilities
 */
export async function getSiteInfo(siteUrl: string): Promise<MCPResponse> {
  try {
    console.log(`[MCP Handler] Fetching site info for "${siteUrl}"`);
    
    const adapter = await getOrCreateAdapter(siteUrl);
    const manifest = adapter.getManifest();
    const availableCapabilities = adapter.getAvailableCapabilities();
    const currentState = adapter.getCurrentState();

    if (!manifest) {
      return {
        success: false,
        error: 'Failed to load site manifest',
      };
    }

    return {
      success: true,
      state: currentState,
      availableCapabilities,
      manifest: {
        siteName: manifest.site.name,
        siteUrl: manifest.site.url,
        capabilities: Object.keys(manifest.capabilities),
      },
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch site info';
    console.error(`[MCP Handler] Site info request failed:`, errorMessage);
    
    return {
      success: false,
      status: 400, // Client-side error for site info request failures
      error: errorMessage,
    };
  }
}

/**
 * Clears the adapter cache (useful for testing or forcing reconnections)
 */
export function clearAdapterCache(): void {
  console.log(`[MCP Handler] Clearing adapter cache (${adapterCache.size} entries)`);
  adapterCache.clear();
}

/**
 * Gets the current cache status (for debugging/monitoring)
 */
export function getCacheStatus(): { size: number; sites: string[] } {
  return {
    size: adapterCache.size,
    sites: Array.from(adapterCache.keys()),
  };
}
