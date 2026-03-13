import fs from "node:fs";
import path from "node:path";
import { AURA_ACTION_SCHEMA_URL, AURA_PUBLISH_SCHEMA_URL } from "../constants";
import { ensureDirectory, readJsonFile, writeJsonFile } from "../filesystem";
import { AuraDocument, PublishedAuraAction, PublishedAuraIndex } from "../schema/types";
import { deriveDocument } from "../derive";
import { canonicalizeDocument } from "../derive/shared";
import { validateAuraDocument, validatePublishedAction, validatePublishedIndex } from "../validate";

export interface PublishResult {
  derived: AuraDocument;
  index: PublishedAuraIndex;
  indexPath: string;
  actionPaths: string[];
}

function actionHref(actionId: string): string {
  return `/.well-known/aura/actions/${actionId}.json`;
}

function toPublishedAction(action: AuraDocument["actions"][number]): PublishedAuraAction {
  return {
    $schema: AURA_ACTION_SCHEMA_URL,
    ...action
  };
}

function toPublishedIndex(document: AuraDocument): PublishedAuraIndex {
  return {
    $schema: AURA_PUBLISH_SCHEMA_URL,
    protocol: document.protocol,
    version: document.version,
    site: document.site,
    actions: document.actions.map((action) => ({
      id: action.id,
      key: action.key,
      title: action.title,
      intent: action.intent,
      href: actionHref(action.id),
      docsHref: action.docs?.href,
      auth: action.auth,
      confirm: action.confirm,
      risk: action.risk
    }))
  };
}

function assertPublishedSurfaceIntegrity(outputRoot: string, index: PublishedAuraIndex, publishedActions: PublishedAuraAction[]): void {
  const actionsById = new Map(publishedActions.map((action) => [action.id, action]));

  for (const summary of index.actions) {
    const linkedPath = path.join(outputRoot, ...summary.href.split("/").filter(Boolean));
    if (!fs.existsSync(linkedPath)) {
      throw new Error(`Published index points at a missing action detail file: ${summary.href}`);
    }

    const detail = actionsById.get(summary.id);
    if (!detail) {
      throw new Error(`Published index refers to an unknown action id: ${summary.id}`);
    }

    if (summary.href !== actionHref(detail.id)) {
      throw new Error(`Published index href drifted from the action id for ${summary.id}.`);
    }

    if (summary.key !== detail.key || summary.title !== detail.title) {
      throw new Error(`Published index summary drifted from the action detail for ${summary.id}.`);
    }

    if (summary.intent.domain !== detail.intent.domain || summary.intent.verb !== detail.intent.verb) {
      throw new Error(`Published index intent drifted from the action detail for ${summary.id}.`);
    }
  }
}

export function publishDocument(document: AuraDocument, outDirectory: string): PublishResult {
  const canonicalDocument = canonicalizeDocument(document);
  const validatedDocument = validateAuraDocument(canonicalDocument);
  if (!validatedDocument.valid) {
    throw new Error(`Derived document failed validation:\n${validatedDocument.errors.join("\n")}`);
  }

  const outputRoot = path.resolve(outDirectory);
  const wellKnownDirectory = path.join(outputRoot, ".well-known");
  const actionsDirectory = path.join(wellKnownDirectory, "aura", "actions");
  ensureDirectory(actionsDirectory);

  const actionPaths: string[] = [];
  const publishedActions: PublishedAuraAction[] = [];
  for (const action of canonicalDocument.actions) {
    const publishedAction = toPublishedAction(action);
    const actionValidation = validatePublishedAction(publishedAction);
    if (!actionValidation.valid) {
      throw new Error(`Action ${action.key} failed validation:\n${actionValidation.errors.join("\n")}`);
    }

    const filePath = path.join(actionsDirectory, `${action.id}.json`);
    writeJsonFile(filePath, publishedAction);
    actionPaths.push(filePath);
    publishedActions.push(publishedAction);
  }

  const index = toPublishedIndex(canonicalDocument);
  const indexValidation = validatePublishedIndex(index);
  if (!indexValidation.valid) {
    throw new Error(`Published index failed validation:\n${indexValidation.errors.join("\n")}`);
  }

  const indexPath = path.join(wellKnownDirectory, "aura.json");
  writeJsonFile(indexPath, index);

  assertPublishedSurfaceIntegrity(outputRoot, index, publishedActions);

  return {
    derived: canonicalDocument,
    index,
    indexPath,
    actionPaths
  };
}

export function publishFile(inputPath: string, outDirectory: string): PublishResult {
  const source = readJsonFile<unknown>(inputPath);
  const derived = deriveDocument(source);
  return publishDocument(derived, outDirectory);
}
