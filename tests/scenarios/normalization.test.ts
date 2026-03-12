import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveDocument } from "../../packages/aura-protocol/src";
import { ROOT, readJson } from "./helpers";

describe("Scenario D - ugly naming normalization test", () => {
  it("normalizes ugly names while preserving raw provenance and confidence", () => {
    const fixturePath = path.join(ROOT, "packages", "aura-protocol", "fixtures", "ugly-openapi.json");
    const fixture = readJson<unknown>(fixturePath);
    const document = deriveDocument(fixture, {
      sourceFile: "packages/aura-protocol/fixtures/ugly-openapi.json"
    });

    expect(document.actions.map((action) => action.key)).toEqual(["post.create", "thing.perform", "account.create"]);

    const uglyAction = document.actions.find((action) => action.key === "thing.perform");
    expect(uglyAction?.aliases).toContain("doThingFinal");
    expect(uglyAction?.origin.operationId).toBe("doThingFinal");
    expect(uglyAction?.confidence.label).toBe("low");
  });
});
