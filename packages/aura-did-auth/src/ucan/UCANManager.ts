import { SignJWT, jwtVerify, importJWK, JWTPayload } from 'jose';
import { CID } from 'multiformats/cid';
import * as json from 'multiformats/codecs/json';
import { sha256 } from 'multiformats/hashes/sha2';
import { UCANToken, Capability, DIDAuthError, DIDAuthException } from '../types/index.js';
import { SecureKeyManager } from '../crypto/KeyManager.js';

export interface UCANOptions {
  issuer: string;
  audience: string;
  capabilities: Capability[];
  expiration?: number;
  notBefore?: number;
  facts?: any;
  proofs?: string[];
}

export class UCANManager {
  constructor(private keyManager: SecureKeyManager) {}

  /**
   * Create and sign a UCAN token
   */
  async createToken(options: UCANOptions): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const exp = options.expiration || now + 86400; // Default 24 hours
    
    const payload: UCANToken = {
      iss: options.issuer,
      aud: options.audience,
      exp,
      nbf: options.notBefore,
      iat: now,
      att: options.capabilities,
      prf: options.proofs || [],
      fct: options.facts
    };

    try {
      // Get the issuer's key
      const keyPair = await this.keyManager.retrieveKey(options.issuer);
      
      // Create JWT
      const jwt = new SignJWT(payload as unknown as JWTPayload)
        .setProtectedHeader({ 
          alg: 'EdDSA',
          typ: 'JWT',
          ucv: '0.10.0' // UCAN version
        })
        .setIssuedAt(now)
        .setExpirationTime(exp);

      if (options.notBefore) {
        jwt.setNotBefore(options.notBefore);
      }

      // Sign with the private key
      const privateKey = await importJWK(
        await crypto.subtle.exportKey('jwk', keyPair.privateKey)
      );
      
      return await jwt.sign(privateKey);
    } catch (error) {
      throw new DIDAuthException(
        DIDAuthError.AUTHENTICATION_FAILED,
        `Failed to create UCAN token: ${error}`,
        options.issuer
      );
    }
  }

  /**
   * Verify a UCAN token
   */
  async verifyToken(token: string, expectedAudience?: string): Promise<UCANToken> {
    try {
      // Parse without verification first to get issuer
      const parts = token.split('.');
      const payload = JSON.parse(atob(parts[1]));
      
      // Get issuer's public key
      const issuerDID = payload.iss;
      const keyPair = await this.keyManager.retrieveKey(issuerDID);
      
      // Import public key for verification
      const publicKey = await importJWK(
        await crypto.subtle.exportKey('jwk', keyPair.publicKey)
      );
      
      // Verify JWT
      const { payload: verified } = await jwtVerify(token, publicKey);
      
      // Additional UCAN-specific checks
      if (expectedAudience && verified.aud !== expectedAudience) {
        throw new Error(`Invalid audience: expected ${expectedAudience}, got ${verified.aud}`);
      }
      
      // Verify proof chain if present
      const ucan = verified as unknown as UCANToken;
      if (ucan.prf && ucan.prf.length > 0) {
        await this.verifyProofChain(ucan.prf, ucan);
      }
      
      return ucan;
    } catch (error) {
      throw new DIDAuthException(
        DIDAuthError.INVALID_SIGNATURE,
        `Failed to verify UCAN token: ${error}`
      );
    }
  }

  /**
   * Delegate capabilities to another DID
   */
  async delegate(
    from: string,
    to: string,
    capabilities: Capability[],
    constraints?: {
      expiry?: number;
      uses?: number;
      conditions?: any;
    },
    parentToken?: string
  ): Promise<string> {
    // If there's a parent token, verify delegation is valid
    if (parentToken) {
      const parent = await this.verifyToken(parentToken);
      
      // Ensure we're the audience of the parent token
      if (parent.aud !== from) {
        throw new DIDAuthException(
          DIDAuthError.PERMISSION_DENIED,
          `Cannot delegate: not the audience of parent token`,
          from
        );
      }
      
      // Ensure capabilities are attenuated (subset of parent)
      if (!this.validateAttenuation(parent.att, capabilities)) {
        throw new DIDAuthException(
          DIDAuthError.PERMISSION_DENIED,
          `Invalid delegation: capabilities must be attenuated`,
          from
        );
      }
    }

    // Create proof chain
    const proofs = parentToken ? [await this.tokenToCID(parentToken)] : [];
    
    return this.createToken({
      issuer: from,
      audience: to,
      capabilities,
      expiration: constraints?.expiry,
      facts: {
        ...constraints?.conditions,
        maxUses: constraints?.uses
      },
      proofs
    });
  }

  /**
   * Attenuate capabilities in a token
   */
  async attenuate(
    token: string,
    newCapabilities: Capability[]
  ): Promise<string> {
    const original = await this.verifyToken(token);
    
    // Ensure new capabilities are subset of original
    if (!this.validateAttenuation(original.att, newCapabilities)) {
      throw new DIDAuthException(
        DIDAuthError.PERMISSION_DENIED,
        'Invalid attenuation: new capabilities must be a subset'
      );
    }
    
    // Create new token with attenuated capabilities
    return this.createToken({
      issuer: original.iss,
      audience: original.aud,
      capabilities: newCapabilities,
      expiration: original.exp,
      facts: original.fct,
      proofs: [...original.prf, await this.tokenToCID(token)]
    });
  }

  /**
   * Validate that new capabilities are properly attenuated
   */
  private validateAttenuation(
    original: Capability[],
    attenuated: Capability[]
  ): boolean {
    for (const cap of attenuated) {
      const originalCap = original.find(c => 
        this.matchResource(c.with, cap.with) && 
        this.matchAction(c.can, cap.can)
      );
      
      if (!originalCap) {
        return false;
      }
      
      // Check caveats are more restrictive
      if (cap.nb) {
        if (!originalCap.nb) {
          // Adding new restrictions is ok
          continue;
        }
        
        // All original caveats must be present
        for (const [key, value] of Object.entries(originalCap.nb)) {
          if (!(key in cap.nb)) {
            return false;
          }
          // Could add more sophisticated caveat comparison here
        }
      }
    }
    
    return true;
  }

  /**
   * Match resource URIs with wildcard support
   */
  private matchResource(pattern: string, resource: string): boolean {
    if (pattern === resource) return true;
    if (pattern === '*') return true;
    
    // Support glob patterns
    if (pattern.includes('*')) {
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
      );
      return regex.test(resource);
    }
    
    // Support hierarchical matching
    if (pattern.endsWith('/')) {
      return resource.startsWith(pattern);
    }
    
    return false;
  }

  /**
   * Match actions with wildcard support
   */
  private matchAction(pattern: string, action: string): boolean {
    if (pattern === action) return true;
    if (pattern === '*') return true;
    
    // Support action hierarchies (e.g., 'post/*' matches 'post/create')
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2);
      return action.startsWith(prefix + '/');
    }
    
    return false;
  }

  /**
   * Convert token to CID for proof chain
   */
  private async tokenToCID(token: string): Promise<string> {
    const bytes = new TextEncoder().encode(token);
    const hash = await sha256.digest(bytes);
    const cid = CID.create(1, json.code, hash);
    return cid.toString();
  }

  /**
   * Verify proof chain validity
   */
  private async verifyProofChain(
    proofs: string[],
    token: UCANToken
  ): Promise<void> {
    // In a full implementation, would fetch and verify each proof
    // For now, just validate CID format
    for (const proof of proofs) {
      try {
        CID.parse(proof);
      } catch {
        throw new Error(`Invalid proof CID: ${proof}`);
      }
    }
    
    // Would verify:
    // 1. Each proof token is valid
    // 2. Delegation chain is unbroken
    // 3. Capabilities are properly attenuated at each step
  }

  /**
   * Check if a token grants a specific capability
   */
  hasCapability(
    token: UCANToken,
    resource: string,
    action: string
  ): boolean {
    return token.att.some(cap => 
      this.matchResource(cap.with, resource) &&
      this.matchAction(cap.can, action)
    );
  }

  /**
   * Extract capabilities for a specific resource
   */
  getCapabilitiesForResource(
    token: UCANToken,
    resource: string
  ): Capability[] {
    return token.att.filter(cap => 
      this.matchResource(cap.with, resource)
    );
  }
}