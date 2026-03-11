import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveDocument, publishDocument, validateAuraDocument } from "../../packages/aura-protocol/src";
import { ROOT, createScenarioTempDir, readJson, removeDirectory } from "./helpers";

describe("Scenario F - semantic collision stability test", () => {
  it("keeps semantic keys clean and publishes duplicate meanings through unique ids", () => {
    const fixturePath = path.join(ROOT, "packages", "aura-protocol", "fixtures", "collision-openapi.json");
    const fixture = readJson<unknown>(fixturePath);
    const document = deriveDocument(fixture, {
      sourceFile: "packages/aura-protocol/fixtures/collision-openapi.json"
    });
    const validation = validateAuraDocument(document);

    expect(validation.valid).toBe(true);
    expect(document.actions.map((action) => action.key)).toEqual(["post.create", "post.create"]);
    expect(document.actions.map((action) => action.id)).toEqual(["post.create", "post.create__2"]);
    expect(document.actions.map((action) => action.intent)).toEqual([
      { domain: "post", verb: "create" },
      { domain: "post", verb: "create" }
    ]);

    const secondAction = document.actions.find((action) => action.id === "post.create__2");
    expect(secondAction?.aliases).toContain("createArticle");
    expect(secondAction?.origin.operationId).toBe("createArticle");

    const scenarioRoot = createScenarioTempDir("aura-scenario-f-");

    try {
      const published = publishDocument(document, path.join(scenarioRoot, "dist"));
      expect(published.index.actions.map((action) => action.href)).toEqual([
        "/.well-known/aura/actions/post.create.json",
        "/.well-known/aura/actions/post.create__2.json"
      ]);

      for (const action of published.index.actions) {
        const detailPath = path.join(scenarioRoot, "dist", ...action.href.split("/").filter(Boolean));
        expect(fs.existsSync(detailPath)).toBe(true);
      }
    } finally {
      removeDirectory(scenarioRoot);
    }
  });
});
