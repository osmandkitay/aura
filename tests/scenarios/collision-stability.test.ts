import { expect, it } from "vitest";
import { deriveDocument } from "../../packages/aura-protocol/src";
import { toPublishedIndex } from "../../packages/aura-protocol/src/publish";
import { fixture } from "./contract-fixture";
it("G1 preserves explicit ids and hrefs across 1→2→3→2→1 same-key siblings", () => {
  const { source, config } = fixture();
  const selections = [0, 1, 3].map(i => ({ ...config.actions[i], key: "custom.perform", requires: undefined, errors: undefined, outputs: [] }));
  for (const n of [1, 2, 3, 2, 1]) {
    const result = deriveDocument(source, { ...config, actions: selections.slice(0, n) });
    expect(result.actions.map(a => a.id).sort()).toEqual(selections.slice(0, n).map(a => a.id).sort());
    for (const summary of toPublishedIndex(result).actions) expect(summary.href).toBe("aura/actions/" + summary.id + ".json");
  }
});

it("keeps same-key cross-site body signatures visibly distinct", () => {
  const first = fixture(), second = fixture();
  for (const f of [first, second]) { f.config.actions = [f.config.actions[1]]; delete f.config.actions[0].requires; delete f.config.actions[0].errors; }
  second.config.target.url = "https://second-api.example/v1"; second.source.servers[0].url = second.config.target.url;
  second.source.components.schemas.Draft = { type: "object", required: ["headline"], properties: { headline: { type: "integer" } } };
  const a = toPublishedIndex(deriveDocument(first.source, first.config)).actions[0];
  const b = toPublishedIndex(deriveDocument(second.source, second.config)).actions[0];
  expect(a.key).toBe(b.key); expect(a.id).toBe(b.id); expect(a.inputs).not.toEqual(b.inputs);
  expect(a.inputs).toContainEqual({ name: "/body/title", type: "string", required: true });
  expect(b.inputs).toContainEqual({ name: "/body/headline", type: "integer", required: true });
});
