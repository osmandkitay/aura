import axios, { AxiosInstance } from 'axios';
import { CookieJar } from 'tough-cookie';
import { AuraManifest, AuraState } from 'aura-protocol';
import Ajv from 'ajv';
import { parseTemplate } from 'url-template';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Result structure returned by the execute method
 */
export interface ExecutionResult {
  status: number;
  data: any;
  state: AuraState | null;
}

/**
 * AuraAdapter - Core class for managing all communication with an AURA-enabled site
 * 
 * This class handles:
 * - Manifest fetching and validation
 * - Session state management via cookies
 * - Capability execution with proper parameter mapping
 * - AURA-State header parsing and management
 */
export class AuraAdapter {
  private baseUrl: string;
  private manifest: AuraManifest | null = null;
  private currentState: AuraState | null = null;
  private httpClient: AxiosInstance;
  private cookieJar: CookieJar;
  private isConnected: boolean = false;

  /**
   * Creates a new AuraAdapter instance for the specified AURA site
   * @param siteUrl - The base URL of the AURA-enabled site (e.g., 'http://localhost:3000')
   */
  constructor(siteUrl: string) {
    this.baseUrl = siteUrl.replace(/\/$/, ''); // Remove trailing slash
    this.cookieJar = new CookieJar();
    
    // Create axios instance with cookie support
    this.httpClient = axios.create({
      withCredentials: true,
      timeout: 10000, // 10 second timeout
      validateStatus: () => true, // Accept all status codes for manual handling
    });

    // Setup cookie jar integration
    this.setupCookieSupport();
  }

  /**
   * Sets up cookie support for the HTTP client
   */
  private setupCookieSupport(): void {
    // Request interceptor to add cookies
    this.httpClient.interceptors.request.use(async (config) => {
      if (config.url) {
        const cookies = await this.cookieJar.getCookieString(config.url);
        if (cookies) {
          config.headers.Cookie = cookies;
        }
      }
      return config;
    });

    // Response interceptor to store cookies
    this.httpClient.interceptors.response.use(async (response) => {
      const setCookieHeaders = response.headers['set-cookie'];
      if (setCookieHeaders && response.config.url) {
        for (const cookie of setCookieHeaders) {
          await this.cookieJar.setCookie(cookie, response.config.url);
        }
      }
      return response;
    });
  }

  /**
   * Fetches and validates the aura.json manifest. Must be called before other methods.
   * @throws {Error} If the manifest cannot be fetched or is invalid
   */
  async connect(): Promise<void> {
    const manifestUrl = `${this.baseUrl}/.well-known/aura.json`;
    
    try {
      console.log(`[AuraAdapter] Fetching AURA manifest from ${manifestUrl}...`);
      
      const response = await this.httpClient.get<AuraManifest>(manifestUrl);
      
      if (response.status !== 200) {
        throw new Error(`Failed to fetch manifest: HTTP ${response.status}`);
      }

      if (!response.data || typeof response.data !== 'object') {
        throw new Error('Invalid manifest: response is not a valid JSON object');
      }

      // Async manifest validation
      await this.validateManifest(response.data);
      
      this.manifest = response.data;
      this.isConnected = true;
      
      console.log(`[AuraAdapter] Successfully connected to AURA site: ${this.manifest.site.name}`);
      
    } catch (error) {
      this.isConnected = false;
      if (axios.isAxiosError(error)) {
        throw new Error(`Network error fetching manifest: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Validates the AURA manifest against the official JSON Schema
   * Ensures strict protocol compliance and rejects subtly malformed manifests
   */
  private async validateManifest(manifest: any): Promise<void> {
    // First try to load the schema
    let auraSchema: any;
    try {
      // Use ES module compatible resolution
      let schemaPath: string;
      try {
        // Try to find the schema file using different approaches
        const possiblePaths = [
          // Try relative path from node_modules
          resolve(process.cwd(), 'node_modules/aura-protocol/dist/aura-v1.0.schema.json'),
          // Try from current package's node_modules
          resolve(__dirname, '../node_modules/aura-protocol/dist/aura-v1.0.schema.json'),
          // Try from workspace root
          resolve(__dirname, '../../../packages/aura-protocol/dist/aura-v1.0.schema.json'),
          // Try from parent packages directory
          resolve(__dirname, '../../aura-protocol/dist/aura-v1.0.schema.json')
        ];
        
        schemaPath = possiblePaths.find(path => {
          try {
            readFileSync(path, 'utf-8');
            return true;
          } catch {
            return false;
          }
        }) || '';
        
        if (!schemaPath) {
          throw new Error('Schema file not found in any expected location');
        }
      } catch {
        throw new Error('Unable to resolve schema path');
      }

      auraSchema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
    } catch (schemaError) {
      console.warn('[AuraAdapter] Could not load JSON schema, falling back to basic validation:', schemaError);
      // Only fall back to basic validation if schema loading fails (not validation)
      this.validateManifestBasic(manifest);
      return;
    }

    // Now perform strict schema validation
    try {
      const ajv = new Ajv({ 
        strict: true, 
        validateFormats: false, // Disable format validation to avoid issues with custom formats
        allErrors: true // Collect all validation errors
      });
      
      const validate = ajv.compile(auraSchema);
      const isValid = validate(manifest);

      if (!isValid) {
        const errorDetails = validate.errors?.map(error => {
          const path = error.instancePath || 'root';
          return `${path}: ${error.message}`;
        }).join('; ') || 'Unknown validation errors';
        
        // DO NOT fall back to basic validation - reject the manifest
        throw new Error(`Invalid manifest: Schema validation failed. ${errorDetails}`);
      }
      
      console.log('[AuraAdapter] Manifest passed strict JSON Schema validation');
    } catch (validationError) {
      // Re-throw validation errors - do NOT fall back to basic validation
      throw validationError;
    }
  }

  /**
   * Basic fallback validation for the AURA manifest structure
   */
  private validateManifestBasic(manifest: any): void {
    if (!manifest.protocol || manifest.protocol !== 'AURA') {
      throw new Error('Invalid manifest: missing or incorrect protocol field');
    }
    
    if (!manifest.version || manifest.version !== '1.0') {
      throw new Error('Invalid manifest: missing or unsupported version');
    }
    
    if (!manifest.site || !manifest.site.name || !manifest.site.url) {
      throw new Error('Invalid manifest: missing or incomplete site information');
    }
    
    if (!manifest.capabilities || typeof manifest.capabilities !== 'object') {
      throw new Error('Invalid manifest: missing or invalid capabilities');
    }
    
    if (!manifest.resources || typeof manifest.resources !== 'object') {
      throw new Error('Invalid manifest: missing or invalid resources');
    }
    
    console.log('[AuraAdapter] Manifest passed basic validation');
  }

  /**
   * Returns a list of capability IDs available in the current authentication state
   * @returns Array of capability IDs that can be executed
   */
  getAvailableCapabilities(): string[] {
    if (!this.isConnected || !this.manifest) {
      throw new Error('Not connected. Call connect() first.');
    }

    // If we have current state with specific capabilities, use those
    if (this.currentState?.capabilities) {
      return [...this.currentState.capabilities];
    }

    // Otherwise, return all capabilities from the manifest
    return Object.keys(this.manifest.capabilities);
  }

  /**
   * Executes a capability with the provided arguments
   * @param capabilityId - The ID of the capability to execute
   * @param args - Arguments object for the capability
   * @returns Promise resolving to the execution result
   */
  async execute(capabilityId: string, args: object = {}): Promise<ExecutionResult> {
    if (!this.isConnected || !this.manifest) {
      throw new Error('Not connected. Call connect() first.');
    }

    const capability = this.manifest.capabilities[capabilityId];
    if (!capability) {
      throw new Error(`Capability "${capabilityId}" not found in manifest`);
    }

    console.log(`[AuraAdapter] Executing capability "${capabilityId}"...`);

    try {
      // Map parameters if parameterMapping is defined
      let parametersToUse = args;
      if (capability.action.parameterMapping) {
        parametersToUse = this.mapParameters(args, capability.action.parameterMapping);
      }

      // Expand URI template with proper RFC 6570 support
      const expandedUrl = this.prepareUrlPath(capability.action.urlTemplate, parametersToUse);
      const fullUrl = `${this.baseUrl}${expandedUrl}`;

      // Determine request data based on encoding
      let requestData: any = null;
      let queryParams: any = null;

      if (capability.action.encoding === 'json') {
        // Send parameters in request body as JSON
        requestData = parametersToUse;
      } else if (capability.action.encoding === 'query') {
        // For explicit query encoding, check if the URL already has query parameters
        const urlObj = new URL(fullUrl, this.baseUrl);
        const urlHasQueryParams = urlObj.search !== '';
        
        if (!urlHasQueryParams) {
          queryParams = parametersToUse;
        }
      } else {
        // Fallback to method-based logic for capabilities without explicit encoding
        if (capability.action.method === 'GET' || capability.action.method === 'DELETE') {
          const urlObj = new URL(fullUrl, this.baseUrl);
          const hasQueryInTemplate = urlObj.search !== '';
          
          if (!hasQueryInTemplate) {
            queryParams = parametersToUse;
          }
        } else {
          // For POST/PUT, send as body unless query parameters are in the template
          const hasQueryInTemplate = fullUrl.includes('?');
          if (!hasQueryInTemplate) {
            requestData = parametersToUse;
          }
        }
      }

      console.log(`[AuraAdapter] Making ${capability.action.method} request to: ${fullUrl}`);

      const response = await this.httpClient.request({
        method: capability.action.method,
        url: fullUrl,
        data: requestData,
        params: queryParams,
      });

      // Parse AURA-State header if present
      const auraStateHeader = response.headers['aura-state'];
      let auraState: AuraState | null = null;
      if (auraStateHeader) {
        try {
          auraState = JSON.parse(Buffer.from(auraStateHeader, 'base64').toString('utf-8'));
          this.currentState = auraState; // Update internal state
        } catch (error) {
          console.warn('[AuraAdapter] Failed to parse AURA-State header:', error);
        }
      }

      console.log(`[AuraAdapter] Execution complete. Status: ${response.status}`);

      return {
        status: response.status,
        data: response.data,
        state: auraState,
      };

    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`HTTP error during capability execution: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Returns the latest AURA-State received from the server
   * @returns The current AURA state or null if no state has been received
   */
  getCurrentState(): AuraState | null {
    return this.currentState;
  }

  /**
   * Prepares the URL path by expanding URI templates using RFC 6570 compliant expansion
   */
  private prepareUrlPath(template: string, args: any): string {
    try {
      const uriTemplate = parseTemplate(template);
      return uriTemplate.expand(args);
    } catch (error) {
      console.warn(`[AuraAdapter] Failed to expand URI template "${template}":`, error);
      return template; // Fallback to original template
    }
  }

  /**
   * Maps arguments from the input to a new object based on the capability's
   * parameterMapping using proper JSON Pointer syntax (RFC 6901)
   */
  private mapParameters(args: any, parameterMapping: Record<string, string>): any {
    const mapped: any = {};
    
    for (const [paramName, jsonPointer] of Object.entries(parameterMapping)) {
      if (jsonPointer.startsWith('/')) {
        const value = this.resolveJsonPointer(args, jsonPointer);
        if (value !== undefined) {
          mapped[paramName] = value;
        }
      }
    }
    
    return mapped;
  }

  /**
   * Resolves a JSON Pointer path to its value in the given object
   * Implements RFC 6901 JSON Pointer specification
   */
  private resolveJsonPointer(obj: any, pointer: string): any {
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
   * Checks if the adapter is connected and ready to execute capabilities
   */
  isReady(): boolean {
    return this.isConnected && this.manifest !== null;
  }

  /**
   * Gets the loaded manifest (if connected)
   */
  getManifest(): AuraManifest | null {
    return this.manifest;
  }
}
