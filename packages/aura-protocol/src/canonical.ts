import { createHash } from "node:crypto";
export function revisionOf(value: unknown): string {
  const { revision: _revision, ...content } = value as Record<string, unknown>;
  return createHash("sha256").update(JSON.stringify(canonicalizeJsonValue(content))).digest("hex");
}
export function canonicalizeJsonValue(value: unknown): any {
  if (Array.isArray(value)) return value.map(canonicalizeJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => [key, canonicalizeJsonValue(item)]));
}
export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalizeJsonValue(value), null, 2) + "\n";
}
