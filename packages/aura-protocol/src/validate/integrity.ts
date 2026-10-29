import Ajv from "ajv";
import { AuraAction, AuraActionSummary, AuraDocument, JsonSchema, Signature, ValueType } from "../schema/types";
import { AURA_ACTION_SCHEMA_URL, MAX_ACTION_BYTES, MAX_SCHEMA_DEPTH } from "../constants";
import { pointerSegments, pointersOverlap } from "../pointer";
import { revisionOf, stableStringify } from "../canonical";

export function typeList(type: ValueType): string[] { return Array.isArray(type) ? type : [type]; }
export function typeFits(source: ValueType, destination: ValueType): boolean {
  return typeList(source).every(t => typeList(destination).includes(t) || (t === "integer" && typeList(destination).includes("number")));
}
export function schemaAt(schema: JsonSchema, pointer: string): JsonSchema | undefined {
  let current: any = schema;
  for (const part of pointerSegments(pointer)) {
    if (!current || typeof current !== "object") return undefined;
    if (typeList(current.type).includes("array")) {
      if (!/^(0|[1-9][0-9]*)$/.test(part)) return undefined;
      current = current.items;
    } else current = Object.prototype.hasOwnProperty.call(current.properties ?? {}, part) ? current.properties[part] : undefined;
  }
  return current;
}
export function signatureFor(action: AuraAction): Pick<AuraActionSummary, "inputs" | "outputs"> {
  const inputs: Signature[] = [];
  const root: any = action.input;
  for (const namespace of Object.keys(root.properties ?? {}).sort()) {
    const schema = root.properties[namespace];
    if (namespace === "body") {
      const bodyRequired = (root.required ?? []).includes("body");
      inputs.push({ name: "/body", type: schema.type, required: bodyRequired });
      for (const name of Object.keys(schema.properties ?? {}).sort()) {
        const field = schema.properties[name];
        if (!field || typeof field !== "object" || !field.type) continue;
        inputs.push({ name: "/body/" + name.replace(/~/g, "~0").replace(/\//g, "~1"), type: field.type,
          required: bodyRequired && !typeList(schema.type).includes("null") && (schema.required ?? []).includes(name) });
      }
    }
    else for (const name of Object.keys(schema.properties ?? {}).sort()) {
      inputs.push({ name: "/" + namespace + "/" + name.replace(/~/g, "~0").replace(/\//g, "~1"),
        type: schema.properties[name].type, required: (root.required ?? []).includes(namespace) && (schema.required ?? []).includes(name) });
    }
  }
  return { inputs, outputs: action.outputs.map(o => ({ name: o.name, type: o.type, required: o.required })) };
}
export function validHttpUrl(value: string, template = false): boolean {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash &&
      (template || !/[{}]/.test(value)) && !/[{}]/.test(url.origin) && !/\s|\\/.test(value);
  } catch { return false; }
}
export function actionIntegrity(action: AuraAction, target: string): string[] {
  const errors: string[] = [];
  const add = (message: string) => errors.push(message);
  if (Buffer.byteLength(stableStringify(action)) > MAX_ACTION_BYTES) add("Serialized action exceeds 1 MiB");
  if (!validHttpUrl(action.entrypoint.url, true) || new URL(action.entrypoint.url).origin !== new URL(target).origin) add("Action URL conflicts with declared target origin");
  const root: any = action.input;
  if (!root || root.type !== "object" || root.additionalProperties !== false ||
    Object.keys(root.properties ?? {}).some(k => !["path", "query", "header", "body"].includes(k))) add("Input must be a closed namespaced object");
  const targets = new Set<string>();
  const inputs: string[] = [];
  for (const binding of action.bindings) {
    let schema: any;
    try { schema = schemaAt(action.input, binding.input); }
    catch { add("Invalid binding input pointer"); continue; }
    if (!schema || typeof schema !== "object") { add("Binding input does not identify a typed schema"); continue; }
    inputs.push(binding.input);
    const expected = "/" + binding.in + (binding.in === "body" ? "" : "/" + (binding.name ?? "").replace(/~/g, "~0").replace(/\//g, "~1"));
    if (binding.input !== expected) add("Binding must retain its declared namespace and wire name");
    const identity = binding.in + ":" + (binding.in === "header" ? binding.name?.toLowerCase() : binding.name ?? "");
    if (targets.has(identity)) add("Conflicting HTTP binding target");
    targets.add(identity);
    const scalar = (s: any) => s && ["string", "integer", "number", "boolean"].includes(s.type);
    if (binding.in === "path" && (binding.style !== "simple" || binding.explode !== false || !scalar(schema))) add("Unsupported path serialization");
    if (binding.in === "header") {
      if (binding.style !== "simple" || binding.explode !== false || !scalar(schema) ||
        !/^[!#$%&'*+.^_\x60|~0-9A-Za-z-]+$/.test(binding.name!) || /^(cookie|content-type|accept|host|content-length)$/i.test(binding.name!)) add("Unsupported header binding");
      if (/^authorization$/i.test(binding.name!) && action.auth.kind === "none") add("Authorization must have a declared auth contract");
    }
    if (binding.in === "query" && (binding.style !== "form" || binding.explode !== true ||
      !(scalar(schema) || (schema.type === "array" && scalar(schema.items))))) add("Unsupported query serialization");
    if (binding.prefix && !(binding.in === "header" && action.auth.kind === "bearer" && action.auth.input === binding.input)) add("Bearer prefix outside declared auth binding");
    if (binding.in !== "body" && binding.target !== undefined) add("Only whole-body targets are supported");
  }
  for (let i = 0; i < inputs.length; i++) if (inputs.slice(i + 1).some(p => pointersOverlap(inputs[i], p))) add("Overlapping input bindings");
  for (const namespace of Object.keys(root.properties ?? {})) {
    const schema = root.properties[namespace];
    if (namespace === "body") {
      if (!schema || typeof schema !== "object" || !schema.type) add("Body must have an explicit type");
      if (!inputs.includes("/body")) add("Unbound body");
    } else {
      if (schema.type !== "object" || schema.additionalProperties !== false) add("Parameter namespaces must be closed objects");
      for (const name of Object.keys(schema.properties ?? {})) {
        if (!inputs.includes("/" + namespace + "/" + name.replace(/~/g, "~0").replace(/\//g, "~1"))) add("Unbound input parameter");
      }
    }
  }
  const path = new URL(action.entrypoint.url).pathname.replace(/%7B/gi, "{").replace(/%7D/gi, "}");
  const names = [...path.matchAll(/{([^{}]+)}/g)].map(m => m[1]);
  if (path.replace(/{[^{}]+}/g, "").match(/[{}]/) ||
    names.some(n => !targets.has("path:" + n)) || action.bindings.some(b => b.in === "path" && !names.includes(b.name!))) add("URL template and path bindings disagree");
  for (const b of action.bindings.filter(b => b.in === "path")) {
    if (!(root.required ?? []).includes("path") || !(root.properties?.path?.required ?? []).includes(b.name)) add("Path binding input must be required");
  }
  const bodies = action.bindings.filter(b => b.in === "body").length;
  if ((action.entrypoint.encoding === "json") !== (bodies === 1) || (action.entrypoint.method === "GET" && bodies)) add("Body encoding conflicts with bindings or method");
  if (action.auth.kind !== "none") {
    const auth = action.auth;
    const binding = action.bindings.find(b => b.in === "header" && b.input === auth.input && b.name === auth.name);
    const schema: any = schemaAt(action.input, auth.input);
    if (!binding || !schema || schema.type !== "string" || schema.minLength !== 1 ||
      ["default", "const", "enum", "examples"].some(k => Object.hasOwn(schema, k)) ||
      !(root.required ?? []).includes("header") || !(root.properties?.header?.required ?? []).includes(auth.name)) add("Auth must bind a required raw credential without static values");
    if (auth.kind === "bearer" && (auth.name.toLowerCase() !== "authorization" || binding?.prefix !== "Bearer ")) add("Bearer auth requires explicit Authorization prefix");
    if (auth.kind === "api-key" && binding?.prefix) add("API key auth cannot add a bearer prefix");
  }
  for (const success of action.success) {
    if (success.status === 204 && success.contentType !== null) add("204 cannot have a body");
    for (const output of action.outputs) {
      if (success.contentType === null) { if (output.required) add("Required body output on no-body success"); continue; }
      const schema: any = schemaAt(success.schema!, output.pointer);
      if (!schema || typeof schema !== "object" || !typeFits(schema.type, output.type)) add("Output pointer/type conflicts with response schema: " + output.name);
    }
  }
  for (const [name, list] of [["output", action.outputs.map(o => o.name)], ["success", action.success.map(s => String(s.status))], ["error", (action.errors ?? []).map(e => String(e.status))]] as const) {
    if (new Set(list).size !== list.length) add("Duplicate " + name);
  }
  const checkSchema = (schema: JsonSchema, depth = 0): void => {
    if (depth > MAX_SCHEMA_DEPTH) { add("Schema exceeds depth limit"); return; }
    if (typeof schema === "boolean") return;
    if (schema.type === "array" && schema.items === undefined) add("Array schemas require items");
    if (schema.properties) for (const s of Object.values(schema.properties as Record<string, JsonSchema>)) checkSchema(s, depth + 1);
    if (schema.items !== undefined) checkSchema(schema.items as JsonSchema, depth + 1);
    if (schema.additionalProperties && typeof schema.additionalProperties === "object") checkSchema(schema.additionalProperties as JsonSchema, depth + 1);
  };
  for (const schema of [action.input, ...action.success.flatMap(s => s.schema === undefined ? [] : [s.schema])]) {
    checkSchema(schema);
    try { new Ajv({ strict: false, ownProperties: true, validateFormats: false }).compile(schema); } catch { add("Invalid runtime schema"); }
  }
  return errors;
}
export function documentIntegrity(document: AuraDocument): string[] {
  const errors: string[] = [];
  if (document.revision !== revisionOf(document)) errors.push("/revision: content revision mismatch");
  const ids = document.actions.map(a => a.id);
  if (new Set(ids.map(id => id.toLowerCase())).size !== ids.length) errors.push("/actions: duplicate or case-colliding id");
  if (ids.some((id, i) => i > 0 && ids[i - 1] > id)) errors.push("/actions: expected canonical id order");
  for (const [i, action] of document.actions.entries()) {
    const { profile, revision, publisher, source, target } = document;
    if (Buffer.byteLength(stableStringify({ $schema: AURA_ACTION_SCHEMA_URL, profile, revision, publisher, source, target, ...action })) > MAX_ACTION_BYTES)
      errors.push("/actions/" + i + ": serialized detail exceeds 1 MiB including metadata");
    errors.push(...actionIntegrity(action, document.target.url).map(e => "/actions/" + i + ": " + e));
    for (const id of [...(action.requires ?? []), ...(action.errors ?? []).flatMap(e => e.resolve ? [e.resolve] : [])])
      if (!ids.includes(id)) errors.push("/actions/" + i + ": unknown requires/resolve id");
  }
  return errors;
}
