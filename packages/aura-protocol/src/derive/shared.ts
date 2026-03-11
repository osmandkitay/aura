import { AuraIntent, HttpMethod } from "../schema/types";
import { humanizeIntent } from "../normalize";

export interface AuraActionIdentity {
  key: string;
  id: string;
  collision: boolean;
}

export function ensureUniqueActionIdentity(baseKey: string, keyCounts: Map<string, number>): AuraActionIdentity {
  const nextCount = (keyCounts.get(baseKey) ?? 0) + 1;
  keyCounts.set(baseKey, nextCount);

  return {
    key: baseKey,
    id: nextCount === 1 ? baseKey : `${baseKey}__${nextCount}`,
    collision: nextCount > 1
  };
}

export function coalesceTitle(preferredTitle: unknown, intent: AuraIntent): string {
  if (typeof preferredTitle === "string" && preferredTitle.trim()) {
    return preferredTitle.trim();
  }

  return humanizeIntent(intent);
}

export function normalizeMethod(method: unknown, fallback: HttpMethod = "GET"): HttpMethod {
  if (typeof method !== "string") {
    return fallback;
  }

  const upper = method.toUpperCase();
  if (upper === "GET" || upper === "POST" || upper === "PUT" || upper === "PATCH" || upper === "DELETE") {
    return upper;
  }

  return fallback;
}

export function uniqueStrings(values: Array<string | undefined>): string[] | undefined {
  const filtered = Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim())).map((value) => value.trim())));
  return filtered.length > 0 ? filtered : undefined;
}
