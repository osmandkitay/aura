/**
 * Core types for DID Authentication system
 */

export interface DIDDocument {
  "@context": string | string[];
  id: string;
  verificationMethod?: VerificationMethod[];
  authentication?: (string | VerificationMethod)[];
  assertionMethod?: (string | VerificationMethod)[];
  keyAgreement?: (string | VerificationMethod)[];
  service?: Service[];
  created?: string;
  updated?: string;
}

export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyJwk?: JsonWebKey;
  publicKeyMultibase?: string;
  publicKeyBase58?: string;
}

export interface Service {
  id: string;
  type: string | string[];
  serviceEndpoint: string | Record<string, any>;
}

export interface AuthChallenge {
  challenge: string;  // 32-byte random value
  nonce: string;      // 16-byte random value
  domain: string;     // Bound to specific domain
  timestamp: number;
  expiresAt: number;
}

export interface VerifiablePresentation {
  "@context": string[];
  type: string;
  holder: string;
  proof: Proof;
}

export interface Proof {
  type: string;
  cryptosuite?: string;
  verificationMethod: string;
  challenge: string;
  domain: string;
  created: string;
  proofPurpose: string;
  proofValue: string;
}

export interface UCANToken {
  iss: string;  // Issuer DID
  aud: string;  // Audience DID
  exp: number;  // Expiration timestamp
  nbf?: number; // Not before timestamp
  iat?: number; // Issued at timestamp
  att: Capability[];  // Attenuations (capabilities)
  prf: string[]; // Proof chain for delegations
  fct?: any;     // Facts/constraints
}

export interface Capability {
  with: string;  // Resource URI
  can: string;   // Action
  nb?: Record<string, any>; // Caveats/constraints
}

export interface DisposableDID {
  did: string;
  parentDID: string;
  context: string;
  keyPair: CryptoKeyPair;
  expiresAt: number;
  rotateAfterUse: boolean;
  usageCount?: number;
}

export interface AuthResult {
  success: boolean;
  did?: string;
  token?: string;
  error?: string;
}

export interface DIDAuthSDKConfig {
  resolver: string;
  network: 'mainnet' | 'testnet' | 'dev';
  cacheTimeout: number;
  plugins?: DIDPlugin[];
  fallbackAuth?: 'jwt' | 'oauth' | 'none';
  storage?: 'idb' | 'memory';
}

export interface DIDPlugin {
  name: string;
  method: string;
  driver: DIDDriver;
}

export interface DIDDriver {
  resolve(did: string): Promise<DIDDocument>;
  create?(options: any): Promise<string>;
}

export interface AuthContext {
  did: string;
  capabilities: Capability[];
  expiresAt: number;
  isAuthenticated: boolean;
}

export enum DIDAuthError {
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  INVALID_DID = 'INVALID_DID',
  CHALLENGE_EXPIRED = 'CHALLENGE_EXPIRED',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  RESOLVER_ERROR = 'RESOLVER_ERROR',
  KEY_NOT_FOUND = 'KEY_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED'
}

export class DIDAuthException extends Error {
  constructor(
    public code: DIDAuthError,
    message: string,
    public did?: string
  ) {
    super(message);
    this.name = 'DIDAuthException';
  }
}