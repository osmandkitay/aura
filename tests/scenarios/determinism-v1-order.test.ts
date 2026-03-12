import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveDocument, publishDocument } from "../../packages/aura-protocol/src";
import { writeJsonFile } from "../../packages/aura-protocol/src/filesystem";
import { ROOT, createScenarioTempDir, readJson, removeDirectory, snapshotDirectory } from "./helpers";

describe("Scenario H - deterministic v1 order", () => {
  it("keeps legacy upgrade output stable when resource and capability order changes", () => {
    const fixturePath = path.join(ROOT, "examples", "upgrade-from-v1", "source", "aura-v1.json");
    const fixture = readJson<Record<string, unknown>>(fixturePath);
    const reorderedFixture = {
      ...fixture,
      resources: Object.fromEntries(Object.entries((fixture.resources ?? {}) as Record<string, unknown>).reverse()),
      capabilities: Object.fromEntries(Object.entries((fixture.capabilities ?? {}) as Record<string, unknown>).reverse())
    };

    const baseline = deriveDocument(fixture, {
      sourceFile: "examples/upgrade-from-v1/source/aura-v1.json"
    });
    const reordered = deriveDocument(reorderedFixture, {
      sourceFile: "examples/upgrade-from-v1/source/aura-v1.json"
    });

    expect(reordered.actions.map((action) => action.id)).toEqual(baseline.actions.map((action) => action.id));

    const scenarioRoot = createScenarioTempDir("aura-scenario-h-");

    try {
      const baselineDerivedPath = path.join(scenarioRoot, "baseline", ".derived", "aura-v2.json");
      const reorderedDerivedPath = path.join(scenarioRoot, "reordered", ".derived", "aura-v2.json");
      writeJsonFile(baselineDerivedPath, baseline);
      writeJsonFile(reorderedDerivedPath, reordered);

      expect(fs.readFileSync(reorderedDerivedPath, "utf8")).toBe(fs.readFileSync(baselineDerivedPath, "utf8"));

      publishDocument(baseline, path.join(scenarioRoot, "baseline", "dist"));
      publishDocument(reordered, path.join(scenarioRoot, "reordered", "dist"));

      expect(snapshotDirectory(path.join(scenarioRoot, "reordered", "dist"))).toEqual(
        snapshotDirectory(path.join(scenarioRoot, "baseline", "dist"))
      );
    } finally {
      removeDirectory(scenarioRoot);
    }
  });
});
