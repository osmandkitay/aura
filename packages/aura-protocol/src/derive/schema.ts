import { MAX_SCHEMA_DEPTH } from "../constants";
import { JsonSchema } from "../schema/types";
import { pointerEscape, readPointer } from "../pointer";
import { CompileError } from "./shared";
import { unsupportedNumberPointer } from "../numbers";

const keywords = new Set(["type", "properties", "required", "additionalProperties", "items",
  "enum", "const", "title", "description", "default", "examples",
  "minLength", "maxLength", "pattern", "minimum", "maximum", "exclusiveMinimum",
  "exclusiveMaximum", "multipleOf", "minItems", "maxItems", "uniqueItems", "minProperties", "maxProperties"]);
export function resolveObject(root: any, value: any, at: string, config: string, stack: string[] = []): any {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CompileError("SOURCE_OBJECT", at, config, "Expected an object");
  if (!Object.hasOwn(value, "$ref")) return value;
  if (typeof value.$ref !== "string" || !value.$ref.startsWith("#/")) throw new CompileError("REMOTE_REF", at, config, "Only same-document references are supported");
  if (Object.keys(value).some(k => k !== "$ref")) throw new CompileError("REF_SIBLING", at, config, "Reference siblings are unsupported");
  if (stack.includes(value.$ref) || stack.length >= MAX_SCHEMA_DEPTH) throw new CompileError("RECURSIVE_REF", at, config, "Recursive or excessive reference expansion");
  let target;
  try { target = readPointer(root, decodeURIComponent(value.$ref.slice(1))); }
  catch { throw new CompileError("REF_POINTER", at, config, "Invalid reference pointer"); }
  if (!target.found) throw new CompileError("MISSING_REF", at, config, "Reference target does not exist");
  return resolveObject(root, target.value, value.$ref.slice(1), config, [...stack, value.$ref]);
}
export function compileSchema(root: any, raw: any, at: string, config: string, oas30: boolean, stack: string[] = [], depth = 0, budget = { nodes: 0 }): JsonSchema {
  const fail = (code: string, detail: string): never => { throw new CompileError(code, at, config, detail); };
  if (depth > MAX_SCHEMA_DEPTH) fail("SCHEMA_DEPTH", "Schema expansion exceeds 64 levels");
  if (++budget.nodes > 10000) fail("SCHEMA_NODES", "Schema expansion exceeds 10000 nodes");
  if (typeof raw === "boolean") {
    if (oas30) fail("SCHEMA_VERSION", "Boolean schemas require OpenAPI 3.1");
    return raw;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("SCHEMA", "Expected an explicit typed schema");
  const numeric = unsupportedNumberPointer(raw);
  if (numeric !== undefined) throw new CompileError("NUMBER_UNSUPPORTED", at + numeric, config, "Use finite numbers and safe integers; encode large IDs as strings");
  if (Object.hasOwn(raw, "$ref")) {
    const ref = raw.$ref;
    if (typeof ref !== "string" || !ref.startsWith("#/")) fail("REMOTE_REF", "Only same-document references are supported");
    if (stack.includes(ref)) fail("RECURSIVE_REF", "Recursive schema cannot be finitely expanded");
    const target = resolveObject(root, raw, at, config);
    return compileSchema(root, target, ref.slice(1), config, oas30, [...stack, ref], depth + 1, budget);
  }
  if (raw.allOf) {
    if (!Array.isArray(raw.allOf) || !raw.allOf.length || Object.keys(raw).some(k => !["allOf", "title", "description"].includes(k)))
      fail("ALLOF", "Only disjoint open-object allOf is supported");
    const merged: any = { type: "object", properties: Object.create(null), required: [] };
    raw.allOf.forEach((branch: any, i: number) => {
      const schema: any = compileSchema(root, branch, at + "/allOf/" + i, config, oas30, stack, depth + 1, budget);
      if (schema.type !== "object" || Object.keys(schema).some(k => !["type", "properties", "required"].includes(k)))
        fail("ALLOF", "Closed objects or constrained allOf branches are unsupported");
      for (const [name, property] of Object.entries(schema.properties ?? {})) {
        if (Object.hasOwn(merged.properties, name)) fail("ALLOF", "Overlapping allOf properties are unsupported");
        merged.properties[name] = property;
      }
      merged.required.push(...(schema.required ?? []));
    });
    merged.required = [...new Set(merged.required)].sort();
    for (const k of ["title", "description"]) if (Object.hasOwn(raw, k)) merged[k] = raw[k];
    return merged;
  }
  for (const key of Object.keys(raw)) {
    if (!keywords.has(key) && !(key === "nullable" && oas30)) fail("SCHEMA_KEYWORD", "Unsupported schema keyword: " + key);
  }
  if (!raw.type) fail("SCHEMA_TYPE", "An explicit type is required");
  const result: any = { ...raw };
  if (oas30) {
    if (Array.isArray(raw.type) || raw.type === "null") fail("SCHEMA_VERSION", "OpenAPI 3.0 requires a single non-null type");
    if (raw.nullable !== undefined && typeof raw.nullable !== "boolean") fail("NULLABLE", "nullable must be boolean");
    if (raw.nullable === true) result.type = [raw.type, "null"];
    delete result.nullable;
    for (const name of ["Minimum", "Maximum"]) {
      const exclusive = "exclusive" + name, inclusive = name.toLowerCase();
      if (result[exclusive] !== undefined && typeof result[exclusive] !== "boolean") fail("SCHEMA_VERSION", "OpenAPI 3.0 exclusive bounds must be boolean");
      if (typeof result[exclusive] === "boolean") {
        if (result[exclusive]) {
          if (typeof result[inclusive] !== "number") fail("EXCLUSIVE_BOUND", "Exclusive bound requires inclusive bound");
          result[exclusive] = result[inclusive]; delete result[inclusive];
        } else delete result[exclusive];
      }
    }
  }
  if (raw.properties) {
    if (typeof raw.properties !== "object" || Array.isArray(raw.properties)) fail("PROPERTIES", "properties must be a schema map");
    if (Object.hasOwn(raw.properties, "__proto__")) fail("SCHEMA_PROPERTY", "Schema property __proto__ is unsupported by the bundled validator");
    result.properties = Object.fromEntries(Object.entries(raw.properties).map(([name, schema]) =>
      [name, compileSchema(root, schema, at + "/properties/" + pointerEscape(name), config, oas30, stack, depth + 1, budget)]));
  }
  if (raw.items !== undefined) result.items = compileSchema(root, raw.items, at + "/items", config, oas30, stack, depth + 1, budget);
  if (raw.additionalProperties !== undefined && typeof raw.additionalProperties !== "boolean")
    result.additionalProperties = compileSchema(root, raw.additionalProperties, at + "/additionalProperties", config, oas30, stack, depth + 1, budget);
  if (raw.required !== undefined) {
    if (!Array.isArray(raw.required) || raw.required.some((v: unknown) => typeof v !== "string")) fail("REQUIRED", "required must be a string array");
    result.required = [...new Set(raw.required)].sort();
  }
  return result;
}
