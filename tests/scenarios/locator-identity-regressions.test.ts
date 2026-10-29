import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { deriveDocument, deriveFile, publishDocument } from "../../packages/aura-protocol/src";
import { stableStringify } from "../../packages/aura-protocol/src/canonical";
import { fixture } from "./contract-fixture";
import { createScenarioTempDir, removeDirectory, snapshotDirectory } from "./helpers";
it("G1 keeps ids when key/title changes but changes revision", () => {
  const { source, config } = fixture(), baseline = deriveDocument(source, config);
  config.actions[1].key = "article.create"; config.actions[1].title = "Create article";
  const changed = deriveDocument(source, config);
  expect(changed.actions.map(a => a.id)).toEqual(baseline.actions.map(a => a.id));
  expect(changed.revision).not.toBe(baseline.revision);
});
it("G1 preserves canonical artifact bytes when object order or local paths change", () => {
  const { source, config } = fixture(), temp = createScenarioTempDir("aura-locations-");
  const reverse = (v: any): any => Array.isArray(v) ? v.map(reverse) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverse(x)])) : v;
  try {
    const docs = ["first", "nested/second"].map((folder, i) => {
      const base = path.join(temp, folder); fs.mkdirSync(base, { recursive: true });
      fs.writeFileSync(path.join(base, "openapi.json"), JSON.stringify(i ? reverse(source) : source));
      fs.writeFileSync(path.join(base, "aura.config.json"), JSON.stringify(i ? reverse(config) : config));
      return deriveFile(path.join(base, "openapi.json"), { configPath: path.join(base, "aura.config.json") });
    });
    expect(stableStringify(docs[0].document)).toBe(stableStringify(docs[1].document));
    const dirs = docs.map((d, i) => { const out = path.join(temp, "out" + i); publishDocument(d.document, out); return snapshotDirectory(out); });
    expect(dirs[0]).toEqual(dirs[1]);
  } finally { removeDirectory(temp); }
});
