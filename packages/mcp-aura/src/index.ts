/**
 * MCP-AURA Integration Package
 * 
 * This package provides integration between the Model Context Protocol (MCP)
 * and AURA-enabled websites, allowing AI agents to interact with web services
 * through the AURA protocol.
 */

// Core AuraAdapter for direct usage
export { AuraAdapter, type ExecutionResult } from './AuraAdapter.js';

// MCP Handler - the main glue layer for MCP integration
export { 
  handleMCPRequest, 
  handleMCPRequestBatch, 
  getSiteInfo, 
  clearAdapterCache, 
  getCacheStatus,
  type MCPRequest, 
  type MCPResponse 
} from './mcp-handler.js';

// Re-export useful types from aura-protocol for convenience
export type { AuraManifest, AuraState, Capability, Resource } from 'aura-protocol';
