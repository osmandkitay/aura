import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveDocument, deriveFile, publishDocument, publishFile, validateAuraDocument } from "../../packages/aura-protocol/src";
import { finalizeActionCandidates } from "../../packages/aura-protocol/src/derive/shared";
import { ROOT, createScenarioTempDir, readJson, removeDirectory, snapshotDirectory } from "./helpers";

describe("Scenario K - locator identity regressions", () => {
  it("keeps existing collision ids stable when a new colliding sibling is inserted", () => {
    const fixturePath = path.join(ROOT, "packages", "aura-protocol", "fixtures", "collision-openapi.json");
    const fixture = readJson<Record<string, any>>(fixturePath);
    const expandedFixture = JSON.parse(JSON.stringify(fixture)) as Record<string, any>;

    expandedFixture.paths["/blog-posts"] = {
      post: {
        operationId: "createBlogPost",
        summary: "Create a blog post",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["headline"],
                properties: {
                  headline: { type: "string" }
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
    };

    const baseline = deriveDocument(fixture);
    const expanded = deriveDocument(expandedFixture);

    const baselineIdsByOperation = new Map(
      baseline.actions.map((action) => [action.origin.operationId, action.id] as const)
    );

    expect(expanded.actions.find((action) => action.origin.operationId === "createArticle")?.id).toBe(
      baselineIdsByOperation.get("createArticle")
    );
    expect(expanded.actions.find((action) => action.origin.operationId === "createPost")?.id).toBe(
      baselineIdsByOperation.get("createPost")
    );
    expect(expanded.actions.map((action) => action.key)).toEqual(["post.create", "post.create", "post.create"]);

    const scenarioRoot = createScenarioTempDir("aura-scenario-k-");

    try {
      const baselinePublished = publishDocument(baseline, path.join(scenarioRoot, "baseline", "dist"));
      const expandedPublished = publishDocument(expanded, path.join(scenarioRoot, "expanded", "dist"));

      const baselineHrefsByOperation = new Map(
        baseline.actions.map((action) => [action.origin.operationId, `/.well-known/aura/actions/${action.id}.json`] as const)
      );

      expect(expandedPublished.index.actions.find((action) => action.id === baselineIdsByOperation.get("createArticle"))?.href).toBe(
        baselineHrefsByOperation.get("createArticle")
      );
      expect(expandedPublished.index.actions.find((action) => action.id === baselineIdsByOperation.get("createPost"))?.href).toBe(
        baselineHrefsByOperation.get("createPost")
      );
      expect(baselinePublished.index.actions.map((action) => action.id)).toEqual(baseline.actions.map((action) => action.id));
    } finally {
      removeDirectory(scenarioRoot);
    }
  });

  it("keeps locator ids and hrefs stable when derived presentation fields change", () => {
    const fixturePath = path.join(ROOT, "packages", "aura-protocol", "fixtures", "collision-openapi.json");
    const fixture = readJson<unknown>(fixturePath);
    const baseline = deriveDocument(fixture);
    const mutated = {
      ...baseline,
      actions: finalizeActionCandidates(
        baseline.actions.map((action, index) => {
          const { id: _ignoredId, ...candidate } = action;
          const reversedAliases = [...(candidate.aliases ?? [])].reverse();

          return {
            ...candidate,
            title: `${candidate.title} rewritten ${index + 1}`,
            docs: { summary: `Rewritten docs ${index + 1}` },
            aliases: reversedAliases,
            origin: {
              ...candidate.origin,
              summary: `Rewritten origin summary ${index + 1}`
            },
            confidence: {
              label: "low" as const,
              score: 0.11 + index * 0.01,
              reason: `Mutated for locator stability regression ${index + 1}`
            }
          };
        })
      )
    };

    expect(mutated.actions.map((action) => action.id)).toEqual(baseline.actions.map((action) => action.id));

    const scenarioRoot = createScenarioTempDir("aura-scenario-k-derived-");

    try {
      const baselinePublished = publishDocument(baseline, path.join(scenarioRoot, "baseline", "dist"));
      const mutatedPublished = publishDocument(mutated, path.join(scenarioRoot, "mutated", "dist"));

      expect(mutatedPublished.index.actions.map((action) => ({ id: action.id, href: action.href }))).toEqual(
        baselinePublished.index.actions.map((action) => ({ id: action.id, href: action.href }))
      );
    } finally {
      removeDirectory(scenarioRoot);
    }
  });

  it("keeps derive and publish bytes stable when the same source file moves to a different local path", () => {
    const fixturePath = path.join(ROOT, "packages", "aura-protocol", "fixtures", "collision-openapi.json");
    const scenarioRoot = createScenarioTempDir("aura-scenario-k-paths-");

    try {
      const firstInput = path.join(scenarioRoot, "first", "source", "openapi.json");
      const secondInput = path.join(scenarioRoot, "second", "nested", "source", "openapi.json");
      fs.mkdirSync(path.dirname(firstInput), { recursive: true });
      fs.mkdirSync(path.dirname(secondInput), { recursive: true });
      fs.copyFileSync(fixturePath, firstInput);
      fs.copyFileSync(fixturePath, secondInput);

      const firstDerived = deriveFile(firstInput);
      const secondDerived = deriveFile(secondInput);

      expect(fs.readFileSync(firstDerived.outFile, "utf8")).toBe(fs.readFileSync(secondDerived.outFile, "utf8"));

      const firstPublished = publishFile(firstInput, path.join(scenarioRoot, "first", "dist"));
      const secondPublished = publishFile(secondInput, path.join(scenarioRoot, "second", "dist"));

      expect(secondPublished.index.actions.map((action) => ({ id: action.id, href: action.href }))).toEqual(
        firstPublished.index.actions.map((action) => ({ id: action.id, href: action.href }))
      );
      expect(snapshotDirectory(path.join(scenarioRoot, "second", "dist"))).toEqual(
        snapshotDirectory(path.join(scenarioRoot, "first", "dist"))
      );
    } finally {
      removeDirectory(scenarioRoot);
    }
  });

  it("rejects malformed existing AURA 2.0 action order during validation", () => {
    const fixturePath = path.join(ROOT, "packages", "aura-protocol", "fixtures", "collision-openapi.json");
    const fixture = readJson<unknown>(fixturePath);
    const document = deriveDocument(fixture);
    const reversed = {
      ...document,
      actions: [...document.actions].reverse()
    };

    const validation = validateAuraDocument(reversed);

    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual([
      '/actions: action order is not finalized; expected "post.create" (POST /articles) at index 0 but found "post.create" (POST /posts). Existing AURA 2.0 input must already match canonical finalized order.'
    ]);
  });

  it("rejects malformed existing AURA 2.0 action order during derive", () => {
    const fixturePath = path.join(ROOT, "packages", "aura-protocol", "fixtures", "collision-openapi.json");
    const fixture = readJson<unknown>(fixturePath);
    const document = deriveDocument(fixture);
    const reversed = {
      ...document,
      actions: [...document.actions].reverse()
    };

    expect(() => deriveDocument(reversed)).toThrowError(
      'Input is not a valid AURA 2.0 document:\n/actions: action order is not finalized; expected "post.create" (POST /articles) at index 0 but found "post.create" (POST /posts). Existing AURA 2.0 input must already match canonical finalized order.'
    );
  });

  it("rejects malformed existing AURA 2.0 action order during publish", () => {
    const fixturePath = path.join(ROOT, "packages", "aura-protocol", "fixtures", "collision-openapi.json");
    const fixture = readJson<unknown>(fixturePath);
    const document = deriveDocument(fixture);
    const reversed = {
      ...document,
      actions: [...document.actions].reverse()
    };
    const scenarioRoot = createScenarioTempDir("aura-scenario-k-order-");

    try {
      expect(() => publishDocument(reversed, path.join(scenarioRoot, "dist"))).toThrowError(
        'AURA 2.0 document failed validation:\n/actions: action order is not finalized; expected "post.create" (POST /articles) at index 0 but found "post.create" (POST /posts). Existing AURA 2.0 input must already match canonical finalized order.'
      );
    } finally {
      removeDirectory(scenarioRoot);
    }
  });
});
