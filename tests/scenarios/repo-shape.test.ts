import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./helpers";

type PackageJsonLike = {
  version?: string;
  scripts?: Record<string, string>;
  publishConfig?: Record<string, unknown>;
};

describe("Scenario A - repo shape truth test", () => {
  it("keeps the repo free of demo weight and tells a truthful one-package release story", () => {
    expect(fs.existsSync(path.join(ROOT, "packages", "reference-server"))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, "packages", "reference-client"))).toBe(false);

    const packagesDirectory = fs
      .readdirSync(path.join(ROOT, "packages"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(packagesDirectory).toEqual(["aura-protocol"]);
    const tempFiles = ["temp", "tmp"]
      .filter((directory) => fs.existsSync(path.join(ROOT, directory)))
      .flatMap((directory) =>
        fs
          .readdirSync(path.join(ROOT, directory), { recursive: true, withFileTypes: true })
          .filter((entry) => !entry.isDirectory())
          .map((entry) => entry.name)
      );
    expect(tempFiles).toEqual([]);

    const rootPackage = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as PackageJsonLike;
    const protocolPackage = JSON.parse(fs.readFileSync(path.join(ROOT, "packages", "aura-protocol", "package.json"), "utf8")) as PackageJsonLike;
    expect(rootPackage.version).toBe("2.0.0-alpha.1");
    expect(protocolPackage.version).toBe(rootPackage.version);
    expect(rootPackage.scripts?.build).toBe("pnpm --filter aura-protocol build");
    expect(protocolPackage.publishConfig).toMatchObject({ access: "public", tag: "alpha" });

    const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
    expect(readme).not.toContain("aura-reference-server");
    expect(readme).not.toContain("aura-reference-client");
    expect(readme).not.toContain("npx aura-protocol derive");
    expect(readme).toContain("node packages/aura-protocol/dist/cli/aura-protocol.js derive");
    expect(readme).toContain("one-package workspace");

    const ciWorkflow = fs.readFileSync(path.join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
    expect(ciWorkflow).not.toContain("aura-reference-server");
    expect(ciWorkflow).not.toContain("aura-reference-client");

    const packageReadme = fs.readFileSync(path.join(ROOT, "packages", "aura-protocol", "README.md"), "utf8");
    expect(packageReadme).not.toContain("npx aura-protocol derive");
    expect(packageReadme).toContain("repo-local CLI build");
  });
});
