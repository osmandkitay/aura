/**
 * AURA Protocol v1.0 - Initial Release
 * A protocol for agent-website interactions
 */

/**
 * AuraManifest - Central site-wide manifest served from /.well-known/aura.json
 * Replaces the old AuraAssertion concept
 */
export interface AuraManifest {
  $schema: string; // e.g., "https://aura.dev/schemas/v1.0.json"
  id?: string; // Canonical, absolute URL for the manifest
  protocol: 'AURA';
  version: '1.0';
  site: {
    name: string;
    description?: string;
    url: string;
  };
  resources: Record<string, Resource>;
  capabilities: Record<string, Capability>;
  policy?: Policy;
}

/**
 * Resource - Defines where actions can be performed
 * Separated from capabilities for improved clarity
 */
export interface Resource {
  uriPattern: string; // e.g., "/articles/{id}"
  description: string;
  operations: {
    GET?: { capabilityId: string; };
    POST?: { capabilityId: string; };
    PUT?: { capabilityId: string; };
    DELETE?: { capabilityId: string; };
  };
}

/**
 * Capability - Self-executing contract with concrete action
 * Now includes versioning and HttpAction definition
 */
export interface Capability {
  id: string;
  // Versioning: A simple integer incremented for each breaking change
  v: number;
  description: string;
  parameters?: JSONSchema;
  action: HttpAction;
}

/**
 * JSONSchema - A simplified JSON Schema definition
 * Represents the structure for capability parameters
 */
export interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: any[];
  default?: any;
  description?: string;
  title?: string;
  additionalProperties?: boolean | JSONSchema;
}

/**
 * HttpAction - Defines how to execute a capability via HTTP
 * Includes security, encoding, and parameter mapping
 */
export interface HttpAction {
  type: 'HTTP';
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  // Adheres to RFC 6570 URI Template, e.g., "/api/posts/{postId}{?tags*}"
  urlTemplate: string;
  // Hint for browser-based agents to avoid CORS issues
  cors?: boolean;
  // Defines how parameters are sent
  encoding?: 'json' | 'query';
  // Maps capability parameters to the HTTP request using JSON-Pointer syntax
  parameterMapping: Record<string, string>;
}

/**
 * Policy - Site-wide policies for rate limiting and authentication
 * Provides hints to agents about how to interact with the site
 */
export interface Policy {
  // Machine-readable rate limit
  rateLimit?: {
    limit: number; // e.g., 120
    window: 'second' | 'minute' | 'hour' | 'day';
  };
  // Provides a hint to the agent about authentication
  authHint?: 'none' | 'cookie' | 'bearer';
}

/**
 * AuraState - Structure for the AURA-State header
 * Sent as Base64-encoded JSON in HTTP responses
 */
export interface AuraState {
  isAuthenticated?: boolean;
  context?: Record<string, any>;
  capabilities?: string[]; // Available capability IDs for current state
}

 