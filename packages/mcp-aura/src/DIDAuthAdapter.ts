/**
 * DID Authentication Adapter for MCP-AURA
 * Enables agent identification and capability-based access control
 */

import { AuraAdapter } from './AuraAdapter.js';
import type { ExecutionResult } from './AuraAdapter.js';
import type { 
  DIDAuraManifest, 
  DIDAuthChallenge, 
  DIDAuthResponse, 
  DIDAuthToken,
  AgentAuthState,
  AccessDecision
} from 'aura-protocol/dist/did-auth.js';

export interface DIDAuthConfig {
  agentDID: string;
  privateKey?: CryptoKey;
  ucanToken?: string;
}

export class DIDAuthAdapter extends AuraAdapter {
  private agentDID: string;
  private privateKey?: CryptoKey;
  private authToken?: DIDAuthToken;
  private authState?: AgentAuthState;

  constructor(siteUrl: string, authConfig: DIDAuthConfig) {
    super(siteUrl);
    this.agentDID = authConfig.agentDID;
    this.privateKey = authConfig.privateKey;
    
    if (authConfig.ucanToken) {
      // Parse existing token
      this.parseExistingToken(authConfig.ucanToken);
    }
  }

  /**
   * Override connect to handle DID authentication
   */
  async connect(): Promise<void> {
    await super.connect();
    
    const manifest = this.getManifest() as DIDAuraManifest;
    
    // Check if DID auth is required
    if (manifest.authentication?.required) {
      await this.authenticateWithDID();
    }
  }

  /**
   * Authenticate using DID
   */
  private async authenticateWithDID(): Promise<void> {
    const manifest = this.getManifest() as DIDAuraManifest;
    
    if (!manifest.authentication?.challengeEndpoint) {
      throw new Error('DID authentication required but no challenge endpoint specified');
    }

    // Step 1: Request challenge
    const challenge = await this.requestChallenge();
    
    // Step 2: Sign challenge
    const response = await this.signChallenge(challenge);
    
    // Step 3: Submit response and get token
    this.authToken = await this.submitAuthResponse(response);
    
    // Step 4: Update auth state
    this.updateAuthState();
  }

  /**
   * Request authentication challenge
   */
  private async requestChallenge(): Promise<DIDAuthChallenge> {
    const manifest = this.getManifest() as DIDAuraManifest;
    const challengeUrl = `${this.baseUrl}${manifest.authentication!.challengeEndpoint}`;
    
    const response = await this.httpClient.post(challengeUrl, {
      did: this.agentDID,
      requestedCapabilities: this.getRequestedCapabilities()
    });
    
    if (response.status !== 200) {
      throw new Error(`Failed to get auth challenge: ${response.status}`);
    }
    
    return response.data as DIDAuthChallenge;
  }

  /**
   * Sign authentication challenge
   */
  private async signChallenge(challenge: DIDAuthChallenge): Promise<DIDAuthResponse> {
    if (!this.privateKey) {
      throw new Error('No private key available for signing');
    }

    // Create the message to sign
    const message = `${challenge.challenge}${challenge.nonce}${challenge.domain}${challenge.timestamp}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    
    // Sign with private key
    const signature = await crypto.subtle.sign(
      { name: 'Ed25519' },
      this.privateKey,
      data
    );
    
    // Create verifiable presentation
    const presentation = {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      type: "VerifiablePresentation",
      holder: this.agentDID,
      proof: {
        type: "DataIntegrityProof",
        cryptosuite: "eddsa-rdfc-2022",
        verificationMethod: `${this.agentDID}#key-1`,
        challenge: challenge.challenge,
        domain: challenge.domain,
        created: new Date().toISOString(),
        proofPurpose: "authentication",
        proofValue: btoa(String.fromCharCode(...new Uint8Array(signature)))
      }
    };
    
    return {
      did: this.agentDID,
      challenge: challenge.challenge,
      signature: presentation.proof.proofValue,
      presentation,
      requestedCapabilities: this.getRequestedCapabilities()
    };
  }

  /**
   * Submit authentication response
   */
  private async submitAuthResponse(authResponse: DIDAuthResponse): Promise<DIDAuthToken> {
    const manifest = this.getManifest() as DIDAuraManifest;
    const verifyUrl = `${this.baseUrl}${manifest.authentication!.verifyEndpoint || '/api/auth/verify'}`;
    
    const response = await this.httpClient.post(verifyUrl, authResponse);
    
    if (response.status !== 200) {
      throw new Error(`Authentication failed: ${response.status}`);
    }
    
    const token = response.data as DIDAuthToken;
    
    // Store token in authorization header for future requests
    this.httpClient.defaults.headers.common['Authorization'] = `DID ${token.token}`;
    
    return token;
  }

  /**
   * Update authentication state
   */
  private updateAuthState(): void {
    if (!this.authToken) return;
    
    this.authState = {
      did: this.agentDID,
      authenticated: true,
      capabilities: this.authToken.capabilities,
      trustLevel: this.calculateTrustLevel(),
      sessionId: this.generateSessionId(),
      expiresAt: this.authToken.expiresAt,
      metadata: {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        lastActivity: Date.now()
      }
    };
  }

  /**
   * Override execute to check capabilities
   */
  async execute(capabilityId: string, args: object = {}): Promise<ExecutionResult> {
    // Check if we have required capabilities
    const decision = this.checkAccess(capabilityId, args);
    
    if (!decision.allowed) {
      if (decision.suggestedAction === 'authenticate' && !this.authState?.authenticated) {
        // Try to authenticate
        await this.authenticateWithDID();
        
        // Recheck access
        const retryDecision = this.checkAccess(capabilityId, args);
        if (!retryDecision.allowed) {
          throw new Error(`Access denied: ${retryDecision.reason}`);
        }
      } else {
        throw new Error(`Access denied: ${decision.reason}`);
      }
    }
    
    // Add DID auth header if we have a token
    if (this.authToken) {
      this.httpClient.defaults.headers.common['Authorization'] = `DID ${this.authToken.token}`;
    }
    
    // Execute with parent implementation
    const result = await super.execute(capabilityId, args);
    
    // Update last activity
    if (this.authState) {
      this.authState.metadata = {
        ...this.authState.metadata,
        lastActivity: Date.now()
      };
    }
    
    return result;
  }

  /**
   * Check access for a capability
   */
  private checkAccess(capabilityId: string, args: object): AccessDecision {
    const manifest = this.getManifest() as DIDAuraManifest;
    
    // If no auth required, allow
    if (!manifest.authentication?.required) {
      return { allowed: true };
    }
    
    // Check if agent is blocklisted
    if (manifest.agentConfig?.blocklist?.includes(this.agentDID)) {
      return {
        allowed: false,
        reason: 'Agent is blocklisted'
      };
    }
    
    // Check required capabilities
    const requiredCaps = manifest.authentication.requiredCapabilities?.[capabilityId];
    if (requiredCaps) {
      if (!this.authState?.authenticated) {
        return {
          allowed: false,
          reason: 'Authentication required',
          suggestedAction: 'authenticate',
          requiredCapabilities: requiredCaps.actions
        };
      }
      
      // Check if agent has required capabilities
      const hasAllCaps = requiredCaps.actions.every(action => 
        this.hasCapability(requiredCaps.resource, action)
      );
      
      if (!hasAllCaps) {
        return {
          allowed: false,
          reason: 'Missing required capabilities',
          requiredCapabilities: requiredCaps.actions,
          missingCapabilities: requiredCaps.actions.filter(action => 
            !this.hasCapability(requiredCaps.resource, action)
          ),
          suggestedAction: 'request-capability'
        };
      }
      
      // Check trust level
      if (requiredCaps.minTrustLevel && this.authState.trustLevel < requiredCaps.minTrustLevel) {
        return {
          allowed: false,
          reason: 'Insufficient trust level',
          suggestedAction: 'upgrade-trust'
        };
      }
    }
    
    // Check rate limits
    if (!this.checkRateLimit(capabilityId)) {
      return {
        allowed: false,
        reason: 'Rate limit exceeded'
      };
    }
    
    return { allowed: true };
  }

  /**
   * Check if agent has a specific capability
   */
  private hasCapability(resource: string, action: string): boolean {
    if (!this.authState?.capabilities) return false;
    
    return this.authState.capabilities.some(cap => {
      // Match resource pattern
      const resourceMatch = this.matchPattern(cap.with, resource);
      
      // Match action
      const actionMatch = cap.can.includes(action) || cap.can.includes('*');
      
      // Check constraints
      if (cap.constraints) {
        if (cap.constraints.validUntil && Date.now() > cap.constraints.validUntil) {
          return false;
        }
        if (cap.constraints.maxUses !== undefined && cap.constraints.maxUses <= 0) {
          return false;
        }
      }
      
      return resourceMatch && actionMatch;
    });
  }

  /**
   * Match resource pattern with wildcards
   */
  private matchPattern(pattern: string, resource: string): boolean {
    if (pattern === '*') return true;
    if (pattern === resource) return true;
    
    // Convert pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(resource);
  }

  /**
   * Check rate limits
   */
  private checkRateLimit(capabilityId: string): boolean {
    // Implementation would track request counts per window
    // For now, return true
    return true;
  }

  /**
   * Calculate trust level for agent
   */
  private calculateTrustLevel(): number {
    const manifest = this.getManifest() as DIDAuraManifest;
    
    // Check if agent is trusted
    const trustedAgent = manifest.agentConfig?.trustedAgents?.find(
      agent => agent.did === this.agentDID
    );
    
    if (trustedAgent) {
      return trustedAgent.trustLevel;
    }
    
    // Default trust level based on DID method
    const didMethod = this.agentDID.split(':')[1];
    const trustLevels: Record<string, number> = {
      'ion': 80,
      'ethr': 70,
      'web': 60,
      'key': 50,
      'pkh': 40
    };
    
    return trustLevels[didMethod] || 30;
  }

  /**
   * Get requested capabilities
   */
  private getRequestedCapabilities(): string[] {
    // In a real implementation, would determine based on intended actions
    return ['read', 'write', 'execute'];
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `did-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Parse existing UCAN token
   */
  private parseExistingToken(token: string): void {
    // Parse JWT to extract capabilities
    const parts = token.split('.');
    if (parts.length !== 3) return;
    
    try {
      const payload = JSON.parse(atob(parts[1]));
      this.authToken = {
        token,
        did: payload.iss,
        capabilities: payload.att,
        expiresAt: payload.exp * 1000
      };
      this.updateAuthState();
    } catch (error) {
      console.warn('Failed to parse existing token:', error);
    }
  }

  /**
   * Get current authentication state
   */
  getAuthState(): AgentAuthState | undefined {
    return this.authState;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.authState?.authenticated === true && 
           Date.now() < (this.authState?.expiresAt || 0);
  }

  /**
   * Refresh authentication token
   */
  async refreshAuth(): Promise<void> {
    if (!this.authToken?.refreshToken) {
      // Re-authenticate from scratch
      await this.authenticateWithDID();
      return;
    }
    
    // Use refresh token to get new access token
    const manifest = this.getManifest() as DIDAuraManifest;
    const refreshUrl = `${this.baseUrl}/api/auth/refresh`;
    
    const response = await this.httpClient.post(refreshUrl, {
      refreshToken: this.authToken.refreshToken
    });
    
    if (response.status === 200) {
      this.authToken = response.data as DIDAuthToken;
      this.updateAuthState();
    } else {
      // Refresh failed, re-authenticate
      await this.authenticateWithDID();
    }
  }

  /**
   * Logout and clear authentication
   */
  logout(): void {
    this.authToken = undefined;
    this.authState = undefined;
    delete this.httpClient.defaults.headers.common['Authorization'];
  }

  // Extend base URL to include proper typing
  protected baseUrl: string = '';
  protected httpClient: any;
}