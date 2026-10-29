import fs from "node:fs";
import path from "node:path";
import { stableStringify } from "../canonical";
import { readJsonFile } from "../filesystem";
import { AuraDocument, PublishedAuraAction, PublishedAuraIndex } from "../schema/types";
import { deriveDocument } from "../derive";
import { validateAuraDocument, validatePublishedAction, validatePublishedIndex } from "../validate";
import { toPublishedAction, toPublishedIndex, assertSummary } from "../surface";
export { toPublishedAction, toPublishedIndex, assertSummary } from "../surface";

export interface PublishResult { derived: AuraDocument; index: PublishedAuraIndex; indexPath: string; actionPaths: string[] }
export function validatePublication(indexPath: string): void {
  const index = readJsonFile<PublishedAuraIndex>(indexPath), validation = validatePublishedIndex(index);
  if (!validation.valid) throw new Error(validation.errors.join("\n"));
  for (const summary of index.actions) {
    const detail = readJsonFile<PublishedAuraAction>(path.resolve(path.dirname(indexPath), summary.href));
    const result = validatePublishedAction(detail);
    if (!result.valid) throw new Error(result.errors.join("\n"));
    assertSummary(index, detail);
  }
}
export function publishDocument(document: AuraDocument, outDirectory: string): PublishResult {
  const validation = validateAuraDocument(document);
  if (!validation.valid) throw new Error("Invalid AURA document:\n" + validation.errors.join("\n"));
  const root = path.resolve(outDirectory), indexPath = path.join(root, ".well-known", "aura.json");
  fs.mkdirSync(root, { recursive: true });
  const stage = fs.mkdtempSync(path.join(root, ".aura-stage-"));
  const index = toPublishedIndex(document), files = new Map<string, string>();
  const actionPaths = index.actions.map(a => path.resolve(path.dirname(indexPath), a.href));
  document.actions.forEach((a, i) => files.set(actionPaths[i], stableStringify(toPublishedAction(document, a))));
  files.set(indexPath, stableStringify(index)); // Descriptor is committed last.
  const oldFiles = new Set<string>();
  const backup = new Map<string, Buffer | null>();
  try {
    if (fs.existsSync(indexPath)) {
      validatePublication(indexPath);
      const old = readJsonFile<PublishedAuraIndex>(indexPath);
      oldFiles.add(indexPath);
      old.actions.forEach(a => oldFiles.add(path.resolve(path.dirname(indexPath), a.href)));
    }
    for (const [destination, bytes] of files) {
      if (fs.existsSync(destination) && !oldFiles.has(destination)) throw new Error("UNOWNED_PATH: refusing to replace " + path.relative(root, destination));
      const relative = path.relative(root, destination);
      const staged = path.join(stage, relative);
      fs.mkdirSync(path.dirname(staged), { recursive: true }); fs.writeFileSync(staged, bytes);
    }
    validatePublication(path.join(stage, ".well-known", "aura.json"));
    for (const destination of new Set([...files.keys(), ...oldFiles])) {
      backup.set(destination, fs.existsSync(destination) ? fs.readFileSync(destination) : null);
    }
    for (const destination of files.keys()) {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(stage, path.relative(root, destination)), destination);
    }
    for (const destination of oldFiles) if (!files.has(destination)) fs.unlinkSync(destination);
  } catch (error) {
    for (const [destination, bytes] of backup) {
      if (bytes === null) { if (fs.existsSync(destination)) fs.unlinkSync(destination); }
      else fs.writeFileSync(destination, bytes);
    }
    throw error;
  } finally { fs.rmSync(stage, { recursive: true, force: true }); }
  return { derived: document, index, indexPath, actionPaths };
}
export function publishFile(inputPath: string, outDirectory: string): PublishResult {
  return publishDocument(deriveDocument(readJsonFile(inputPath)), outDirectory);
}
