import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveDocument, publishDocument } from "../../packages/aura-protocol/src";
import { writeJsonFile } from "../../packages/aura-protocol/src/filesystem";
import { ROOT, createScenarioTempDir, readJson, removeDirectory, snapshotDirectory } from "./helpers";

describe("Scenario G - deterministic OpenAPI order", () => {
  it("keeps derived ids and published hrefs stable when harmless OpenAPI order changes", () => {
    const fixturePath = path.join(ROOT, "packages", "aura-protocol", "fixtures", "collision-openapi.json");
    const fixture = readJson<Record<string, unknown>>(fixturePath);
    const reorderedFixture = {
      ...fixture,
      paths: Object.fromEntries(Object.entries((fixture.paths ?? {}) as Record<string, unknown>).reverse())
    };

    const baseline = deriveDocument(fixture);
    const reordered = deriveDocument(reorderedFixture);

    expect(reordered.actions.map((action) => action.id)).toEqual(baseline.actions.map((action) => action.id));
    expect(reordered.actions.map((action) => action.key)).toEqual(baseline.actions.map((action) => action.key));

    const scenarioRoot = createScenarioTempDir("aura-scenario-g-");

    try {
      const baselineDerivedPath = path.join(scenarioRoot, "baseline", ".derived", "aura-v2.json");
      const reorderedDerivedPath = path.join(scenarioRoot, "reordered", ".derived", "aura-v2.json");
      writeJsonFile(baselineDerivedPath, baseline);
      writeJsonFile(reorderedDerivedPath, reordered);

      expect(fs.readFileSync(reorderedDerivedPath, "utf8")).toBe(fs.readFileSync(baselineDerivedPath, "utf8"));

      const baselinePublished = publishDocument(baseline, path.join(scenarioRoot, "baseline", "dist"));
      const reorderedPublished = publishDocument(reordered, path.join(scenarioRoot, "reordered", "dist"));

      expect(reorderedPublished.index.actions.map((action) => action.href)).toEqual(
        baselinePublished.index.actions.map((action) => action.href)
      );
      expect(snapshotDirectory(path.join(scenarioRoot, "reordered", "dist"))).toEqual(
        snapshotDirectory(path.join(scenarioRoot, "baseline", "dist"))
      );
    } finally {
      removeDirectory(scenarioRoot);
    }
  });
});
