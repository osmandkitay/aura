import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AuraAction } from "../../packages/aura-protocol/src";

export const ROOT = path.resolve(__dirname, "..", "..");
export const CLI_PATH = path.join(ROOT, "packages", "aura-protocol", "dist", "cli", "aura-protocol.js");

export function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

export function createScenarioTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function removeDirectory(directoryPath: string): void {
  fs.rmSync(directoryPath, { recursive: true, force: true });
}

export function snapshotDirectory(directoryPath: string): Record<string, string> {
  const snapshot: Record<string, string> = {};

  function walk(currentPath: string): void {
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }

      snapshot[path.relative(directoryPath, entryPath).split(path.sep).join("/")] = fs.readFileSync(entryPath, "utf8");
    }
  }

  walk(directoryPath);
  return snapshot;
}

export function locatorIdentitySeed(action: Pick<AuraAction, "entrypoint" | "origin">): string {
  return JSON.stringify({
    method: action.entrypoint.method,
    operation: action.origin.operationId ?? "",
    path: action.entrypoint.path,
    ref: action.origin.ref ?? "",
    source: action.origin.source
  });
}

export function locatorHashSuffix(action: Pick<AuraAction, "entrypoint" | "origin">, length = 12): string {
  return createHash("sha256").update(locatorIdentitySeed(action)).digest("hex").slice(0, length);
}
