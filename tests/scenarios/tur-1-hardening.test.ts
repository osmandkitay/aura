import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveDocument, publishDocument, validateAuraDocument, type AuraDocument } from "../../packages/aura-protocol/src";
import { ROOT, createScenarioTempDir, readJson, removeDirectory } from "./helpers";

function withTamperedId(
  document: AuraDocument,
  index: number,
  tamperedId: string
): AuraDocument {
  return {
    ...document,
    actions: document.actions.map((action, actionIndex) => (actionIndex === index ? { ...action, id: tamperedId } : action))
  };
}

describe("Scenario M - Tur 1 hardening", () => {
  it("accepts canonical existing AURA 2.0 input with finalized ids", () => {
    const fixturePath = path.join(ROOT, "packages", "aura-protocol", "fixtures", "collision-openapi.json");
    const fixture = readJson<unknown>(fixturePath);
    const document = deriveDocument(fixture);

    expect(validateAuraDocument(document)).toMatchObject({
      valid: true,
      value: document
    });
  });

  it("rejects tampered finalized ids during validate, derive, and publish", () => {
    const collisionFixturePath = path.join(ROOT, "packages", "aura-protocol", "fixtures", "collision-openapi.json");
    const collisionDocument = deriveDocument(readJson<unknown>(collisionFixturePath));
    const tamperedCollision = withTamperedId(collisionDocument, 0, "post.create__deadbeefcafe");

    const minimalFixturePath = path.join(ROOT, "examples", "minimal-site", "source", "openapi.json");
    const minimalDocument = deriveDocument(readJson<unknown>(minimalFixturePath));
    const tamperedNonCollision = withTamperedId(minimalDocument, 0, "post.list__deadbeefcafe");

    const scenarioRoot = createScenarioTempDir("aura-scenario-m-");

    try {
      for (const [name, document] of [
        ["collision", tamperedCollision],
        ["non-collision", tamperedNonCollision]
      ] as const) {
        const validation = validateAuraDocument(document);
        expect(validation.valid, `${name} validation result`).toBe(false);
        expect(validation.errors).toHaveLength(1);
        expect(validation.errors[0]).toContain("action id is not finalized");

        expect(() => deriveDocument(document)).toThrowError(/action id is not finalized/);
        expect(() => publishDocument(document, path.join(scenarioRoot, name, "dist"))).toThrowError(/action id is not finalized/);
      }
    } finally {
      removeDirectory(scenarioRoot);
    }
  });

  it("lets operation-level parameters override path-level parameters", () => {
    const document = deriveDocument({
      openapi: "3.1.0",
      info: {
        title: "Override Fixture",
        version: "1.0.0"
      },
      paths: {
        "/posts/{id}": {
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "integer" }
            },
            {
              name: "lang",
              in: "query",
              schema: { type: "string" }
            }
          ],
          get: {
            operationId: "getPost",
            summary: "Get a post",
            parameters: [
              {
                name: "id",
                in: "path",
                required: true,
                schema: {
                  type: "string",
                  pattern: "^[a-z0-9-]+$"
                }
              }
            ],
            responses: {
              "200": {
                description: "OK"
              }
            }
          }
        }
      }
    }).actions[0];

    expect(document.entrypoint.parameterLocation).toEqual({
      id: "path",
      lang: "query"
    });
    expect(document.entrypoint.parameterMapping).toEqual({
      id: "/id",
      lang: "/lang"
    });
    expect(document.input).toEqual({
      type: "object",
      properties: {
        id: {
          type: "string",
          pattern: "^[a-z0-9-]+$"
        },
        lang: {
          type: "string"
        }
      },
      required: ["id"]
    });
  });

  it("preserves object-body schema fidelity while merging non-body parameters", () => {
    const document = deriveDocument({
      openapi: "3.1.0",
      info: {
        title: "Body Fidelity Fixture",
        version: "1.0.0"
      },
      paths: {
        "/posts": {
          post: {
            operationId: "publishPost",
            summary: "Publish a post",
            parameters: [
              {
                name: "draft",
                in: "query",
                schema: { type: "boolean" }
              }
            ],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    description: "Strict publish body",
                    additionalProperties: false,
                    minProperties: 1,
                    required: ["title"],
                    properties: {
                      title: { type: "string" }
                    }
                  }
                }
              }
            },
            responses: {
              "201": {
                description: "Created"
              }
            }
          }
        }
      }
    }).actions[0];

    expect(document.input).toEqual({
      type: "object",
      description: "Strict publish body",
      additionalProperties: false,
      minProperties: 1,
      required: ["title"],
      properties: {
        title: { type: "string" },
        draft: { type: "boolean" }
      }
    });
  });

  it("rejects legacy AURA v1 input from the active 2.0 line", () => {
    expect(() =>
      deriveDocument({
        protocol: "AURA",
        version: "1.0.5",
        site: { name: "Legacy" },
        capabilities: {},
        resources: {}
      })
    ).toThrowError("Unsupported input. Expected a local OpenAPI document or an AURA 2.0 document.");
  });
});
