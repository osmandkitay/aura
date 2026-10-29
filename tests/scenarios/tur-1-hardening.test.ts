import { describe, expect, it } from "vitest";
import { deriveDocument } from "../../packages/aura-protocol/src";
import { fixture } from "./contract-fixture";
const selected = () => {
  const f = fixture(); f.config.actions = [f.config.actions[1]]; delete f.config.actions[0].requires; delete f.config.actions[0].errors;
  return f;
};
describe("G2 lossless supported profile", () => {
  it("expands schema/parameter/requestBody/response refs without components or executable refs", () => {
    const { source, config } = fixture(), result = deriveDocument(source, config);
    expect(JSON.stringify(result.actions)).not.toMatch(/"\$(?:ref|dynamicRef)"|"components"/);
    expect((result.actions.find(a => a.id === "create")!.input as any).properties.body.required).toEqual(["title"]);
    expect(result.actions.find(a => a.id === "publish")!.bindings).toContainEqual({ input: "/path/id", in: "path", name: "id", style: "simple", explode: false });
    source.paths["/unselected"] = { post: { requestBody: { $ref: "https://bad.example/never" } } };
    expect(() => deriveDocument(source, config)).not.toThrow();
  });
  it.each(["recursive", "remote", "dynamic", "oneOf", "anyOf", "closed-allOf"])("rejects %s with located errors", kind => {
    const { source, config } = selected();
    const schema: any = kind === "recursive" ? { type: "object", properties: { next: { $ref: "#/components/schemas/Draft" } } } :
      kind === "remote" ? { $ref: "other.json#/Draft" } :
      kind === "dynamic" ? { type: "object", $dynamicRef: "#node" } :
      kind === "closed-allOf" ? { allOf: [{ type: "object", properties: { a: { type: "string" } }, additionalProperties: false }, { type: "object", properties: { b: { type: "string" } } }] } :
      { [kind]: [{ type: "string" }, { type: "integer" }] };
    source.components.schemas.Draft = schema;
    expect(() => deriveDocument(source, config)).toThrow(/(?:REF|KEYWORD|ALLOF).*source=.*config=/);
  });
  it("merges only disjoint open-object allOf and preserves nullable OAS differences", () => {
    const { source, config } = selected();
    source.components.schemas.Draft = { allOf: [{ type: "object", required: ["a"], properties: { a: { type: "string" } } }, { type: "object", properties: { b: { type: ["integer", "null"] } } }] };
    const body = (deriveDocument(source, config).actions[0].input as any).properties.body;
    expect(body).toEqual({ type: "object", required: ["a"], properties: { a: { type: "string" }, b: { type: ["integer", "null"] } } });
    source.openapi = "3.0.3"; source.components.schemas.Draft = { type: "object", properties: { count: { type: "integer", nullable: true, minimum: 0, exclusiveMinimum: true } } };
    expect((deriveDocument(source, config).actions[0].input as any).properties.body.properties.count).toEqual({ type: ["integer", "null"], exclusiveMinimum: 0 });
  });
  it("preserves separate same-name namespaces, optional body and operation override", () => {
    const { source, config } = selected();
    config.actions[0].path = "/items/{id}"; config.actions[0].outputs = [];
    source.paths["/items/{id}"] = { parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], post: {
      servers: [{ url: "https://api.example/v2" }], parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
        { name: "id", in: "query", schema: { type: "integer" } },
        { name: "id", in: "header", schema: { type: "boolean" } }],
      requestBody: { content: { "application/json": { schema: { type: "object", required: ["id"], properties: { id: { type: "string" } } } } } }, responses: { "204": { description: "done" } } } };
    const action = deriveDocument(source, config).actions[0], input: any = action.input;
    expect(action.entrypoint.url).toBe("https://api.example/v2/items/{id}");
    expect(input.properties.path.properties.id.type).toBe("string");
    expect(input.properties.query.properties.id.type).toBe("integer");
    expect(input.properties.header.properties.id.type).toBe("boolean");
    expect(input.required).toEqual(["path"]); expect(input.properties.body.required).toEqual(["id"]);
    expect(action.bindings.map(b => b.input)).toEqual(["/header/id", "/path/id", "/query/id", "/body"]);
  });
  it.each(["multipart", "security-or", "security-and", "cookie", "deepObject", "servers"])("rejects unsupported %s without fallback", kind => {
    const { source, config } = selected(), op = source.paths["/posts"].post;
    if (kind === "multipart") op.requestBody = { content: { "multipart/form-data": { schema: { type: "object" } } } };
    if (kind === "security-or") op.security = [{}, { bearer: [] }];
    if (kind === "security-and") op.security = [{ bearer: [], other: [] }];
    if (kind === "cookie") op.parameters = [{ in: "cookie", name: "c", schema: { type: "string" } }];
    if (kind === "deepObject") op.parameters = [{ in: "query", name: "c", style: "deepObject", schema: { type: "object" } }];
    if (kind === "servers") op.servers = [{ url: "https://api.example/v1" }, { url: "https://api.example/v2" }];
    expect(() => deriveDocument(source, config)).toThrow(/(?:MEDIA|AUTH_COMBINATION|PARAMETER|SERIALIZATION|SERVERS).*source=.*config=/);
  });
});
