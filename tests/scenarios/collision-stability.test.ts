import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveDocument, publishDocument, validateAuraDocument } from "../../packages/aura-protocol/src";
import { ROOT, createScenarioTempDir, locatorHashSuffix, readJson, removeDirectory } from "./helpers";

describe("Scenario F - semantic collision stability test", () => {
  it("keeps semantic keys clean and publishes duplicate meanings through unique ids", () => {
    const fixturePath = path.join(ROOT, "packages", "aura-protocol", "fixtures", "collision-openapi.json");
    const fixture = readJson<unknown>(fixturePath);
    const document = deriveDocument(fixture);
    const validation = validateAuraDocument(document);

    expect(validation.valid).toBe(true);
    expect(document.actions.map((action) => action.key)).toEqual(["post.create", "post.create"]);
    expect(document.actions.map((action) => action.id)).toEqual(
      document.actions.map((action) => `${action.key}__${locatorHashSuffix(action)}`)
    );
    expect(document.actions.map((action) => action.origin.path)).toEqual(["/articles", "/posts"]);
    expect(document.actions.map((action) => action.intent)).toEqual([
      { domain: "post", verb: "create" },
      { domain: "post", verb: "create" }
    ]);
    expect(document.actions.every((action) => /^post\.create__[a-f0-9]{12,}$/.test(action.id))).toBe(true);

    const firstAction = document.actions.find((action) => action.origin.operationId === "createArticle");
    const secondAction = document.actions.find((action) => action.origin.operationId === "createPost");
    expect(firstAction?.origin.operationId).toBe("createArticle");
    expect(secondAction?.origin.operationId).toBe("createPost");
    expect(secondAction?.aliases).toContain("createPost");

    const scenarioRoot = createScenarioTempDir("aura-scenario-f-");

    try {
      const published = publishDocument(document, path.join(scenarioRoot, "dist"));
      expect(published.index.actions.map((action) => action.href)).toEqual(
        document.actions.map((action) => `/.well-known/aura/actions/${action.id}.json`)
      );

      for (const action of published.index.actions) {
        const detailPath = path.join(scenarioRoot, "dist", ...action.href.split("/").filter(Boolean));
        expect(fs.existsSync(detailPath)).toBe(true);
      }
    } finally {
      removeDirectory(scenarioRoot);
    }
  });
});
