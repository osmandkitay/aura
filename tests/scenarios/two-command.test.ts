import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateFile } from "../../packages/aura-protocol/src";
import { CLI_PATH, ROOT, createScenarioTempDir, readJson, removeDirectory } from "./helpers";

describe("Scenario C - two-command happy path", () => {
  it("derives then publishes a valid well-known action surface", () => {
    const scenarioRoot = createScenarioTempDir("aura-scenario-c-");

    try {
      fs.mkdirSync(path.join(scenarioRoot, "source"), { recursive: true });
      fs.copyFileSync(
        path.join(ROOT, "examples", "upgrade-from-v1", "source", "aura-v1.json"),
        path.join(scenarioRoot, "source", "aura-v1.json")
      );

      execFileSync("node", [CLI_PATH, "derive", path.join(scenarioRoot, "source", "aura-v1.json")], {
        cwd: ROOT,
        stdio: "pipe"
      });

      execFileSync(
        "node",
        [
          CLI_PATH,
          "publish",
          path.join(scenarioRoot, ".derived", "aura-v2.json"),
          "--out",
          path.join(scenarioRoot, "dist")
        ],
        {
          cwd: ROOT,
          stdio: "pipe"
        }
      );

      const indexPath = path.join(scenarioRoot, "dist", ".well-known", "aura.json");
      expect(fs.existsSync(indexPath)).toBe(true);

      const validation = validateFile(indexPath);
      expect(validation.valid).toBe(true);
      expect(validation.target).toBe("publish");

      const index = readJson<{ actions: Array<{ id: string; key: string; href: string }> }>(indexPath);
      for (const action of index.actions) {
        const detailPath = path.join(scenarioRoot, "dist", ...action.href.split("/").filter(Boolean));
        expect(fs.existsSync(detailPath)).toBe(true);

        const detailValidation = validateFile(detailPath);
        expect(detailValidation.valid).toBe(true);
        expect(detailValidation.target).toBe("action");

        const detail = readJson<{ id: string; key: string }>(detailPath);
        expect(detail.id).toBe(action.id);
        expect(detail.key).toBe(action.key);
      }
    } finally {
      removeDirectory(scenarioRoot);
    }
  });
});
