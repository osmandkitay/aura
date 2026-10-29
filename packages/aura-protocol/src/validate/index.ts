import fs from "node:fs";
import path from "node:path";
import Ajv, { ValidateFunction } from "ajv";
import { AuraConfig, AuraDocument, AuraState, Plan, PublishedAuraAction, PublishedAuraIndex } from "../schema/types";
import { actionIntegrity, documentIntegrity, validHttpUrl } from "./integrity";
import { AURA_V2_SCHEMA_URL, AURA_ACTION_SCHEMA_URL, AURA_PUBLISH_SCHEMA_URL, AURA_CONFIG_SCHEMA_URL, AURA_PLAN_SCHEMA_URL } from "../constants";
import { MAX_ACTION_BYTES } from "../constants";
import { stableStringify } from "../canonical";
export type ValidationTarget = "document" | "publish" | "action" | "config" | "plan" | "state";
export interface ValidationResult<T> { valid: boolean; target: ValidationTarget; schemaPath: string; errors: string[]; value?: T }
const validators = new Map<ValidationTarget, { schemaPath: string; validate: ValidateFunction }>();
function validator(target: ValidationTarget) {
  if (validators.has(target)) return validators.get(target)!;
  const file = "aura-" + ({ document: "v2", publish: "publish", action: "action", config: "config", plan: "plan", state: "state" }[target]) + ".schema.json";
  const installed = path.resolve(__dirname, "..", file);
  const authored = path.resolve(__dirname, "..", "..", "schema", file);
  const schemaPath = fs.existsSync(installed) ? installed : authored;
  const validate = new Ajv({ allErrors: true, strict: false, ownProperties: true, validateFormats: false }).compile(JSON.parse(fs.readFileSync(schemaPath, "utf8")));
  const result = { schemaPath, validate }; validators.set(target, result); return result;
}
function check<T>(value: unknown, target: ValidationTarget, integrity?: (v: T) => string[]): ValidationResult<T> {
  const { schemaPath, validate } = validator(target);
  const errors = validate(value) ? [] : (validate.errors ?? []).map(e => (e.instancePath || "/") +
    (e.keyword === "required" ? "/" + e.params.missingProperty : "") + ": " + e.message);
  if (!errors.length && integrity) {
    try { errors.push(...integrity(value as T)); } catch { errors.push("/: invalid mechanical contract"); }
  }
  return { valid: !errors.length, target, schemaPath, errors, ...(!errors.length ? { value: value as T } : {}) };
}
function envelopeErrors(v: any): string[] {
  return [v.target.url, v.publisher.url, v.source.url].every(url => validHttpUrl(url)) ? [] : ["/: provenance/target URLs must be concrete HTTP(S) without credentials/query/fragment"];
}
export function validateConfig(value: unknown): ValidationResult<AuraConfig> {
  return check(value, "config", v => {
    const errors = envelopeErrors(v);
    const ids = v.actions.map(a => a.id.toLowerCase());
    if (new Set(ids).size !== ids.length) errors.push("/actions: duplicate or case-colliding id");
    return errors;
  });
}
export function validateAuraDocument(value: unknown): ValidationResult<AuraDocument> {
  return check(value, "document", v => [...envelopeErrors(v), ...documentIntegrity(v)]);
}
export function validatePublishedAction(value: unknown): ValidationResult<PublishedAuraAction> {
  return check(value, "action", v => [...envelopeErrors(v), ...actionIntegrity(v, v.target.url)]);
}
export function validatePublishedIndex(value: unknown): ValidationResult<PublishedAuraIndex> {
  return check(value, "publish", v => {
    const errors = envelopeErrors(v), ids = v.actions.map(a => a.id);
    if (Buffer.byteLength(stableStringify(v)) > MAX_ACTION_BYTES) errors.push("/: serialized index exceeds 1 MiB");
    if (new Set(ids.map(id => id.toLowerCase())).size !== ids.length) errors.push("/actions: duplicate id");
    for (const a of v.actions) {
      if (a.href !== "aura/actions/" + a.id + ".json") errors.push("/actions: href disagrees with id");
      for (const id of a.requires ?? []) if (!ids.includes(id)) errors.push("/actions: unknown requires id");
    }
    return errors;
  });
}
export const validatePlan = (value: unknown): ValidationResult<Plan> => check(value, "plan");
export const validateState = (value: unknown): ValidationResult<AuraState> => check(value, "state");
export function validateAny(value: unknown): ValidationResult<any> {
  const v = value as any;
  if (v?.$schema === AURA_V2_SCHEMA_URL) return validateAuraDocument(v);
  if (v?.$schema === AURA_ACTION_SCHEMA_URL) return validatePublishedAction(v);
  if (v?.$schema === AURA_PUBLISH_SCHEMA_URL) return validatePublishedIndex(v);
  if (v?.$schema === AURA_CONFIG_SCHEMA_URL) return validateConfig(v);
  if (v?.$schema === AURA_PLAN_SCHEMA_URL) return validatePlan(v);
  if (v?.version === 2 && Array.isArray(v?.actions) && v.$schema === undefined) return validateState(v);
  throw new Error("Could not determine AURA validation target");
}
export function validateFile(filePath: string): ValidationResult<any> {
  return validateAny(JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8")));
}
