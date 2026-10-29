import { describe, expect, it } from "vitest";
import { deriveDocument, finalizeDocument, validateAuraDocument } from "../../packages/aura-protocol/src";
import { fixture } from "./contract-fixture";
describe("G1 explicit declarations", () => {
  it("rejects missing config/key/risk with source and declaration locations", () => {
    const { source, config } = fixture();
    expect(() => deriveDocument(source)).toThrow(/CONFIG_REQUIRED.*source=.*config=/);
    for (const key of ["key", "risk"]) {
      const broken: any = structuredClone(config); delete broken.actions[0][key];
      expect(() => deriveDocument(source, broken)).toThrow(new RegExp("CONFIG.*source=.*config=.*actions/0/" + key, "s"));
    }
    config.actions[0].path = "/missing";
    expect(() => deriveDocument(source, config)).toThrow(/OPERATION.*source=\/paths\/~1missing\/post.*config=\/actions\/0/);
  });
  it("never infers logout/list semantics or confidence from prose or operationId", () => {
    const { source, config } = fixture();
    config.actions = [{ id: "old.locator__deadbeefcafe", key: "session.logout", risk: "high", method: "POST", path: "/auth/logout", outputs: [] }];
    const action = deriveDocument(source, config).actions[0];
    expect(action.key).toBe("session.logout"); expect(action.risk).toBe("high");
    expect(action.id).toBe("old.locator__deadbeefcafe");
    expect(action).not.toHaveProperty("confidence"); expect(action).not.toHaveProperty("intent"); expect(action).not.toHaveProperty("confirm");
    config.actions = [fixture().config.actions[3]];
    expect(deriveDocument(source, config).actions[0].key).toBe("post.list");
  });
  it("validates fully authored input with the same mechanics and preserves provenance", () => {
    const { source, config } = fixture(), doc = deriveDocument(source, config);
    expect(deriveDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
    const { revision, ...content } = doc;
    const authored = finalizeDocument({ ...content, source: { ...content.source, kind: "aura-v2" } });
    expect(validateAuraDocument(authored).valid).toBe(true);
    expect(deriveDocument(authored)).toEqual(authored);
    expect(() => deriveDocument(doc, config)).toThrow(/CONFIG_INPUT/);
    const broken: any = structuredClone(doc); broken.actions[0].bindings[0].input = "/missing";
    expect(validateAuraDocument(broken).valid).toBe(false);
  });
  it("rejects duplicate ids, conflicting target and unknown fields", () => {
    const { source, config } = fixture();
    config.actions[1].id = config.actions[0].id;
    expect(() => deriveDocument(source, config)).toThrow(/duplicate/);
    const other = fixture(); other.config.target.url = "https://wrong.example";
    expect(() => deriveDocument(other.source, other.config)).toThrow(/TARGET_CONFLICT/);
    const unknown: any = fixture().config; unknown.actions[0].input = { type: "object" };
    expect(() => deriveDocument(source, unknown)).toThrow(/additional properties/);
  });
});
