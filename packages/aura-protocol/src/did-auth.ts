/**
 * DID Authentication extensions for AURA Protocol
 * Enables agent identification and capability-based access control
 */

import { Capability as AuraCapability } from './index.js';

/**
 * Extended AURA Manifest with DID authentication support
 */
export interface DIDAuraManifest {
  // Existing AURA fields
  $schema: string;
  protocol: 'AURA';
  version: '1.0';
  site: {
    name: string;
    description?: string;
    url: string;
  };
  resources: Record<string, any>;
  capabilities: Record<string, AuraCapability>;
  policy?: any;

  // DID Authentication extensions
  authentication?: {
    // Supported DID methods
    methods: ('key' | 'web' | 'ion' | 'ethr' | 'pkh')[];
    
    // Challenge-response endpoint
    challengeEndpoint?: string;
    
    // Token verification endpoint
    verifyEndpoint?: string;
    
    // Required for all agents
    required: boolean;
    
    // Capability requirements per resource
    requiredCapabilities?: Record<string, RequiredCapability>;
  };

  // Agent-specific configurations
  agentConfig?: {
    // Rate limits per agent DID
    rateLimits?: {
      default: RateLimit;
      perAgent?: Record<string, RateLimit>;
    };
    
    // Trusted agent DIDs with pre-authorized capabilities
    trustedAgents?: TrustedAgent[];
    
    // Blocklist of agent DIDs
    blocklist?: string[];
  };
}

/**
 * Required capability for accessing a resource
 */
export interface RequiredCapability {
  resource: string;
  actions: string[];
  minTrustLevel?: number;
  requiresAttestation?: boolean;
}

/**
 * Rate limit configuration
 */
export interface RateLimit {
  requests: number;
  window: number; // in seconds
  burstAllowance?: number;
}

/**
 * Trusted agent configuration
 */
export interface TrustedAgent {
  did: string;
  name?: string;
  capabilities: AgentCapability[];
  trustLevel: number;
  expiresAt?: number;
}

/**
 * Agent-specific capability grant
 */
export interface AgentCapability {
  with: string;  // Resource pattern
  can: string[];  // Allowed actions
  constraints?: {
    rateLimit?: RateLimit;
    validUntil?: number;
    maxUses?: number;
    ipWhitelist?: string[];
  };
}

/**
 * Agent authentication state
 */
export interface AgentAuthState {
  did: string;
  authenticated: boolean;
  capabilities: AgentCapability[];
  trustLevel: number;
  sessionId: string;
  expiresAt: number;
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
    lastActivity?: number;
  };
}

/**
 * AURA-State header with DID authentication
 */
export interface DIDAuraState {
  // Agent identification
  agent?: {
    did: string;
    authenticated: boolean;
    trustLevel: number;
  };
  
  // Current capabilities
  capabilities?: string[];
  
  // Session info
  session?: {
    id: string;
    expiresAt: number;
  };
  
  // Context from original AURA
  context?: Record<string, any>;
}

/**
 * Challenge request for DID authentication
 */
export interface DIDAuthChallenge {
  challenge: string;
  nonce: string;
  domain: string;
  timestamp: number;
  expiresAt: number;
  requiredCapabilities?: string[];
}

/**
 * Challenge response with proof
 */
export interface DIDAuthResponse {
  did: string;
  challenge: string;
  signature: string;
  presentation?: {
    "@context": string[];
    type: string;
    holder: string;
    proof: {
      type: string;
      cryptosuite?: string;
      verificationMethod: string;
      challenge: string;
      domain: string;
      created: string;
      proofPurpose: string;
      proofValue: string;
    };
  };
  requestedCapabilities?: string[];
}

/**
 * Token response after successful authentication
 */
export interface DIDAuthToken {
  token: string; // UCAN token
  did: string;
  capabilities: AgentCapability[];
  expiresAt: number;
  refreshToken?: string;
}

/**
 * Capability delegation request
 */
export interface CapabilityDelegation {
  from: string; // Delegator DID
  to: string;   // Delegate DID
  capabilities: AgentCapability[];
  constraints?: {
    expiresAt?: number;
    maxDelegationDepth?: number;
    allowSubDelegation?: boolean;
  };
  proof: string; // UCAN token proving delegation authority
}

/**
 * Access control decision
 */
export interface AccessDecision {
  allowed: boolean;
  reason?: string;
  requiredCapabilities?: string[];
  missingCapabilities?: string[];
  suggestedAction?: 'authenticate' | 'request-capability' | 'upgrade-trust';
}