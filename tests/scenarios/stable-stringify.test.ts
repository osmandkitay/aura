import { expect, it } from "vitest";
import { stableStringify } from "../../packages/aura-protocol/src/canonical";
import { deriveDocument } from "../../packages/aura-protocol/src";
import { fixture } from "./contract-fixture";
it("preserves literal array order even for fields named required or aliases", () => {
  const literal = { required: ["z", "a"], aliases: ["second", "first"] };
  expect(JSON.parse(stableStringify(literal))).toEqual(literal);
  const { source, config } = fixture();
  source.components.schemas.Draft.default = literal;
  expect((deriveDocument(source, config).actions.find(a => a.id === "create")!.input as any).properties.body.default).toEqual(literal);
});
