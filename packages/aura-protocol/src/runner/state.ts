import { AuraState, PublishedAuraIndex } from '../schema/types';
import { validateState } from '../validate';

export const MAX_STATE_HEADER_BYTES = 4096;
const prefix = 'v=2;data=';
export type StateObservation = { availability: 'unknown' | 'available' | 'blocked'; reason?: string; resolve?: string };
export interface ParsedState { actions: AuraState['actions']; diagnostic?: string }
export function encodeState(value: AuraState): string {
  if (!validateState(value).valid || new Set(value.actions.map(a => a.id)).size !== value.actions.length) throw new Error('STATE_PAYLOAD');
  const encoded = prefix + Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  if (encoded.length > MAX_STATE_HEADER_BYTES) throw new Error('STATE_SIZE');
  return encoded;
}
export function parseState(header: string | null | undefined, index: PublishedAuraIndex): ParsedState {
  const invalid = (diagnostic?: string): ParsedState => ({ actions: [], ...(diagnostic ? { diagnostic } : {}) });
  if (header === null || header === undefined) return invalid();
  if (header.length > MAX_STATE_HEADER_BYTES) return invalid('STATE_SIZE');
  if (!header.startsWith(prefix) || !/^[A-Za-z0-9_-]+$/.test(header.slice(prefix.length))) return invalid('STATE_FORMAT');
  let value: AuraState;
  try {
    const data = header.slice(prefix.length), bytes = Buffer.from(data, 'base64url');
    if (bytes.toString('base64url') !== data) return invalid('STATE_ENCODING');
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { return invalid('STATE_ENCODING'); }
  if (!validateState(value).valid) return invalid('STATE_PAYLOAD');
  if (value.revision !== index.revision) return invalid('STATE_STALE');
  const ids = new Set(index.actions.map(a => a.id)), seen = new Set<string>();
  for (const action of value.actions) {
    if (!ids.has(action.id) || seen.has(action.id) || (action.resolve !== undefined && !ids.has(action.resolve))) return invalid('STATE_ID');
    seen.add(action.id);
  }
  return { actions: value.actions };
}
export function stateFor(state: ParsedState, id: string): StateObservation {
  const action = state.actions.find(a => a.id === id);
  if (!action) return { availability: 'unknown' };
  const { availability, reason, resolve } = action;
  return { availability, ...(reason ? { reason } : {}), ...(resolve ? { resolve } : {}) };
}
