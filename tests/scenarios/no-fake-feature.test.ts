import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./helpers";

describe("Scenario E - no fake feature test", () => {
  it("keeps crawl, bridge, sign, index, and browser stacks out of the core repo", () => {
    for (const forbiddenPath of [
      path.join(ROOT, "packages", "aura-crawl"),
      path.join(ROOT, "packages", "aura-bridge"),
      path.join(ROOT, "packages", "aura-index"),
      path.join(ROOT, "packages", "aura-sign")
    ]) {
      expect(fs.existsSync(forbiddenPath)).toBe(false);
    }

    const dependencyText = [
      fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
      fs.readFileSync(path.join(ROOT, "packages", "aura-protocol", "package.json"), "utf8"),
      fs.readFileSync(path.join(ROOT, "pnpm-lock.yaml"), "utf8")
    ].join("\n");

    expect(dependencyText).not.toMatch(/playwright|puppeteer|selenium|cloudflare/i);

    const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
    expect(readme).toContain("it does not crawl the web");
    expect(readme).toContain("it does not automate browsers");
    expect(readme).toContain("it does not host a bridge, index, or signing service");

    const packageReadme = fs.readFileSync(path.join(ROOT, "packages", "aura-protocol", "README.md"), "utf8");
    expect(packageReadme).toContain("not a hosted runtime or framework");
  });
});
