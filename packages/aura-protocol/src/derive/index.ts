import path from "node:path";
import { AuraDocument } from "../schema/types";
import { relativePortablePath, readJsonFile, writeJsonFile, defaultDeriveOutputPath } from "../filesystem";
import { validateAuraDocument } from "../validate";
import { deriveFromAuraV1 } from "./from-aura-v1";
import { deriveFromOpenApi } from "./from-openapi";
import { detectInputKind } from "./detect";

export interface DeriveOptions {
  outFile?: string;
  writeToDisk?: boolean;
  sourceFile?: string;
}

export function deriveDocument(value: unknown, options: DeriveOptions = {}): AuraDocument {
  const sourceFile = options.sourceFile;
  const kind = detectInputKind(value);

  if (kind === "aura-v2") {
    const validation = validateAuraDocument(value);
    if (!validation.valid) {
      throw new Error(`Input is not a valid AURA 2.0 document:\n${validation.errors.join("\n")}`);
    }

    return value as AuraDocument;
  }

  if (kind === "aura-v1") {
    return deriveFromAuraV1(value, { sourceFile });
  }

  return deriveFromOpenApi(value, { sourceFile });
}

export function deriveFile(inputPath: string, options: DeriveOptions = {}): { document: AuraDocument; outFile: string } {
  const input = readJsonFile<unknown>(inputPath);
  const sourceFile = options.sourceFile ?? relativePortablePath(inputPath);
  const document = deriveDocument(input, { ...options, sourceFile });
  const outFile = path.resolve(options.outFile ?? defaultDeriveOutputPath(inputPath));

  if (options.writeToDisk !== false) {
    writeJsonFile(outFile, document);
  }

  return { document, outFile };
}

export { detectInputKind } from "./detect";
