import { pointerEscape } from './pointer';

// JSON is parsed as binary64. Reject values whose integer identity cannot be trusted.
export function unsupportedNumberPointer(value: unknown, pointer = ''): string | undefined {
  if (typeof value === 'bigint' || (typeof value === 'number' &&
    (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))))) return pointer;
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const invalid = unsupportedNumberPointer(child, pointer + '/' + pointerEscape(key));
      if (invalid !== undefined) return invalid;
    }
  }
  return undefined;
}
