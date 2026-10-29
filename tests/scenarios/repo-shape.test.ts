import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { AURA_PROFILE, validateAuraDocument } from "../../packages/aura-protocol/src";
import { CLI_PATH, ROOT } from "./helpers";
it("keeps one package, matching release metadata, bundled docs and a compiler-free runner entry", () => {
  expect(fs.readdirSync(path.join(ROOT, "packages"), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)).toEqual(["aura-protocol"]);
  const root = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/aura-protocol/package.json"), "utf8"));
  expect(root.version).toBe(AURA_PROFILE); expect(pkg.version).toBe(AURA_PROFILE);
  expect(pkg.bin["aura-runner"]).toBe("./dist/cli/aura-runner.js");
  expect(pkg.exports["./runner"].default).toBe("./dist/runner/index.js");
  expect(pkg.publishConfig).toEqual({ access: "public", tag: "alpha" });
  const visited = new Set<string>();
  const visit = (file: string): void => {
    if (visited.has(file)) return; visited.add(file);
    const source = fs.readFileSync(file, "utf8");
    expect(file).not.toMatch(/[\\/](derive|publish|normalize)[\\/]/);
    for (const match of source.matchAll(/require\(["'](\.[^"']+)["']\)/g)) {
      const selected = path.resolve(path.dirname(file), match[1]);
      visit(fs.existsSync(selected + ".js") ? selected + ".js" : path.join(selected, "index.js"));
    }
  };
  visit(path.join(ROOT, "packages/aura-protocol/dist/runner/index.js"));
  for (const doc of ["SPEC.md", "MIGRATION.md", "LICENSE"]) expect(fs.existsSync(path.join(ROOT, "packages/aura-protocol/dist", doc))).toBe(true);
  const authored = JSON.parse(fs.readFileSync(path.join(ROOT, "examples/minimal-site/authored-aura.json"), "utf8"));
  expect(validateAuraDocument(authored).errors).toEqual([]);
  const ci = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
  for (const command of ["pnpm build", "pnpm test --run", "pnpm check:schemas", "pnpm check:package"]) expect(ci).toContain(command);
  expect(ci).toContain("feat/**"); expect(ci).toContain("pull_request");
  const help = execFileSync(process.execPath, [CLI_PATH, "--help"], { encoding: "utf8" });
  expect(help).toContain("--config"); expect(help).toContain("derive"); expect(help).toContain("publish");
});
