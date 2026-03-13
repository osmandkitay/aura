import { createHash } from "node:crypto";
import { canonicalizeJsonValue } from "../canonical";
import { AuraAction, AuraConfidence, AuraDocument, AuraIntent, HttpMethod } from "../schema/types";
import { humanizeIntent } from "../normalize";

export type AuraActionCandidate = Omit<AuraAction, "id">;

const MIN_LOCATOR_HASH_LENGTH = 12;
const SHA256_HEX_LENGTH = 64;

type IdentitySeedAction = Pick<AuraAction, "entrypoint" | "origin">;
type SortableAction = Pick<AuraAction, "key" | "entrypoint" | "origin">;

export interface AuraActionSourceIdentity {
  source: AuraAction["origin"]["source"];
  method: AuraAction["entrypoint"]["method"];
  path: AuraAction["entrypoint"]["path"];
  ref: string;
  operation: string;
  resource: string;
}

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

function canonicalJsonSeed(value: unknown): string {
  return JSON.stringify(canonicalizeJsonValue(value));
}

function locatorHash(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

function collisionAdjustedAction(candidate: AuraActionCandidate, id: string): AuraAction {
  return {
    ...candidate,
    id,
    aliases: normalizedAliases(candidate.aliases),
    confidence: collisionAdjustedConfidence(candidate.confidence)
  };
}

function resolveLocatorSuffixes(key: string, group: AuraActionCandidate[]): string[] {
  const fullHashes = group.map((candidate) => locatorHash(canonicalSourceIdentitySeed(candidate)));

  for (let prefixLength = MIN_LOCATOR_HASH_LENGTH; prefixLength <= SHA256_HEX_LENGTH; prefixLength += 1) {
    const prefixes = fullHashes.map((hash) => hash.slice(0, prefixLength));
    if (new Set(prefixes).size === prefixes.length) {
      return prefixes;
    }
  }

  throw new Error(`Unable to derive a unique stable locator hash for semantic key "${key}" from the available source identity facts.`);
}

function finalizeCollisionGroup(group: AuraActionCandidate[]): AuraAction[] {
  if (group.length === 0) {
    return [];
  }

  if (group.length === 1) {
    const [candidate] = group;
    return [
      {
        ...candidate,
        id: candidate.key,
        aliases: normalizedAliases(candidate.aliases),
        confidence: candidate.confidence
      }
    ];
  }

  const suffixes = resolveLocatorSuffixes(group[0].key, group);
  return group.map((candidate, index) => collisionAdjustedAction(candidate, `${candidate.key}__${suffixes[index]}`));
}

export function actionSourceIdentity(action: IdentitySeedAction): AuraActionSourceIdentity {
  return {
    source: action.origin.source,
    method: action.entrypoint.method,
    path: action.entrypoint.path,
    ref: action.origin.ref ?? "",
    operation: action.origin.operationId ?? action.origin.capability ?? "",
    resource: action.origin.resource ?? ""
  };
}

export function canonicalSourceIdentitySeed(action: IdentitySeedAction): string {
  return canonicalJsonSeed(actionSourceIdentity(action));
}

export function canonicalActionSortKey(action: SortableAction): string {
  return canonicalJsonSeed([action.key, actionSourceIdentity(action)]);
}

export function sortActionCandidates<T extends AuraActionCandidate>(candidates: T[]): T[] {
  return [...candidates].sort((left, right) => compareText(canonicalActionSortKey(left), canonicalActionSortKey(right)));
}

export function assignStableIds(candidates: AuraActionCandidate[]): AuraAction[] {
  const orderedCandidates = sortActionCandidates(candidates);
  const finalized: AuraAction[] = [];
  let currentGroup: AuraActionCandidate[] = [];

  const flushGroup = (): void => {
    finalized.push(...finalizeCollisionGroup(currentGroup));
    currentGroup = [];
  };

  for (const candidate of orderedCandidates) {
    if (currentGroup.length > 0 && currentGroup[0].key !== candidate.key) {
      flushGroup();
    }

    currentGroup.push(candidate);
  }

  flushGroup();
  return finalized;
}

export function finalizeActionCandidates(candidates: AuraActionCandidate[]): AuraAction[] {
  return assignStableIds(candidates);
}

export function canonicalizeDocument(document: AuraDocument): AuraDocument {
  return {
    ...document,
    source: {
      kind: document.source.kind
    },
    actions: document.actions.map((action) => {
      const { file: _ignoredOriginFile, ...origin } = action.origin as AuraAction["origin"] & { file?: string };

      return {
        ...action,
        aliases: normalizedAliases(action.aliases),
        origin
      };
    })
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
