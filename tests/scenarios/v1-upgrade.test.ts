import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveDocument, validateAuraDocument } from "../../packages/aura-protocol/src";
import { ROOT, readJson } from "./helpers";

describe("Scenario B - v1 upgrade test", () => {
  it("derives a valid action-first document from a v1 manifest", () => {
    const fixturePath = path.join(ROOT, "examples", "upgrade-from-v1", "source", "aura-v1.json");
    const fixture = readJson<unknown>(fixturePath);
    const document = deriveDocument(fixture, {
      sourceFile: "examples/upgrade-from-v1/source/aura-v1.json"
    });
    const validation = validateAuraDocument(document);

    expect(validation.valid).toBe(true);
    expect(document.actions.map((action) => action.key)).toEqual(["post.list", "post.create", "session.login"]);

    const createAction = document.actions.find((action) => action.key === "post.create");
    expect(createAction?.aliases).toContain("create_post");
    expect(createAction?.origin.capability).toBe("create_post");
    expect(createAction?.confidence.label).toBe("high");
  });
});
