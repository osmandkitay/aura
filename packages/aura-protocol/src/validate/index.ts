import fs from "node:fs";
import path from "node:path";
import Ajv, { ErrorObject, ValidateFunction } from "ajv";
import { finalizedActionIntegrityError } from "../derive/shared";
import { PublishedAuraAction, AuraDocument, PublishedAuraIndex } from "../schema/types";

type ValidationTarget = "document" | "publish" | "action";

export interface ValidationResult<T> {
  valid: boolean;
  target: ValidationTarget;
  schemaPath: string;
  errors: string[];
  value?: T;
}

const validatorCache = new Map<ValidationTarget, { schemaPath: string; validate: ValidateFunction }>();

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function findSchemaPath(fileName: string): string {
  const candidates = [
    path.resolve(__dirname, "..", fileName),
    path.resolve(__dirname, "..", "..", "schema", fileName),
    path.resolve(process.cwd(), "packages", "aura-protocol", "schema", fileName),
    path.resolve(process.cwd(), "schema", fileName)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Schema asset ${fileName} was not found.`);
}

function schemaFileName(target: ValidationTarget): string {
  switch (target) {
    case "document":
      return "aura-v2.schema.json";
    case "publish":
      return "aura-publish.schema.json";
    case "action":
      return "aura-action.schema.json";
  }
}

function getValidator(target: ValidationTarget): { schemaPath: string; validate: ValidateFunction } {
  const cached = validatorCache.get(target);
  if (cached) {
    return cached;
  }

  const schemaPath = findSchemaPath(schemaFileName(target));
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const loaded = { schemaPath, validate };
  validatorCache.set(target, loaded);
  return loaded;
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors || errors.length === 0) {
    return [];
  }

  return errors.map((error) => {
    const instancePath = error.instancePath || "/";
    return `${instancePath}: ${error.message}`;
  });
}

export function detectValidationTarget(value: unknown): ValidationTarget {
  if (isObject(value) && Array.isArray(value.actions)) {
    if (isObject(value.source)) {
      return "document";
    }

    return "publish";
  }

  if (isObject(value) && typeof value.key === "string" && isObject(value.intent)) {
    return "action";
  }

  throw new Error("Could not determine which AURA schema to validate against.");
}

function validateWithSchema<T>(value: unknown, target: ValidationTarget): ValidationResult<T> {
  const { schemaPath, validate } = getValidator(target);
  const valid = validate(value);

  return {
    valid: Boolean(valid),
    target,
    schemaPath,
    errors: formatAjvErrors(validate.errors),
    value: valid ? (value as T) : undefined
  };
}

export function validateAuraDocument(value: unknown): ValidationResult<AuraDocument> {
  const result = validateWithSchema<AuraDocument>(value, "document");
  if (!result.valid || !result.value) {
    return result;
  }

  const integrityError = finalizedActionIntegrityError(result.value);
  if (!integrityError) {
    return result;
  }

  return {
    ...result,
    valid: false,
    errors: [...result.errors, integrityError],
    value: undefined
  };
}

export function validatePublishedIndex(value: unknown): ValidationResult<PublishedAuraIndex> {
  return validateWithSchema<PublishedAuraIndex>(value, "publish");
}

export function validatePublishedAction(value: unknown): ValidationResult<PublishedAuraAction> {
  return validateWithSchema<PublishedAuraAction>(value, "action");
}

export function validateAny(value: unknown): ValidationResult<AuraDocument | PublishedAuraIndex | PublishedAuraAction> {
  const target = detectValidationTarget(value);

  if (target === "document") {
    return validateAuraDocument(value);
  }

  if (target === "publish") {
    return validatePublishedIndex(value);
  }

  return validatePublishedAction(value);
}

export function validateFile(filePath: string): ValidationResult<AuraDocument | PublishedAuraIndex | PublishedAuraAction> {
  const source = fs.readFileSync(path.resolve(filePath), "utf8");
  const value = JSON.parse(source) as unknown;
  return validateAny(value);
}
