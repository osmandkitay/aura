import { AURA_PROTOCOL_NAME, AURA_V2_SCHEMA_URL, AURA_VERSION } from "../constants";
import { inferConfirm, inferRisk, normalizeActionSemantics } from "../normalize";
import { AuraAuth, AuraDocument, AuraIntent, HttpMethod } from "../schema/types";
import { AuraActionCandidate, coalesceTitle, finalizeActionCandidates, normalizeMethod, uniqueStrings } from "./shared";

interface AuraV1Policy {
  authHint?: string;
}

interface DeriveOptions {
  sourceFile?: string;
}

function inferEncoding(action: Record<string, unknown>, method: HttpMethod): "json" | "query" | "none" {
  if (action.encoding === "json" || action.encoding === "query") {
    return action.encoding;
  }

  if (method === "GET") {
    return "query";
  }

  return Object.keys((action.parameterMapping as Record<string, string> | undefined) ?? {}).length > 0 ? "json" : "none";
}

function inferAuth(policy: AuraV1Policy | undefined, intent: AuraIntent): AuraAuth | undefined {
  if (intent.domain === "session" && intent.verb === "login") {
    return { kind: "none", required: false };
  }

  if (!policy?.authHint) {
    return undefined;
  }

  if (policy.authHint === "cookie" || policy.authHint === "bearer") {
    return { kind: policy.authHint, required: true };
  }

  if (policy.authHint === "none") {
    return { kind: "none", required: false };
  }

  return { kind: "unknown" };
}

export function deriveFromAuraV1(value: unknown, options: DeriveOptions = {}): AuraDocument {
  const manifest = value as Record<string, any>;
  const capabilityResources = new Map<string, string[]>();

  for (const [resourceId, resource] of Object.entries(manifest.resources ?? {})) {
    for (const operation of Object.values((resource as Record<string, any>).operations ?? {})) {
      const capabilityId = (operation as Record<string, any>).capabilityId;
      if (!capabilityId) {
        continue;
      }

      const existing = capabilityResources.get(capabilityId) ?? [];
      existing.push(resourceId);
      capabilityResources.set(capabilityId, existing);
    }
  }

  const actions: AuraActionCandidate[] = [];

  for (const [capabilityId, capabilityValue] of Object.entries(manifest.capabilities ?? {})) {
    const capability = capabilityValue as Record<string, any>;
    const action = (capability.action ?? {}) as Record<string, unknown>;
    const method = normalizeMethod(action.method, "GET");
    const path = typeof action.urlTemplate === "string" ? action.urlTemplate : "/";
    const normalized = normalizeActionSemantics({
      rawName: capabilityId,
      summary: capability.description,
      method,
      path
    });
    const risk = inferRisk(normalized.intent, method);
    const resourceIds = uniqueStrings(capabilityResources.get(capabilityId) ?? []) ?? [];

    actions.push({
      key: normalized.key,
      title: coalesceTitle(capability.description, normalized.intent),
      intent: normalized.intent,
      entrypoint: {
        type: "http",
        method,
        path,
        encoding: inferEncoding(action, method),
        parameterLocation: action.parameterLocation as Record<string, "path" | "query" | "header" | "body"> | undefined,
        parameterMapping: action.parameterMapping as Record<string, string> | undefined
      },
      auth: inferAuth(manifest.policy as AuraV1Policy | undefined, normalized.intent),
      confirm: inferConfirm(risk),
      risk,
      input: capability.parameters,
      docs: capability.description ? { summary: capability.description } : undefined,
      aliases: uniqueStrings([capabilityId, ...resourceIds]),
      origin: {
        source: "aura-v1",
        file: options.sourceFile,
        path,
        resource: resourceIds[0],
        capability: capabilityId,
        method,
        ref: `/capabilities/${capabilityId}`,
        summary: capability.description
      },
      confidence: normalized.confidence
    });
  }

  return {
    $schema: AURA_V2_SCHEMA_URL,
    protocol: AURA_PROTOCOL_NAME,
    version: AURA_VERSION,
    site: {
      name: manifest.site?.name ?? "AURA site",
      url: manifest.site?.url,
      description: manifest.site?.description
    },
    source: {
      kind: "aura-v1",
      file: options.sourceFile
    },
    actions: finalizeActionCandidates(actions)
  };
}
