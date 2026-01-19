import type { NextApiRequest, NextApiResponse } from 'next';
import Ajv, { JSONSchemaType, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { AuraManifest } from 'aura-protocol';
import * as fs from 'fs';
import * as path from 'path';

// Cache for compiled validation functions
const validationCache = new Map<string, ValidateFunction>();

// Cache for the loaded manifest
let manifestCache: AuraManifest | null = null;

/**
 * Load the AURA manifest from the file system
 */
function loadManifest(): AuraManifest {
  if (manifestCache) {
    return manifestCache;
  }

  try {
    // Try different possible paths for the manifest
    const possiblePaths = [
      // When running from reference-server directory (dev mode)
      path.join(process.cwd(), 'public', '.well-known', 'aura.json'),
      // When running from project root (test mode)
      path.join(process.cwd(), 'packages', 'reference-server', 'public', '.well-known', 'aura.json'),
      // Absolute path resolution
      path.resolve(__dirname, '..', 'public', '.well-known', 'aura.json')
    ];

    let manifestData: string | null = null;
    let usedPath: string | null = null;

    for (const manifestPath of possiblePaths) {
      try {
        if (fs.existsSync(manifestPath)) {
          manifestData = fs.readFileSync(manifestPath, 'utf-8');
          usedPath = manifestPath;
          break;
        }
      } catch {
        // Continue to next path
        continue;
      }
    }

    if (!manifestData || !usedPath) {
      throw new Error(`AURA manifest not found. Tried paths: ${possiblePaths.join(', ')}`);
    }

    manifestCache = JSON.parse(manifestData) as AuraManifest;
    
    // Log the successful manifest load with absolute path for production debugging
    console.log(`[AURA] Loaded manifest from: ${path.resolve(usedPath)}`);
    
    return manifestCache;
  } catch (error) {
    throw new Error(`Failed to load AURA manifest: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get or compile a validation function for a specific capability
 */
function getValidator(capabilityId: string): ValidateFunction | null {
  // Check cache first
  if (validationCache.has(capabilityId)) {
    return validationCache.get(capabilityId)!;
  }

  // Load manifest and find capability
  const manifest = loadManifest();
  const capability = manifest.capabilities[capabilityId];

  if (!capability || !capability.parameters) {
    return null;
  }

  // Create Ajv instance with formats support
  const ajv = new Ajv({ 
    allErrors: true, 
    removeAdditional: false,
    useDefaults: true,
    coerceTypes: false // Don't coerce types to maintain data integrity
  });
  addFormats(ajv);

  try {
    // Compile the schema
    const validator = ajv.compile(capability.parameters);
    
    // Cache for future use
    validationCache.set(capabilityId, validator);
    
    return validator;
  } catch (error) {
    console.error(`Failed to compile schema for capability ${capabilityId}:`, error);
    return null;
  }
}

/**
 * Standard validation error response structure
 */
export interface ValidationErrorResponse {
  code: 'VALIDATION_ERROR';
  detail: string;
  errors?: Array<{
    field: string;
    message: string;
    value?: any;
  }>;
}

/**
 * Convert parameter values to match schema types
 */
function convertParameterTypes(params: any, schema: any): any {
  if (!schema || !schema.properties) {
    return params;
  }

  const converted = { ...params };

  // Convert each parameter according to its schema type
  for (const [key, propSchema] of Object.entries(schema.properties as Record<string, any>)) {
    if (converted[key] !== undefined && converted[key] !== null) {
      const type = propSchema.type;
      
      if (type === 'number' || type === 'integer') {
        // Convert string numbers to actual numbers
        const numValue = Number(converted[key]);
        if (!isNaN(numValue)) {
          converted[key] = numValue;
        }
      } else if (type === 'boolean') {
        // Convert string booleans to actual booleans
        if (typeof converted[key] === 'string') {
          converted[key] = converted[key].toLowerCase() === 'true';
        }
      } else if (type === 'array' && typeof converted[key] === 'string') {
        // Convert comma-separated strings to arrays
        converted[key] = converted[key].split(',').map((item: string) => item.trim());
      }
    }
  }

  return converted;
}

const TEMPLATE_OPERATORS = '+#./;?&';

function extractTemplateVariables(template?: string): { path: Set<string>; query: Set<string> } {
  const path = new Set<string>();
  const query = new Set<string>();

  if (!template) {
    return { path, query };
  }

  const matches = template.matchAll(/\{([^}]+)\}/g);
  for (const match of matches) {
    const expression = match[1]?.trim();
    if (!expression) continue;

    const operator = TEMPLATE_OPERATORS.includes(expression[0]) ? expression[0] : '';
    const varList = operator ? expression.slice(1) : expression;

    for (const rawVar of varList.split(',')) {
      const trimmed = rawVar.trim();
      if (!trimmed) continue;
      const withoutExplode = trimmed.replace(/\*$/, '');
      const name = withoutExplode.split(':')[0];
      if (!name) continue;

      if (operator === '?' || operator === '&') {
        query.add(name);
      } else {
        path.add(name);
      }
    }
  }

  return { path, query };
}

function normalizeHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function pickParams(source: any, allowedKeys?: Set<string>): Record<string, any> {
  if (!source || typeof source !== 'object') {
    return {};
  }

  if (!allowedKeys) {
    return { ...source };
  }

  const picked: Record<string, any> = {};
  for (const key of allowedKeys) {
    if (source[key] !== undefined) {
      picked[key] = source[key];
    }
  }

  return picked;
}

function pickHeaderParams(headers: Record<string, any>, allowedKeys?: Set<string>): Record<string, any> {
  const picked: Record<string, any> = {};
  if (!headers) return picked;

  if (!allowedKeys) {
    return picked;
  }

  for (const key of allowedKeys) {
    const headerValue = normalizeHeaderValue(headers[key.toLowerCase()]);
    if (headerValue !== undefined) {
      picked[key] = headerValue;
    }
  }

  return picked;
}

function splitQueryParamsByTemplate(
  query: Record<string, any>,
  urlTemplate?: string,
  allowedKeys?: Set<string>
): { pathParams: Record<string, any>; queryParams: Record<string, any> } {
  const { path: pathVars, query: queryVars } = extractTemplateVariables(urlTemplate);
  const pathParams: Record<string, any> = {};
  const queryParams: Record<string, any> = {};

  for (const [key, value] of Object.entries(query || {})) {
    if (allowedKeys && !allowedKeys.has(key)) {
      continue;
    }

    if (pathVars.has(key) && !queryVars.has(key)) {
      pathParams[key] = value;
      continue;
    }

    if (queryVars.has(key)) {
      queryParams[key] = value;
      continue;
    }

    if (pathVars.has(key)) {
      pathParams[key] = value;
      continue;
    }

    queryParams[key] = value;
  }

  return { pathParams, queryParams };
}

function extractWithPrecedence(
  req: NextApiRequest,
  capability: any,
  allowedKeys?: Set<string>
): Record<string, any> {
  const { pathParams, queryParams } = splitQueryParamsByTemplate(
    (req.query || {}) as Record<string, any>,
    capability?.action?.urlTemplate,
    allowedKeys
  );

  const bodyParams = pickParams(req.body, allowedKeys);
  const headerParams = pickHeaderParams(req.headers as Record<string, any>, allowedKeys);

  return {
    ...bodyParams,
    ...headerParams,
    ...queryParams,
    ...pathParams
  };
}

/**
 * Extract parameters from request based on HTTP method and encoding
 * This function creates a unified parameters object by:
 * 1. Starting with req.query (contains both path params like {id} and query string params)
 * 2. For POST/PUT requests, merging req.body on top (body params override query params)
 * 3. Ignoring req.body for GET requests (adheres to web standards)
 */
function extractRequestParameters(req: NextApiRequest, capability: any): any {
  const hasParameterLocation = !!(capability?.action?.parameterLocation && Object.keys(capability.action.parameterLocation).length > 0);
  const schemaKeys = capability?.parameters?.properties
    ? new Set(Object.keys(capability.parameters.properties))
    : undefined;

  if (hasParameterLocation) {
    const parameters: Record<string, any> = {};
    const locationMap = capability.action.parameterLocation as Record<string, string>;

    for (const [paramName, location] of Object.entries(locationMap)) {
      let value: any = undefined;

      switch (location) {
        case 'path':
        case 'query':
          value = (req.query as Record<string, any>)[paramName];
          break;
        case 'header':
          value = normalizeHeaderValue((req.headers as Record<string, any>)[paramName.toLowerCase()]);
          break;
        case 'body':
          if (req.body && typeof req.body === 'object') {
            value = (req.body as Record<string, any>)[paramName];
          }
          break;
        default:
          value = undefined;
          break;
      }

      if (value !== undefined) {
        parameters[paramName] = value;
      }
    }

    const fallbackParams = extractWithPrecedence(req, capability, schemaKeys);
    for (const [key, value] of Object.entries(fallbackParams)) {
      if (parameters[key] === undefined) {
        parameters[key] = value;
      }
    }

    return convertParameterTypes(parameters, capability.parameters);
  }

  // Create a new, unified parameters object
  const parameters: any = {};
  
  // First, copy all properties from req.query into the parameters object
  // Note: In Next.js, req.query contains both dynamic route parameters (e.g., id from /posts/[id].ts) 
  // and query string parameters from the URL
  Object.assign(parameters, req.query);
  
  // For POST and PUT requests, merge body parameters on top of query parameters
  // This ensures that payload parameters intentionally overwrite any query string parameters 
  // with the same name, which is standard API behavior
  if ((req.method === 'POST' || req.method === 'PUT') && 
      req.body && 
      typeof req.body === 'object') {
    Object.assign(parameters, req.body);
  }
  
  // Note: We explicitly ignore req.body for GET requests, regardless of the encoding hint 
  // in the manifest, to adhere to web standards
  
  // Convert parameter types to match schema expectations
  return convertParameterTypes(parameters, capability.parameters);
}

/**
 * Validate request parameters against a capability's schema
 */
export function validateRequest(
  req: NextApiRequest,
  capabilityId: string
): { isValid: true } | { isValid: false; error: ValidationErrorResponse } {
  try {
    // Load manifest to check if capability exists
    const manifest = loadManifest();
    const capability = manifest.capabilities[capabilityId];
    
    if (!capability) {
      return {
        isValid: false,
        error: {
          code: 'VALIDATION_ERROR',
          detail: `No validation schema found for capability: ${capabilityId}`,
        }
      };
    }
    
    // If capability exists but has no parameters, validation passes
    if (!capability.parameters) {
      return { isValid: true };
    }
    
    // Get the validator for this capability
    const validator = getValidator(capabilityId);
    
    if (!validator) {
      return {
        isValid: false,
        error: {
          code: 'VALIDATION_ERROR',
          detail: `Failed to compile validation schema for capability: ${capabilityId}`,
        }
      };
    }

    // Extract parameters from request
    const parameters = extractRequestParameters(req, capability);

    // Validate the parameters
    const isValid = validator(parameters);

    if (isValid) {
      return { isValid: true };
    }

    // Format validation errors
    const errors = validator.errors?.map(error => ({
      field: error.instancePath || error.schemaPath.replace('#/properties/', '').replace('#/', 'root'),
      message: error.message || 'Validation failed',
      value: error.data
    })) || [];

    return {
      isValid: false,
      error: {
        code: 'VALIDATION_ERROR',
        detail: `Validation failed for capability: ${capabilityId}`,
        errors
      }
    };

  } catch (error: unknown) {
    console.error(`Validation error for capability ${capabilityId}:`, error);
    return {
      isValid: false,
      error: {
        code: 'VALIDATION_ERROR',
        detail: `Internal validation error for capability: ${capabilityId}`,
      }
    };
  }
}

/**
 * Middleware function to validate requests before they reach the handler
 */
export function withValidation(
  capabilityId: string,
  handler: (req: NextApiRequest, res: NextApiResponse) => void | Promise<void>
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // Validate the request
    const validationResult = validateRequest(req, capabilityId);

    if (!validationResult.isValid) {
      res.status(400).json(validationResult.error);
      return;
    }

    // If validation passes, call the original handler
    return handler(req, res);
  };
}

/**
 * Utility function to send validation error response
 */
export function sendValidationError(
  res: NextApiResponse,
  capabilityId: string,
  customMessage?: string
) {
  const error: ValidationErrorResponse = {
    code: 'VALIDATION_ERROR',
    detail: customMessage || `Validation failed for capability: ${capabilityId}`,
  };
  
  res.status(400).json(error);
}

/**
 * Clear the cache (useful for testing or when manifest changes)
 */
export function clearValidationCache() {
  validationCache.clear();
  manifestCache = null;
} 
