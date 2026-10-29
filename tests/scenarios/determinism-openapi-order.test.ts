import { expect, it } from "vitest";
import { deriveDocument } from "../../packages/aura-protocol/src";
import { stableStringify } from "../../packages/aura-protocol/src/canonical";
import { fixture } from "./contract-fixture";
it("canonicalizes object/config action order while preserving explicit identities", () => {
  const { source, config } = fixture(), baseline = deriveDocument(source, config);
  source.paths = Object.fromEntries(Object.entries(source.paths).reverse()); config.actions.reverse();
  expect(stableStringify(deriveDocument(source, config))).toBe(stableStringify(baseline));
});
