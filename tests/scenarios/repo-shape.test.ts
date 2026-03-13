import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLI_PATH, ROOT } from "./helpers";

type PackageJsonLike = {
  version?: string;
  scripts?: Record<string, string>;
  publishConfig?: Record<string, unknown>;
};

function trackedFiles(...paths: string[]): string[] {
  const output = execFileSync("git", ["ls-files", ...paths], {
    cwd: ROOT,
    encoding: "utf8"
  });

  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => fs.existsSync(path.join(ROOT, line)));
}

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
    expect(trackedFiles(".github")).toEqual([".github/workflows/ci.yml"]);
    expect(trackedFiles("examples")).toEqual(["examples/minimal-site/source/openapi.json"]);

    const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
    expect(readme).not.toContain("aura-reference-server");
    expect(readme).not.toContain("aura-reference-client");
    expect(readme).not.toContain("local AURA v1 JSON");
    expect(readme).not.toContain("npx aura-protocol derive");
    expect(readme).toContain("Consumers do not need this repo or package.");
    expect(readme).toContain("npx aura-protocol@2.0.0-alpha.1 derive <input>");
    expect(readme).toContain("node packages/aura-protocol/dist/cli/aura-protocol.js derive");
    expect(readme).toContain("Agent-Usable Resource Assertion");
    expect(readme).toContain("one-package workspace");

    const ciWorkflow = fs.readFileSync(path.join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
    expect(ciWorkflow).not.toContain("aura-reference-server");
    expect(ciWorkflow).not.toContain("aura-reference-client");

    const packageReadme = fs.readFileSync(path.join(ROOT, "packages", "aura-protocol", "README.md"), "utf8");
    expect(packageReadme).toContain("Consume AURA Without The Package");
    expect(packageReadme).not.toContain("local AURA v1 JSON");
    expect(packageReadme).toContain("plain `npx aura-protocol` does not yet run this 2.0 code");
    expect(packageReadme).toContain("npx aura-protocol@2.0.0-alpha.1 derive <input>");

    const cliHelp = execFileSync("node", [CLI_PATH, "--help"], {
      cwd: ROOT,
      encoding: "utf8"
    });
    expect(cliHelp).toContain("Small AURA 2.0 core compiler for local files.");
    expect(cliHelp).toContain("Published AURA is consumed directly from /.well-known/aura.json without this CLI.");
  });
});
