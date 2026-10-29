import { canonicalizeJsonValue, revisionOf } from "../canonical";
import { AuraDocument } from "../schema/types";

export class CompileError extends Error {
  constructor(public code: string, public sourcePointer: string, public configPointer: string, detail: string) {
    super(`${code} source=${sourcePointer || "/"} config=${configPointer || "/"}: ${detail}`);
    this.name = "CompileError";
  }
}
export function finalizeDocument(value: Omit<AuraDocument, "revision">): AuraDocument {
  const content = canonicalizeJsonValue({
    ...value, actions: [...value.actions].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  });
  return { ...content, revision: revisionOf(content) };
}
