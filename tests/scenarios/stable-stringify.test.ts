import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveDocument, publishDocument } from "../../packages/aura-protocol/src";
import { writeJsonFile } from "../../packages/aura-protocol/src/filesystem";
import { ROOT, createScenarioTempDir, readJson, removeDirectory, snapshotDirectory } from "./helpers";

function reverseEntries<T>(value: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(value).reverse()) as Record<string, T>;
}

describe("Scenario I - stable stringify", () => {
  it("writes byte-identical release artifacts across repeated runs and harmless nested reordering", () => {
    const fixturePath = path.join(ROOT, "examples", "minimal-site", "source", "openapi.json");
    const fixture = readJson<Record<string, any>>(fixturePath);
    const reorderedFixture = JSON.parse(JSON.stringify(fixture)) as Record<string, any>;

    reorderedFixture.paths["/session/login"].post.requestBody.content["application/json"].schema.required = ["password", "email"];
    reorderedFixture.paths["/session/login"].post.requestBody.content["application/json"].schema.properties = reverseEntries(
      reorderedFixture.paths["/session/login"].post.requestBody.content["application/json"].schema.properties
    );
    reorderedFixture.paths["/posts"].post.requestBody.content["application/json"].schema.required = ["content", "title"];
    reorderedFixture.paths["/posts"].post.requestBody.content["application/json"].schema.properties = reverseEntries(
      reorderedFixture.paths["/posts"].post.requestBody.content["application/json"].schema.properties
    );
    reorderedFixture.paths["/posts"].get.responses["200"].content["application/json"].schema.items.properties = reverseEntries(
      reorderedFixture.paths["/posts"].get.responses["200"].content["application/json"].schema.items.properties
    );

    const baseline = deriveDocument(fixture);
    const repeated = deriveDocument(fixture);
    const reordered = deriveDocument(reorderedFixture);

    const scenarioRoot = createScenarioTempDir("aura-scenario-i-");

    try {
      const baselineDerivedPath = path.join(scenarioRoot, "baseline", ".derived", "aura-v2.json");
      const repeatedDerivedPath = path.join(scenarioRoot, "repeated", ".derived", "aura-v2.json");
      const reorderedDerivedPath = path.join(scenarioRoot, "reordered", ".derived", "aura-v2.json");
      writeJsonFile(baselineDerivedPath, baseline);
      writeJsonFile(repeatedDerivedPath, repeated);
      writeJsonFile(reorderedDerivedPath, reordered);

      const baselineBytes = fs.readFileSync(baselineDerivedPath, "utf8");
      expect(fs.readFileSync(repeatedDerivedPath, "utf8")).toBe(baselineBytes);
      expect(fs.readFileSync(reorderedDerivedPath, "utf8")).toBe(baselineBytes);

      publishDocument(baseline, path.join(scenarioRoot, "baseline", "dist"));
      publishDocument(repeated, path.join(scenarioRoot, "repeated", "dist"));
      publishDocument(reordered, path.join(scenarioRoot, "reordered", "dist"));

      const baselinePublishSnapshot = snapshotDirectory(path.join(scenarioRoot, "baseline", "dist"));
      expect(snapshotDirectory(path.join(scenarioRoot, "repeated", "dist"))).toEqual(baselinePublishSnapshot);
      expect(snapshotDirectory(path.join(scenarioRoot, "reordered", "dist"))).toEqual(baselinePublishSnapshot);
    } finally {
      removeDirectory(scenarioRoot);
    }
  });
});
