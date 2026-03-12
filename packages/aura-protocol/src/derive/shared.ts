import { canonicalizeJsonValue } from "../canonical";
import { AuraAction, AuraConfidence, AuraDocument, AuraIntent, HttpMethod } from "../schema/types";
import { humanizeIntent } from "../normalize";

export type AuraActionCandidate = Omit<AuraAction, "id">;

type SortableAction = Pick<AuraAction, "key" | "title" | "aliases" | "entrypoint" | "origin" | "confidence">;

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function collisionAdjustedConfidence(confidence: AuraConfidence): AuraConfidence {
  return {
    label: confidence.label === "high" ? "medium" : confidence.label,
    score: Math.max(0.55, confidence.score - 0.15),
    reason: `${confidence.reason}; a collision-safe id was added while keeping the semantic key stable`
  };
}

function normalizedAliases(aliases: string[] | undefined): string[] | undefined {
  return aliases ? uniqueStrings(aliases) : undefined;
}

export function canonicalActionSortKey(action: SortableAction): string {
  return JSON.stringify(
    canonicalizeJsonValue({
      key: action.key,
      source: action.origin.source,
      file: action.origin.file ?? "",
      method: action.entrypoint.method,
      path: action.entrypoint.path,
      ref: action.origin.ref ?? "",
      operation: action.origin.operationId ?? action.origin.capability ?? "",
      resource: action.origin.resource ?? "",
      title: action.title,
      summary: action.origin.summary ?? "",
      aliases: normalizedAliases(action.aliases),
      confidence: action.confidence
    })
  );
}

export function sortActionCandidates<T extends AuraActionCandidate>(candidates: T[]): T[] {
  return [...candidates].sort((left, right) => compareText(canonicalActionSortKey(left), canonicalActionSortKey(right)));
}

export function assignStableIds(candidates: AuraActionCandidate[]): AuraAction[] {
  const keyCounts = new Map<string, number>();

  return candidates.map((candidate) => {
    const nextCount = (keyCounts.get(candidate.key) ?? 0) + 1;
    keyCounts.set(candidate.key, nextCount);

    return {
      ...candidate,
      id: nextCount === 1 ? candidate.key : `${candidate.key}__${nextCount}`,
      aliases: normalizedAliases(candidate.aliases),
      confidence: nextCount === 1 ? candidate.confidence : collisionAdjustedConfidence(candidate.confidence)
    };
  });
}

export function finalizeActionCandidates(candidates: AuraActionCandidate[]): AuraAction[] {
  return assignStableIds(sortActionCandidates(candidates));
}

export function canonicalizeDocument(document: AuraDocument): AuraDocument {
  return {
    ...document,
    actions: sortActionCandidates(
      document.actions.map((action) => ({
        ...action,
        aliases: normalizedAliases(action.aliases)
      }))
    )
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
  const filtered = Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim())).map((value) => value.trim()))).sort(compareText);
  return filtered.length > 0 ? filtered : undefined;
}
