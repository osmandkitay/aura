import fs from "node:fs";
import path from "node:path";
import { stableStringify } from "./canonical";

export function ensureDirectory(directoryPath: string): void {
  fs.mkdirSync(directoryPath, { recursive: true });
}

export function readJsonFile<T>(filePath: string): T {
  const absolutePath = path.resolve(filePath);
  const source = fs.readFileSync(absolutePath, "utf8");

  try {
    return JSON.parse(source) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown JSON parse failure";
    throw new Error(`Could not parse JSON from ${absolutePath}: ${message}`);
  }
}

export function writeJsonFile(filePath: string, value: unknown): void {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(path.resolve(filePath), stableStringify(value), "utf8");
}

export function defaultDeriveOutputPath(inputPath: string): string {
  const absoluteInputPath = path.resolve(inputPath);
  const inputDirectory = path.dirname(absoluteInputPath);
  const outputRoot = path.basename(inputDirectory) === "source" ? path.dirname(inputDirectory) : inputDirectory;
  return path.join(outputRoot, ".derived", "aura-v2.json");
}

export function toPortablePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

export function relativePortablePath(filePath: string): string {
  return toPortablePath(path.relative(process.cwd(), path.resolve(filePath)) || path.basename(filePath));
}
