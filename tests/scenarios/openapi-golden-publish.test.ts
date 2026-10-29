import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { deriveDocument, finalizeDocument, publishDocument, validatePublication } from "../../packages/aura-protocol/src";
import { toPublishedAction, toPublishedIndex } from "../../packages/aura-protocol/src/surface";
import { fixture } from "./contract-fixture";
import { createScenarioTempDir, removeDirectory, snapshotDirectory } from "./helpers";
describe("G3 publication integrity", () => {
  it("publishes compact relative L1 and self-contained L2; detects revision/href/duplicate drift", () => {
    const { source, config } = fixture(), doc = deriveDocument(source, config), temp = createScenarioTempDir("aura-publish-");
    try {
      const result = publishDocument(doc, temp);
      expect(result.index.actions[0]).toEqual({ id: "create", key: "post.create", href: "aura/actions/create.json",
        inputs: [{ name: "/body", type: "object", required: true }, { name: "/body/title", type: "string", required: true }, { name: "/header/Authorization", type: "string", required: true }],
        outputs: [{ name: "created_id", type: "string", required: true }], requires: ["login"] });
      expect(result.index).not.toHaveProperty("description");
      validatePublication(result.indexPath);
      const detail = toPublishedAction(doc, doc.actions[0]); detail.revision = "0".repeat(64);
      fs.writeFileSync(result.actionPaths[0], JSON.stringify(detail));
      expect(() => validatePublication(result.indexPath)).toThrow(/MISMATCH/);
      fs.writeFileSync(result.actionPaths[0], JSON.stringify(toPublishedAction(doc, doc.actions[0])));
      for (const mutate of [(v: any) => v.actions.push(v.actions[0]), (v: any) => v.actions[0].href = "../escape.json"]) {
        const index = toPublishedIndex(doc); mutate(index); fs.writeFileSync(result.indexPath, JSON.stringify(index));
        expect(() => validatePublication(result.indexPath)).toThrow();
      }
    } finally { removeDirectory(temp); }
  });
  it("retires only owned files and preserves a valid publication after an interrupted commit", () => {
    const { source, config } = fixture(), doc = deriveDocument(source, config), temp = createScenarioTempDir("aura-rollback-");
    try {
      publishDocument(doc, temp);
      const unrelated = path.join(temp, ".well-known/aura/actions/notes.txt"); fs.writeFileSync(unrelated, "keep");
      const { revision, ...content } = doc;
      const reduced = finalizeDocument({ ...content, actions: doc.actions.filter(a => a.id !== "list") });
      publishDocument(reduced, temp);
      expect(fs.existsSync(path.join(temp, ".well-known/aura/actions/list.json"))).toBe(false);
      expect(fs.readFileSync(unrelated, "utf8")).toBe("keep");
      const baseline = snapshotDirectory(temp), original = fs.copyFileSync;
      let copies = 0;
      const spy = vi.spyOn(fs, "copyFileSync").mockImplementation((...args) => {
        if (++copies === 2) throw new Error("injected commit failure");
        return original(...args);
      });
      try { expect(() => publishDocument(doc, temp)).toThrow(/injected commit failure/); } finally { spy.mockRestore(); }
      expect(snapshotDirectory(temp)).toEqual(baseline);
      validatePublication(path.join(temp, ".well-known/aura.json"));
      expect(fs.readdirSync(temp).some(p => p.startsWith(".aura-stage"))).toBe(false);
    } finally { removeDirectory(temp); }
  });
  it("rejects unowned collisions without deleting user files", () => {
    const { source, config } = fixture(), temp = createScenarioTempDir("aura-unowned-");
    try {
      const file = path.join(temp, ".well-known/aura/actions/create.json"); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, "user");
      expect(() => publishDocument(deriveDocument(source, config), temp)).toThrow(/UNOWNED_PATH/);
      expect(fs.readFileSync(file, "utf8")).toBe("user");
    } finally { removeDirectory(temp); }
  });
});
