import { AURA_PROTOCOL_NAME, AURA_V2_SCHEMA_URL, AURA_VERSION } from "../constants";
import { inferConfirm, inferRisk, normalizeActionSemantics } from "../normalize";
import { AuraAuth, AuraDocument, HttpMethod, JsonSchema } from "../schema/types";
import { AuraActionCandidate, coalesceTitle, finalizeActionCandidates, normalizeMethod, uniqueStrings } from "./shared";

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

type OpenApiMethod = (typeof METHODS)[number];

function pointerSegment(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function cloneSchema<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractJsonSchema(content: Record<string, any> | undefined): JsonSchema | undefined {
  if (!content || typeof content !== "object") {
    return undefined;
  }

  for (const mediaType of ["application/json", "application/*+json"]) {
    if (content[mediaType]?.schema) {
      return cloneSchema(content[mediaType].schema);
    }
  }

  return undefined;
}

function collectParameters(pathItem: Record<string, any>, operation: Record<string, any>): Array<Record<string, any>> {
  const merged = new Map<string, Record<string, any>>();

  for (const source of [pathItem.parameters ?? [], operation.parameters ?? []]) {
    for (const parameter of source) {
      if (!parameter || typeof parameter !== "object") {
        continue;
      }

      if (typeof parameter.in !== "string" || typeof parameter.name !== "string") {
        continue;
      }

      const key = `${parameter.in}:${parameter.name}`;
      merged.set(key, parameter);
    }
  }

  return Array.from(merged.values());
}

function buildInputSchema(parameters: Array<Record<string, any>>, requestBody: Record<string, any> | undefined): JsonSchema | undefined {
  const bodySchema = extractJsonSchema(requestBody?.content as Record<string, any> | undefined);
  const parameterProperties: Record<string, unknown> = {};
  const parameterRequired = new Set<string>();

  for (const parameter of parameters) {
    if (!parameter.name || !parameter.schema) {
      continue;
    }

    parameterProperties[parameter.name] = cloneSchema(parameter.schema);
    if (parameter.required) {
      parameterRequired.add(parameter.name);
    }
  }

  if (bodySchema && isRecord(bodySchema) && bodySchema.type === "object") {
    if (Object.keys(parameterProperties).length === 0) {
      return cloneSchema(bodySchema);
    }

    const objectSchema = cloneSchema(bodySchema);
    const properties = isRecord(objectSchema.properties) ? cloneSchema(objectSchema.properties) : {};
    Object.assign(properties, parameterProperties);
    objectSchema.properties = properties;

    const required = new Set<string>(
      Array.isArray(objectSchema.required)
        ? objectSchema.required.filter((value): value is string => typeof value === "string")
        : []
    );
    for (const key of parameterRequired) {
      required.add(key);
    }

    if (required.size > 0) {
      objectSchema.required = Array.from(required);
    } else {
      delete objectSchema.required;
    }

    return objectSchema;
  }

  const properties: Record<string, unknown> = { ...parameterProperties };
  const required = new Set(parameterRequired);

  if (bodySchema !== undefined) {
    properties.body = bodySchema;
    if (requestBody?.required) {
      required.add("body");
    }
  }

  if (Object.keys(properties).length === 0) {
    return undefined;
  }

  const schema: Record<string, unknown> = {
    type: "object",
    properties
  };

  if (required.size > 0) {
    schema.required = Array.from(required);
  }

  return schema;
}

function buildParameterLocation(parameters: Array<Record<string, any>>, requestBody: Record<string, any> | undefined): Record<string, "path" | "query" | "header" | "body"> | undefined {
  const result: Record<string, "path" | "query" | "header" | "body"> = {};
  for (const parameter of parameters) {
    if (!parameter.name || (parameter.in !== "path" && parameter.in !== "query" && parameter.in !== "header")) {
      continue;
    }

    result[parameter.name] = parameter.in;
  }

  const bodySchema = extractJsonSchema(requestBody?.content as Record<string, any> | undefined);
  if (bodySchema && typeof bodySchema === "object" && bodySchema.type === "object") {
    for (const key of Object.keys((bodySchema.properties ?? {}) as Record<string, unknown>)) {
      result[key] = "body";
    }
  } else if (bodySchema !== undefined) {
    result.body = "body";
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function buildParameterMapping(parameterLocation: Record<string, "path" | "query" | "header" | "body"> | undefined): Record<string, string> | undefined {
  if (!parameterLocation) {
    return undefined;
  }

  const mapping: Record<string, string> = {};
  for (const key of Object.keys(parameterLocation)) {
    mapping[key] = `/${key}`;
  }

  return Object.keys(mapping).length > 0 ? mapping : undefined;
}

function inferEncoding(method: HttpMethod, requestBody: Record<string, any> | undefined, parameterLocation: Record<string, "path" | "query" | "header" | "body"> | undefined): "json" | "query" | "none" {
  if (requestBody?.content) {
    return "json";
  }

  if (parameterLocation && Object.values(parameterLocation).includes("query")) {
    return "query";
  }

  return method === "GET" ? "none" : "json";
}

function extractResultSchema(operation: Record<string, any>): JsonSchema | undefined {
  const responses = operation.responses as Record<string, any> | undefined;
  if (!responses) {
    return undefined;
  }

  for (const [statusCode, response] of Object.entries(responses)) {
    if (!statusCode.startsWith("2")) {
      continue;
    }

    const schema = extractJsonSchema((response as Record<string, any>).content as Record<string, any> | undefined);
    if (schema !== undefined) {
      return schema;
    }
  }

  return undefined;
}

function inferAuth(openApi: Record<string, any>, operation: Record<string, any>, actionKey: string): AuraAuth | undefined {
  const security = operation.security ?? openApi.security;

  if (Array.isArray(security)) {
    if (security.length === 0) {
      return { kind: "none", required: false };
    }

    const firstRequirement = security[0] as Record<string, unknown>;
    const schemeName = Object.keys(firstRequirement)[0];
    const scheme = openApi.components?.securitySchemes?.[schemeName] as Record<string, any> | undefined;

    if (!scheme) {
      return { kind: "unknown", required: true };
    }

    if (scheme.type === "http" && scheme.scheme === "bearer") {
      return { kind: "bearer", required: true };
    }

    if (scheme.type === "apiKey") {
      return { kind: scheme.in === "cookie" ? "cookie" : "api-key", required: true };
    }

    if (scheme.type === "oauth2" || scheme.type === "openIdConnect") {
      return { kind: "oauth2", required: true };
    }

    return { kind: "unknown", required: true };
  }

  if (actionKey === "session.login" || actionKey === "account.create") {
    return { kind: "none", required: false };
  }

  return undefined;
}

export function deriveFromOpenApi(value: unknown): AuraDocument {
  const openApi = value as Record<string, any>;
  const actions: AuraActionCandidate[] = [];

  for (const [pathName, pathValue] of Object.entries(openApi.paths ?? {})) {
    const pathItem = pathValue as Record<string, any>;

    for (const methodName of METHODS) {
      if (!pathItem[methodName]) {
        continue;
      }

      const operation = pathItem[methodName] as Record<string, any>;
      const method = normalizeMethod(methodName, "GET");
      const rawName = operation.operationId ?? `${methodName}_${pathName}`;
      const summary = operation.summary ?? operation.description;
      const normalized = normalizeActionSemantics({
        rawName,
        summary,
        method,
        path: pathName
      });
      const parameters = collectParameters(pathItem, operation);
      const requestBody = operation.requestBody as Record<string, any> | undefined;
      const parameterLocation = buildParameterLocation(parameters, requestBody);
      const risk = inferRisk(normalized.intent, method);

      actions.push({
        key: normalized.key,
        title: coalesceTitle(summary ?? operation.description, normalized.intent),
        intent: normalized.intent,
        entrypoint: {
          type: "http",
          method,
          path: pathName,
          encoding: inferEncoding(method, requestBody, parameterLocation),
          parameterLocation,
          parameterMapping: buildParameterMapping(parameterLocation)
        },
        auth: inferAuth(openApi, operation, normalized.key),
        confirm: inferConfirm(risk),
        risk,
        input: buildInputSchema(parameters, requestBody),
        result: extractResultSchema(operation),
        docs: summary || operation.description ? { summary: summary ?? operation.description } : undefined,
        aliases: uniqueStrings([operation.operationId, `${method} ${pathName}`]),
        origin: {
          source: "openapi",
          path: pathName,
          operationId: operation.operationId,
          method,
          ref: `#/paths/${pointerSegment(pathName)}/${methodName}`,
          summary: summary ?? operation.description
        },
        confidence: normalized.confidence
      });
    }
  }

  return {
    $schema: AURA_V2_SCHEMA_URL,
    protocol: AURA_PROTOCOL_NAME,
    version: AURA_VERSION,
    site: {
      name: openApi.info?.title ?? "OpenAPI site",
      url: openApi.servers?.[0]?.url,
      description: openApi.info?.description
    },
    source: {
      kind: "openapi"
    },
    actions: finalizeActionCandidates(actions)
  };
}
