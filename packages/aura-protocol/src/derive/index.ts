import path from "node:path";
import { AuraDocument } from "../schema/types";
import { readJsonFile, writeJsonFile, defaultDeriveOutputPath } from "../filesystem";
import { validateAuraDocument } from "../validate";
import { deriveFromAuraV1 } from "./from-aura-v1";
import { deriveFromOpenApi } from "./from-openapi";
import { detectInputKind } from "./detect";
import { canonicalizeDocument } from "./shared";

export interface DeriveFileOptions {
  outFile?: string;
  writeToDisk?: boolean;
}

export function deriveDocument(value: unknown): AuraDocument {
  const kind = detectInputKind(value);

  if (kind === "aura-v2") {
    const document = canonicalizeDocument(value as AuraDocument);
    const validation = validateAuraDocument(document);
    if (!validation.valid) {
      throw new Error(`Input is not a valid AURA 2.0 document:\n${validation.errors.join("\n")}`);
    }

    return document;
  }

  if (kind === "aura-v1") {
    return canonicalizeDocument(deriveFromAuraV1(value));
  }

  return canonicalizeDocument(deriveFromOpenApi(value));
}

export function deriveFile(inputPath: string, options: DeriveFileOptions = {}): { document: AuraDocument; outFile: string } {
  const input = readJsonFile<unknown>(inputPath);
  const document = deriveDocument(input);
  const outFile = path.resolve(options.outFile ?? defaultDeriveOutputPath(inputPath));

  if (options.writeToDisk !== false) {
    writeJsonFile(outFile, document);
  }

  return { document, outFile };
}

export { detectInputKind } from "./detect";
