import { LRUCache } from 'lru-cache';
import { DIDDocument, DIDDriver, DIDAuthError, DIDAuthException } from '../types/index.js';

interface CachedDocument {
  document: DIDDocument;
  timestamp: number;
  ttl: number;
}

interface ResolverOptions {
  cacheSize?: number;
  defaultTTL?: number;
  enableCircuitBreaker?: boolean;
  cdnUrl?: string;
}

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
}

export class OptimizedDIDResolver {
  // L1: Memory cache
  private memoryCache: LRUCache<string, CachedDocument>;
  
  // L2: Redis would be here in production (simulated for now)
  private l2Cache = new Map<string, CachedDocument>();
  
  // L3: CDN cache endpoint
  private cdnUrl?: string;
  
  // L4: Method-specific drivers
  private drivers = new Map<string, DIDDriver>();
  
  // Circuit breaker states per method
  private circuitBreakers = new Map<string, CircuitBreakerState>();
  
  // Configuration
  private readonly options: Required<ResolverOptions>;

  constructor(options: ResolverOptions = {}) {
    this.options = {
      cacheSize: options.cacheSize || 1000,
      defaultTTL: options.defaultTTL || 300000, // 5 minutes
      enableCircuitBreaker: options.enableCircuitBreaker !== false,
      cdnUrl: options.cdnUrl || ''
    };

    this.memoryCache = new LRUCache<string, CachedDocument>({
      max: this.options.cacheSize,
      ttl: this.options.defaultTTL,
      updateAgeOnGet: true
    });

    this.cdnUrl = this.options.cdnUrl;
  }

  /**
   * Register a DID method driver
   */
  registerDriver(method: string, driver: DIDDriver): void {
    this.drivers.set(method, driver);
    this.circuitBreakers.set(method, {
      failures: 0,
      lastFailure: 0,
      state: 'closed'
    });
  }

  /**
   * Main resolution method with multi-layer caching
   */
  async resolve(did: string): Promise<DIDDocument> {
    const method = this.extractMethod(did);
    const ttl = this.getMethodTTL(method);
    
    // L1: Memory cache (instant)
    const cached = this.memoryCache.get(did);
    if (cached && this.isCacheValid(cached)) {
      return cached.document;
    }
    
    // L2: Simulated Redis cache (~5ms)
    const l2Doc = await this.getFromL2Cache(did);
    if (l2Doc) {
      this.memoryCache.set(did, l2Doc);
      return l2Doc.document;
    }
    
    // L3: CDN cache (~50ms)
    if (this.cdnUrl) {
      const cdnDoc = await this.getFromCDN(did);
      if (cdnDoc) {
        await this.cacheDocument(did, cdnDoc, ttl);
        return cdnDoc;
      }
    }
    
    // L4: Driver resolution (~200ms)
    const doc = await this.resolveFromDriver(did, method);
    await this.cacheDocument(did, doc, ttl);
    return doc;
  }

  /**
   * Extract DID method from DID string
   */
  private extractMethod(did: string): string {
    const parts = did.split(':');
    if (parts.length < 3 || parts[0] !== 'did') {
      throw new DIDAuthException(
        DIDAuthError.INVALID_DID,
        `Invalid DID format: ${did}`,
        did
      );
    }
    return parts[1];
  }

  /**
   * Get method-specific TTL
   */
  private getMethodTTL(method: string): number {
    const ttls: Record<string, number> = {
      'key': Infinity,     // Never expires (immutable)
      'web': 300000,       // 5 minutes
      'ion': 1800000,      // 30 minutes
      'ethr': 600000,      // 10 minutes
      'pkh': 3600000,      // 1 hour
      'indy': 600000       // 10 minutes
    };
    return ttls[method] || this.options.defaultTTL;
  }

  /**
   * Check if cached document is still valid
   */
  private isCacheValid(cached: CachedDocument): boolean {
    const age = Date.now() - cached.timestamp;
    return age < cached.ttl;
  }

  /**
   * Get document from L2 cache (simulated)
   */
  private async getFromL2Cache(did: string): Promise<CachedDocument | null> {
    // Simulate Redis latency
    await new Promise(resolve => setTimeout(resolve, 5));
    
    const cached = this.l2Cache.get(did);
    if (cached && this.isCacheValid(cached)) {
      return cached;
    }
    return null;
  }

  /**
   * Get document from CDN
   */
  private async getFromCDN(did: string): Promise<DIDDocument | null> {
    if (!this.cdnUrl) return null;
    
    try {
      // Simulate CDN fetch
      const response = await fetch(`${this.cdnUrl}/did/${encodeURIComponent(did)}`, {
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn(`CDN fetch failed for ${did}:`, error);
    }
    
    return null;
  }

  /**
   * Resolve DID using registered driver
   */
  private async resolveFromDriver(did: string, method: string): Promise<DIDDocument> {
    const driver = this.drivers.get(method);
    if (!driver) {
      throw new DIDAuthException(
        DIDAuthError.RESOLVER_ERROR,
        `No driver registered for method: ${method}`,
        did
      );
    }

    // Check circuit breaker
    if (this.options.enableCircuitBreaker) {
      const breaker = this.circuitBreakers.get(method)!;
      if (!this.canAttempt(breaker)) {
        throw new DIDAuthException(
          DIDAuthError.RESOLVER_ERROR,
          `Circuit breaker open for method: ${method}`,
          did
        );
      }
    }

    try {
      const doc = await this.attemptWithRetry(
        () => driver.resolve(did),
        3,
        1000
      );
      
      // Reset circuit breaker on success
      if (this.options.enableCircuitBreaker) {
        this.recordSuccess(method);
      }
      
      return doc;
    } catch (error) {
      // Record failure for circuit breaker
      if (this.options.enableCircuitBreaker) {
        this.recordFailure(method);
      }
      
      throw new DIDAuthException(
        DIDAuthError.RESOLVER_ERROR,
        `Failed to resolve DID: ${error}`,
        did
      );
    }
  }

  /**
   * Attempt operation with exponential backoff retry
   */
  private async attemptWithRetry<T>(
    operation: () => Promise<T>,
    maxAttempts = 3,
    baseDelay = 1000
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt < maxAttempts - 1) {
          // Exponential backoff with jitter
          const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Cache document at all levels
   */
  private async cacheDocument(did: string, doc: DIDDocument, ttl: number): Promise<void> {
    const cached: CachedDocument = {
      document: doc,
      timestamp: Date.now(),
      ttl
    };
    
    // L1: Memory cache
    this.memoryCache.set(did, cached);
    
    // L2: Simulated Redis cache
    this.l2Cache.set(did, cached);
    
    // L3: CDN cache would be updated via webhook/API in production
  }

  /**
   * Circuit breaker: check if we can attempt resolution
   */
  private canAttempt(breaker: CircuitBreakerState): boolean {
    if (breaker.state === 'closed') {
      return true;
    }
    
    if (breaker.state === 'open') {
      // Check if enough time has passed to try half-open
      const timeSinceFailure = Date.now() - breaker.lastFailure;
      if (timeSinceFailure > 10000) { // 10 seconds
        breaker.state = 'half-open';
        return true;
      }
      return false;
    }
    
    // Half-open: allow one attempt
    return true;
  }

  /**
   * Record successful resolution
   */
  private recordSuccess(method: string): void {
    const breaker = this.circuitBreakers.get(method)!;
    breaker.failures = 0;
    breaker.state = 'closed';
  }

  /**
   * Record failed resolution
   */
  private recordFailure(method: string): void {
    const breaker = this.circuitBreakers.get(method)!;
    breaker.failures++;
    breaker.lastFailure = Date.now();
    
    // Open circuit if failure threshold reached
    if (breaker.failures >= 5) {
      breaker.state = 'open';
    }
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.memoryCache.clear();
    this.l2Cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    l1Size: number;
    l1HitRate: number;
    l2Size: number;
    methods: string[];
  } {
    return {
      l1Size: this.memoryCache.size,
      l1HitRate: 0, // Would track this in production
      l2Size: this.l2Cache.size,
      methods: Array.from(this.drivers.keys())
    };
  }
}