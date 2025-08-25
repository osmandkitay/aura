import { openDB, DBSchema, IDBPDatabase } from 'idb';
import * as ed from '@noble/ed25519';
import * as secp from '@noble/secp256k1';
import { DIDAuthError, DIDAuthException } from '../types/index.js';

interface KeyDB extends DBSchema {
  keys: {
    key: string;
    value: {
      did: string;
      publicKey: JsonWebKey;
      privateKey: JsonWebKey;
      algorithm: 'Ed25519' | 'ECDSA';
      created: number;
      lastUsed: number;
    };
  };
  derivations: {
    key: string;
    value: {
      parentDID: string;
      path: string;
      index: number;
      context: string;
    };
  };
}

export interface DIDKeyManager {
  generateKeyPair(algorithm: 'Ed25519' | 'ECDSA'): Promise<CryptoKeyPair>;
  deriveKey(masterKey: CryptoKey, path: string): Promise<CryptoKey>;
  storeKey(did: string, keyPair: CryptoKeyPair): Promise<void>;
  retrieveKey(did: string): Promise<CryptoKeyPair>;
  deleteKey(did: string): Promise<void>;
}

export class SecureKeyManager implements DIDKeyManager {
  private db?: IDBPDatabase<KeyDB>;
  private memoryKeys: Map<string, CryptoKeyPair> = new Map();
  private useMemoryStorage: boolean;

  constructor(useMemoryStorage = false) {
    this.useMemoryStorage = useMemoryStorage;
  }

  async init(): Promise<void> {
    if (!this.useMemoryStorage && typeof window !== 'undefined') {
      this.db = await openDB<KeyDB>('did-auth-keys', 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('keys')) {
            db.createObjectStore('keys', { keyPath: 'did' });
          }
          if (!db.objectStoreNames.contains('derivations')) {
            db.createObjectStore('derivations', { keyPath: 'path' });
          }
        },
      });
    }
  }

  async generateKeyPair(algorithm: 'Ed25519' | 'ECDSA' = 'Ed25519'): Promise<CryptoKeyPair> {
    if (typeof window === 'undefined' || !window.crypto?.subtle) {
      // Node.js or non-browser environment - use noble libraries
      return this.generateKeyPairFallback(algorithm);
    }

    try {
      if (algorithm === 'Ed25519') {
        // Check if Ed25519 is supported
        try {
          return await crypto.subtle.generateKey(
            { name: 'Ed25519' },
            false,
            ['sign', 'verify']
          );
        } catch {
          // Fallback to noble-ed25519
          return this.generateKeyPairFallback(algorithm);
        }
      } else {
        // ECDSA P-256
        return await crypto.subtle.generateKey(
          {
            name: 'ECDSA',
            namedCurve: 'P-256'
          },
          false,
          ['sign', 'verify']
        );
      }
    } catch (error) {
      throw new DIDAuthException(
        DIDAuthError.KEY_NOT_FOUND,
        `Failed to generate key pair: ${error}`,
      );
    }
  }

  private async generateKeyPairFallback(algorithm: 'Ed25519' | 'ECDSA'): Promise<CryptoKeyPair> {
    if (algorithm === 'Ed25519') {
      const privKey = ed.utils.randomPrivateKey();
      const pubKey = await ed.getPublicKey(privKey);
      
      // Convert to CryptoKey-like objects
      return {
        publicKey: {
          type: 'public',
          algorithm: { name: 'Ed25519' },
          usages: ['verify'],
          extractable: true,
          _raw: pubKey
        } as any,
        privateKey: {
          type: 'private',
          algorithm: { name: 'Ed25519' },
          usages: ['sign'],
          extractable: false,
          _raw: privKey
        } as any
      };
    } else {
      const privKey = secp.utils.randomPrivateKey();
      const pubKey = secp.getPublicKey(privKey);
      
      return {
        publicKey: {
          type: 'public',
          algorithm: { name: 'ECDSA', namedCurve: 'secp256k1' },
          usages: ['verify'],
          extractable: true,
          _raw: pubKey
        } as any,
        privateKey: {
          type: 'private',
          algorithm: { name: 'ECDSA', namedCurve: 'secp256k1' },
          usages: ['sign'],
          extractable: false,
          _raw: privKey
        } as any
      };
    }
  }

  async deriveKey(masterKey: CryptoKey, path: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const info = encoder.encode(`did:derivation:${path}`);
    
    try {
      if (typeof window !== 'undefined' && window.crypto?.subtle) {
        // Import master key for derivation
        const baseKey = await crypto.subtle.importKey(
          'raw',
          await crypto.subtle.exportKey('raw', masterKey),
          { name: 'HKDF' },
          false,
          ['deriveKey', 'deriveBits']
        );

        // Derive key material
        const derivedKeyMaterial = await crypto.subtle.deriveBits(
          {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: encoder.encode('DID_AUTH_2025'),
            info
          },
          baseKey,
          256 // 32 bytes
        );

        // Import as Ed25519 key
        return await crypto.subtle.importKey(
          'raw',
          derivedKeyMaterial,
          { name: 'Ed25519' },
          false,
          ['sign']
        );
      } else {
        // Fallback derivation using noble libraries
        const masterKeyRaw = (masterKey as any)._raw;
        const pathHash = await ed.utils.sha256(info);
        const derived = await ed.utils.sha256(new Uint8Array([...masterKeyRaw, ...pathHash]));
        
        return {
          type: 'private',
          algorithm: { name: 'Ed25519' },
          usages: ['sign'],
          extractable: false,
          _raw: derived.slice(0, 32)
        } as any;
      }
    } catch (error) {
      throw new DIDAuthException(
        DIDAuthError.KEY_NOT_FOUND,
        `Failed to derive key: ${error}`,
      );
    }
  }

  async storeKey(did: string, keyPair: CryptoKeyPair): Promise<void> {
    if (this.useMemoryStorage) {
      this.memoryKeys.set(did, keyPair);
      return;
    }

    if (!this.db) {
      await this.init();
    }

    try {
      // Export keys to JWK for storage
      const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
      const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
      
      const algorithm = (keyPair.publicKey.algorithm as any).name;
      
      await this.db!.put('keys', {
        did,
        publicKey: publicKeyJwk,
        privateKey: privateKeyJwk,
        algorithm,
        created: Date.now(),
        lastUsed: Date.now()
      });
    } catch (error) {
      // Fallback to memory storage
      this.memoryKeys.set(did, keyPair);
    }
  }

  async retrieveKey(did: string): Promise<CryptoKeyPair> {
    if (this.useMemoryStorage) {
      const keyPair = this.memoryKeys.get(did);
      if (!keyPair) {
        throw new DIDAuthException(
          DIDAuthError.KEY_NOT_FOUND,
          `Key not found for DID: ${did}`,
          did
        );
      }
      return keyPair;
    }

    if (!this.db) {
      await this.init();
    }

    try {
      const stored = await this.db!.get('keys', did);
      if (!stored) {
        // Check memory storage as fallback
        const memKey = this.memoryKeys.get(did);
        if (memKey) return memKey;
        
        throw new DIDAuthException(
          DIDAuthError.KEY_NOT_FOUND,
          `Key not found for DID: ${did}`,
          did
        );
      }

      // Import keys from JWK
      const algorithm = stored.algorithm === 'Ed25519' 
        ? { name: 'Ed25519' }
        : { name: 'ECDSA', namedCurve: 'P-256' };

      const publicKey = await crypto.subtle.importKey(
        'jwk',
        stored.publicKey,
        algorithm,
        true,
        ['verify']
      );

      const privateKey = await crypto.subtle.importKey(
        'jwk',
        stored.privateKey,
        algorithm,
        false,
        ['sign']
      );

      // Update last used
      stored.lastUsed = Date.now();
      await this.db!.put('keys', stored);

      return { publicKey, privateKey };
    } catch (error) {
      if (error instanceof DIDAuthException) throw error;
      
      throw new DIDAuthException(
        DIDAuthError.KEY_NOT_FOUND,
        `Failed to retrieve key: ${error}`,
        did
      );
    }
  }

  async deleteKey(did: string): Promise<void> {
    this.memoryKeys.delete(did);
    
    if (!this.useMemoryStorage && this.db) {
      await this.db.delete('keys', did);
    }
  }

  async getNextDerivationIndex(parentDID: string, context: string): Promise<number> {
    if (!this.db) {
      // Simple in-memory counter
      const key = `${parentDID}:${context}`;
      const current = this.derivationIndices.get(key) || 0;
      this.derivationIndices.set(key, current + 1);
      return current + 1;
    }

    const path = `${parentDID}/${context}`;
    const existing = await this.db.get('derivations', path);
    
    if (existing) {
      existing.index++;
      await this.db.put('derivations', existing);
      return existing.index;
    } else {
      await this.db.put('derivations', {
        parentDID,
        path,
        index: 1,
        context
      });
      return 1;
    }
  }

  private derivationIndices = new Map<string, number>();

  // Cleanup old keys
  async cleanupExpiredKeys(maxAge = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    let deleted = 0;
    const cutoff = Date.now() - maxAge;

    // Clean memory keys (no timestamp tracking in memory)
    // This is a simplified version
    
    if (this.db) {
      const tx = this.db.transaction('keys', 'readwrite');
      const store = tx.objectStore('keys');
      const keys = await store.getAll();
      
      for (const key of keys) {
        if (key.lastUsed < cutoff) {
          await store.delete(key.did);
          deleted++;
        }
      }
      
      await tx.complete;
    }

    return deleted;
  }
}