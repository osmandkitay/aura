import { AURA_PROFILE, AURA_V2_SCHEMA_URL, MAX_ACTION_BYTES } from "../constants";
import { AuraAction, AuraConfig, AuraDocument, Binding, JsonSchema, Selection } from "../schema/types";
import { pointerEscape } from "../pointer";
import { compileSchema, resolveObject } from "./schema";
import { CompileError, finalizeDocument } from "./shared";

export function deriveFromOpenApi(value: unknown, config: AuraConfig): AuraDocument {
  const root = value as any;
  if (!/^3\.(0|1)\.[0-9]+$/.test(root.openapi)) throw new CompileError("OAS_VERSION", "/openapi", "/", "Supported versions are OpenAPI 3.0.x and 3.1.x");
  const oas30 = root.openapi.startsWith("3.0.");
  const target = new URL(config.target.url);
  const cleanBase = (url: string, at: string, cp: string): string => {
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new CompileError("SERVER", at, cp, "Expected an absolute HTTP(S) server"); }
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash ||
      /[{}]/.test(url) || parsed.origin !== target.origin) throw new CompileError("TARGET_CONFLICT", at, cp, "Server must be a concrete URL within the declared target origin");
    return parsed.href.replace(/\/$/, "");
  };
  const declaredBase = cleanBase(config.target.url, "", "/target/url");
  const actions = config.actions.map((selection: Selection, index: number): AuraAction => {
    const cp = "/actions/" + index;
    const pathAt = "/paths/" + pointerEscape(selection.path);
    const at = pathAt + "/" + selection.method.toLowerCase();
    const fail = (code: string, location: string, detail: string): never => { throw new CompileError(code, location, cp, detail); };
    const rawPath = root.paths?.[selection.path];
    if (!rawPath) fail("OPERATION", at, "Selected method/path does not exist");
    const pathItem = resolveObject(root, rawPath, at, cp);
    const op = pathItem[selection.method.toLowerCase()];
    if (!op || typeof op !== "object" || Array.isArray(op)) fail("OPERATION", at, "Selected method/path does not exist");
    if (op.$ref) fail("OPERATION_REF", at, "Operation references are unsupported");
    const servers = op.servers ?? pathItem.servers ?? root.servers;
    let base = declaredBase;
    if (servers !== undefined) {
      if (!Array.isArray(servers) || servers.length !== 1 || typeof servers[0]?.url !== "string" || servers[0].variables)
        fail("SERVERS", at + "/servers", "Exactly one concrete server without variables is supported");
      base = cleanBase(servers[0].url, at + "/servers/0/url", cp);
      if (op.servers === undefined && pathItem.servers === undefined && base !== declaredBase)
        fail("TARGET_CONFLICT", "/servers/0/url", "Document server disagrees with config /target/url");
    }
    if (/[?#]/.test(selection.path) || !selection.path.startsWith("/") || selection.path.startsWith("//"))
      fail("PATH", at, "Operation path cannot contain query or fragment");
    const properties: Record<string, any> = {};
    const required = new Set<string>();
    const bindings: Binding[] = [];
    const parameters = new Map<string, any>();
    for (const [list, where] of [[pathItem.parameters, pathAt + "/parameters"], [op.parameters, at + "/parameters"]] as const) {
      if (list === undefined) continue;
      if (!Array.isArray(list)) fail("PARAMETERS", where, "Expected a parameter array");
      const local = new Set<string>();
      list.forEach((raw: any, i: number) => {
        const p = resolveObject(root, raw, where + "/" + i, cp);
        if (!["path", "query", "header"].includes(p.in) || typeof p.name !== "string" || !p.name)
          fail("PARAMETER", where + "/" + i, "Only named path/query/header parameters are supported");
        if (p.required !== undefined && typeof p.required !== "boolean") fail("PARAMETER", where + "/" + i, "required must be boolean");
        const identity = p.in + ":" + (p.in === "header" ? p.name.toLowerCase() : p.name);
        if (local.has(identity)) fail("PARAMETER_DUPLICATE", where + "/" + i, "Duplicate parameter");
        local.add(identity); parameters.set(identity, { ...p, at: where + "/" + i });
      });
    }
    for (const p of [...parameters.values()].sort((a, b) => (a.in + ":" + a.name) < (b.in + ":" + b.name) ? -1 : 1)) {
      if (!p.schema || p.content || p.allowReserved || p.allowEmptyValue || p.examples)
        fail("PARAMETER", p.at, "Only explicit schema-based parameters without special wire behavior are supported");
      const schema: any = compileSchema(root, p.schema, p.at + "/schema", cp, oas30);
      const scalar = (s: any) => s && typeof s === "object" && ["string", "number", "integer", "boolean"].includes(s.type);
      const isArray = schema.type === "array";
      const style = p.style ?? (p.in === "query" ? "form" : "simple");
      const explode = p.explode ?? (style === "form");
      if ((p.in === "query" && (style !== "form" || explode !== true || !(scalar(schema) || (isArray && scalar(schema.items))))) ||
        (p.in !== "query" && (style !== "simple" || explode !== false || !scalar(schema))))
        fail("SERIALIZATION", p.at, "Unsupported parameter serialization/type");
      if (p.in === "path" && p.required !== true) fail("PATH_REQUIRED", p.at, "Path parameters must be required");
      if (p.in === "header" && /^(authorization|content-type|accept|cookie|host|content-length)$/i.test(p.name))
        fail("HEADER_RESERVED", p.at, "Reserved header requires an explicit supported protocol contract");
      properties[p.in] ??= { type: "object", properties: Object.create(null), additionalProperties: false, required: [] };
      properties[p.in].properties[p.name] = schema;
      if (p.required) { properties[p.in].required.push(p.name); required.add(p.in); }
      bindings.push({ input: "/" + p.in + "/" + pointerEscape(p.name), in: p.in, name: p.name, style, explode });
    }
    const placeholders = [...selection.path.matchAll(/{([^{}]+)}/g)].map(m => m[1]);
    if (selection.path.replace(/{[^{}]+}/g, "").match(/[{}]/) || placeholders.some(name => !parameters.has("path:" + name)) ||
      [...parameters.values()].some(p => p.in === "path" && !placeholders.includes(p.name)))
      fail("PATH_BINDING", at, "Path template and parameters disagree");
    const jsonContent = (content: any, where: string): any => {
      if (!content || Object.keys(content).length !== 1 || !Object.hasOwn(content, "application/json") ||
        !Object.hasOwn(content["application/json"], "schema") || content["application/json"].encoding)
        fail("MEDIA", where, "Exactly application/json with an explicit schema is supported");
      return compileSchema(root, content["application/json"].schema, where + "/application~1json/schema", cp, oas30);
    };
    if (op.requestBody !== undefined) {
      if (selection.method === "GET") fail("GET_BODY", at + "/requestBody", "GET bodies are unsupported");
      const body = resolveObject(root, op.requestBody, at + "/requestBody", cp);
      if (body.required !== undefined && typeof body.required !== "boolean") fail("BODY_REQUIRED", at + "/requestBody/required", "required must be boolean");
      properties.body = jsonContent(body.content, at + "/requestBody/content");
      if (body.required === true) required.add("body");
      bindings.push({ input: "/body", in: "body", target: "" });
    }
    const security = op.security ?? root.security ?? [];
    let auth: AuraAction["auth"] = { kind: "none" };
    if (!Array.isArray(security)) fail("AUTH", at + "/security", "Invalid security declaration");
    if (security.length) {
      if (security.length !== 1 || !security[0] || typeof security[0] !== "object" || Array.isArray(security[0]) || Object.keys(security[0]).length !== 1) fail("AUTH_COMBINATION", at + "/security", "Security AND/OR alternatives are unsupported");
      const name = Object.keys(security[0])[0];
      if (!Array.isArray(security[0][name]) || security[0][name].length) fail("AUTH_SCOPES", at + "/security", "Scopes are unsupported");
      const scheme = resolveObject(root, root.components?.securitySchemes?.[name], "/components/securitySchemes/" + pointerEscape(name), cp);
      const bearer = scheme.type === "http" && scheme.scheme?.toLowerCase() === "bearer";
      if (!bearer && !(scheme.type === "apiKey" && scheme.in === "header" && typeof scheme.name === "string"))
        fail("AUTH", at + "/security", "Only bearer or header API key is supported");
      const header = bearer ? "Authorization" : scheme.name;
      if (!/^[!#$%&'*+.^_\x60|~0-9A-Za-z-]+$/.test(header) || /^(content-type|accept|cookie|host|content-length)$/i.test(header))
        fail("AUTH_HEADER", at + "/security", "Invalid API key header");
      if (bindings.some(b => b.in === "header" && b.name!.toLowerCase() === header.toLowerCase()))
        fail("AUTH_CONFLICT", at + "/security", "Auth collides with a declared header");
      const input = "/header/" + pointerEscape(header);
      auth = { kind: bearer ? "bearer" : "api-key", input, name: header };
      properties.header ??= { type: "object", properties: Object.create(null), additionalProperties: false, required: [] };
      properties.header.properties[header] = { type: "string", minLength: 1 };
      properties.header.required.push(header); required.add("header");
      bindings.push({ input, in: "header", name: header, style: "simple", explode: false, ...(bearer ? { prefix: "Bearer " as const } : {}) });
    }
    const success: AuraAction["success"] = [];
    for (const status of Object.keys(op.responses ?? {}).sort()) {
      if (!/^2[0-9]{2}$/.test(status)) {
        if (/^2/i.test(status)) fail("STATUS", at + "/responses/" + status, "Success ranges require exact statuses");
        continue;
      }
      const response = resolveObject(root, op.responses[status], at + "/responses/" + status, cp);
      if (response.content !== undefined) {
        if (status === "204") fail("NO_CONTENT", at + "/responses/204", "204 cannot declare a response body");
        success.push({ status: Number(status), contentType: "application/json", schema: jsonContent(response.content, at + "/responses/" + status + "/content") });
      } else success.push({ status: Number(status), contentType: null });
    }
    if (!success.length) fail("SUCCESS", at + "/responses", "At least one exact success response is required");
    for (const error of selection.errors ?? []) {
      if (!Object.hasOwn(op.responses ?? {}, String(error.status))) fail("ERROR_STATUS", at + "/responses", "Config error status is absent from source responses");
    }
    const input: JsonSchema = { type: "object", properties, additionalProperties: false, required: [...required].sort() };
    for (const ns of ["path", "query", "header"]) if (properties[ns]) properties[ns].required.sort();
    const action: AuraAction = {
      id: selection.id, key: selection.key, risk: selection.risk, ...(selection.title ? { title: selection.title } : {}),
      entrypoint: { method: selection.method, url: base + selection.path, encoding: op.requestBody !== undefined ? "json" : "none" },
      input, bindings, auth, success, outputs: selection.outputs,
      origin: { source: "openapi", ref: "#" + at, ...(op.operationId ? { operationId: op.operationId } : {}),
        ...(op.summary ? { summary: op.summary } : {}) },
      aliases: [selection.method + " " + selection.path, ...(op.operationId ? [op.operationId] : [])].sort(),
      ...(selection.requires ? { requires: [...selection.requires].sort() } : {}),
      ...(selection.errors ? { errors: [...selection.errors].sort((a, b) => a.status - b.status) } : {})
    };
    if (Buffer.byteLength(JSON.stringify(action)) > MAX_ACTION_BYTES) fail("ACTION_SIZE", at, "Expanded action exceeds 1 MiB");
    return action;
  });
  return finalizeDocument({
    $schema: AURA_V2_SCHEMA_URL, protocol: "AURA", version: "2.0", profile: AURA_PROFILE,
    publisher: config.publisher, source: { ...config.source, kind: "openapi" }, target: config.target, actions
  });
}
