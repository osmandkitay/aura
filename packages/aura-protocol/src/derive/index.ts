import path from "node:path";
import { AuraConfig, AuraDocument } from "../schema/types";
import { readJsonFile, writeJsonFile, defaultDeriveOutputPath } from "../filesystem";
import { validateAuraDocument, validateConfig } from "../validate";
import { deriveFromOpenApi } from "./from-openapi";
import { detectInputKind } from "./detect";
import { CompileError } from "./shared";
import { pointerEscape } from "../pointer";

export interface DeriveFileOptions { outFile?: string; writeToDisk?: boolean; configPath?: string }
export function deriveDocument(value: unknown, config?: unknown): AuraDocument {
  if (detectInputKind(value) === "aura-v2") {
    if (config !== undefined) throw new CompileError("CONFIG_INPUT", "/", "/", "A fully authored AURA input already contains its declaration");
    const result = validateAuraDocument(value);
    if (!result.valid) throw new CompileError("AURA_INPUT", "/", "/", result.errors.join("\n"));
    return value as AuraDocument;
  }
  if (config === undefined) throw new CompileError("CONFIG_REQUIRED", "/", "/", "OpenAPI requires an explicit aura.config.json");
  const declaration = validateConfig(config);
  if (!declaration.valid) {
    const cp = declaration.errors[0]?.split(":")[0] || "/";
    const index = cp.match(/^\/actions\/([0-9]+)/)?.[1];
    const selected = index === undefined ? undefined : (config as any)?.actions?.[Number(index)];
    const source = typeof selected?.path === "string" && typeof selected?.method === "string"
      ? "/paths/" + pointerEscape(selected.path) + "/" + selected.method.toLowerCase() : "/";
    throw new CompileError("CONFIG", source, cp, declaration.errors.join("\n"));
  }
  const document = deriveFromOpenApi(value, config as AuraConfig);
  const result = validateAuraDocument(document);
  if (!result.valid) throw new CompileError("COMPILED_CONTRACT", "/paths", "/actions", result.errors.join("\n"));
  return document;
}
export function deriveFile(inputPath: string, options: DeriveFileOptions = {}): { document: AuraDocument; outFile: string } {
  const document = deriveDocument(readJsonFile(inputPath), options.configPath ? readJsonFile(options.configPath) : undefined);
  const outFile = path.resolve(options.outFile ?? defaultDeriveOutputPath(inputPath));
  if (options.writeToDisk !== false) writeJsonFile(outFile, document);
  return { document, outFile };
}
export { detectInputKind } from "./detect";
