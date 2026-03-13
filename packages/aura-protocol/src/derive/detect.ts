import { AuraInputKind } from "../schema/types";

export function detectInputKind(value: unknown): AuraInputKind {
  if (!value || typeof value !== "object") {
    throw new Error("Input must be a JSON object.");
  }

  const candidate = value as Record<string, unknown>;

  if (Array.isArray(candidate.actions)) {
    return "aura-v2";
  }

  if (typeof candidate.openapi === "string") {
    return "openapi";
  }

  throw new Error("Unsupported input. Expected a local OpenAPI document or an AURA 2.0 document.");
}
