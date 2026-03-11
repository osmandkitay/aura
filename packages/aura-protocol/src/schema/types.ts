export type JsonSchema = boolean | Record<string, unknown>;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type AuraInputKind = "aura-v1" | "openapi" | "aura-v2";
export type AuraAuthKind = "none" | "cookie" | "bearer" | "api-key" | "oauth2" | "unknown";
export type AuraRisk = "low" | "medium" | "high";
export type AuraConfirm = "never" | "suggested" | "required";
export type AuraConfidenceLabel = "low" | "medium" | "high";

export interface AuraSite {
  name: string;
  url?: string;
  description?: string;
}

export interface AuraIntent {
  domain: string;
  verb: string;
}

export interface AuraEntrypoint {
  type: "http";
  method: HttpMethod;
  path: string;
  encoding?: "json" | "query" | "none";
  parameterLocation?: Record<string, "path" | "query" | "header" | "body">;
  parameterMapping?: Record<string, string>;
}

export interface AuraAuth {
  kind: AuraAuthKind;
  required?: boolean;
}

export interface AuraDocs {
  summary?: string;
  href?: string;
}

export interface AuraOrigin {
  source: AuraInputKind;
  file?: string;
  path?: string;
  resource?: string;
  capability?: string;
  operationId?: string;
  method?: HttpMethod;
  ref?: string;
  summary?: string;
}

export interface AuraConfidence {
  label: AuraConfidenceLabel;
  score: number;
  reason: string;
}

export interface AuraAction {
  id: string;
  key: string;
  title: string;
  intent: AuraIntent;
  entrypoint: AuraEntrypoint;
  auth?: AuraAuth;
  confirm?: AuraConfirm;
  risk?: AuraRisk;
  input?: JsonSchema;
  result?: JsonSchema;
  docs?: AuraDocs;
  aliases?: string[];
  origin: AuraOrigin;
  confidence: AuraConfidence;
  extensions?: Record<string, unknown>;
}

export interface AuraDocumentSource {
  kind: AuraInputKind;
  file?: string;
}

export interface AuraDocument {
  $schema: string;
  protocol: "AURA";
  version: "2.0";
  site: AuraSite;
  source: AuraDocumentSource;
  actions: AuraAction[];
}

export interface PublishedAuraAction extends AuraAction {
  $schema: string;
}

export interface AuraActionSummary {
  id: string;
  key: string;
  title: string;
  intent: AuraIntent;
  href: string;
  docsHref?: string;
  auth?: AuraAuth;
  confirm?: AuraConfirm;
  risk?: AuraRisk;
}

export interface PublishedAuraIndex {
  $schema: string;
  protocol: "AURA";
  version: "2.0";
  site: AuraSite;
  actions: AuraActionSummary[];
}
