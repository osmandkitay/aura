import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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
