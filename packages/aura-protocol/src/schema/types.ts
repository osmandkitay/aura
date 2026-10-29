export type JsonType = "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";
export type ValueType = JsonType | JsonType[];
export type JsonSchema = boolean | { type: ValueType; [key: string]: unknown };
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type AuraInputKind = "openapi" | "aura-v2";
export type AuraRisk = "low" | "medium" | "high";

export interface Publisher { name: string; url: string; role: "site-owner" | "third-party" }
export interface Source { url: string; version: string; kind: AuraInputKind }
export interface Target { url: string }
export interface Output {
  name: string; source: "body"; pointer: string; type: ValueType;
  required: boolean; visibility: "model" | "credential";
}
export interface AuraError { status: number; reason?: string; resolve?: string }
export interface Selection {
  id: string; key: string; risk: AuraRisk; method: HttpMethod; path: string;
  outputs: Output[]; title?: string; requires?: string[]; errors?: AuraError[];
}
export interface AuraConfig {
  $schema: string; publisher: Publisher; source: Omit<Source, "kind">;
  target: Target; actions: Selection[];
}
export interface Binding {
  input: string; in: "path" | "query" | "header" | "body"; name?: string;
  target?: ""; style?: "simple" | "form"; explode?: boolean; prefix?: "Bearer ";
}
export type AuraAuth = { kind: "none" } |
  { kind: "bearer" | "api-key"; input: string; name: string };
export interface Success { status: number; contentType: "application/json" | null; schema?: JsonSchema }
export interface AuraOrigin {
  source: AuraInputKind; ref: string; operationId?: string; summary?: string;
}
export interface AuraAction {
  id: string; key: string; risk: AuraRisk; title?: string;
  entrypoint: { method: HttpMethod; url: string; encoding: "json" | "none" };
  input: JsonSchema; bindings: Binding[]; auth: AuraAuth; success: Success[];
  outputs: Output[]; origin: AuraOrigin; aliases?: string[];
  requires?: string[]; errors?: AuraError[];
}
export interface Envelope {
  profile: "2.0.0-alpha.3"; revision: string;
  publisher: Publisher; source: Source; target: Target;
}
export interface AuraDocument extends Envelope {
  $schema: string; protocol: "AURA"; version: "2.0"; actions: AuraAction[];
}
export interface PublishedAuraAction extends AuraAction, Envelope { $schema: string }
export interface Signature { name: string; type: ValueType; required: boolean }
export interface AuraActionSummary {
  id: string; key: string; href: string;
  inputs: Signature[]; outputs: Signature[]; requires?: string[];
}
export interface PublishedAuraIndex extends Envelope {
  $schema: string; protocol: "AURA"; version: "2.0"; actions: AuraActionSummary[];
}
export type Assignment = { target: string } &
  ({ value: unknown; from?: never } | { from: { step: string; output: string }; value?: never });
export interface Plan {
  $schema: string; profile: "2.0.0-alpha.3"; descriptor: string; revision?: string;
  steps: { stepId: string; actionId: string; inputs: Assignment[] }[];
}
export interface AuraState {
  version: 2; revision: string;
  actions: { id: string; availability: "available" | "blocked"; reason?: string; resolve?: string }[];
}
