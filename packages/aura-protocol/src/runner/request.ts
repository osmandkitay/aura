import Ajv, { ErrorObject } from 'ajv';
import { AuraAction, Binding, JsonSchema, Output } from '../schema/types';
import { readPointer } from '../pointer';
import { unsupportedNumberPointer } from '../numbers';
import { conflictingOutputVisibility } from '../validate/integrity';

const ajv = new Ajv({ strict: false, strictNumbers: true, ownProperties: true, validateFormats: false, allErrors: true });
const cache = new WeakMap<object, ReturnType<Ajv['compile']>>();
export function valueErrors(schema: JsonSchema, value: unknown): ErrorObject[] {
  validateNumbers(value);
  let validate = typeof schema === 'object' ? cache.get(schema) : undefined;
  if (!validate) { validate = ajv.compile(schema); if (typeof schema === 'object') cache.set(schema, validate); }
  return validate(value) ? [] : [...(validate.errors ?? [])];
}
export class RunnerError extends Error {
  constructor(public code: string, public location: string = '/') {
    super(`${code} at ${location}`); this.name = 'RunnerError';
  }
}
export function validateNumbers(value: unknown): void {
  const pointer = unsupportedNumberPointer(value);
  if (pointer !== undefined) throw new RunnerError('NUMBER_UNSUPPORTED', pointer || '/');
}
export interface BuiltRequest { method: string; url: string; headers: Record<string, string>; body?: string }
export function validateWireValue(binding: Binding, value: unknown): void {
  if (binding.in === 'path' && (value === '.' || value === '..')) throw new RunnerError('PATH_DOT_SEGMENT', binding.input);
  if (binding.in === 'header' && /[^\t\x20-\x7e\x80-\xff]/.test((binding.prefix ?? '') + String(value))) throw new RunnerError('HEADER_VALUE', binding.input);
  if (binding.in === 'path' || binding.in === 'query') {
    try { for (const part of Array.isArray(value) ? value : [value]) encodeURIComponent(String(part)); }
    catch { throw new RunnerError('PARAMETER_UNICODE', binding.input); }
  }
}
export function buildRequest(action: AuraAction, input: unknown): BuiltRequest {
  if (valueErrors(action.input, input).length) throw new RunnerError('INPUT_INVALID');
  const headers: Record<string, string> = {};
  if (action.success.some(s => s.contentType === 'application/json')) headers.accept = 'application/json';
  let template = action.entrypoint.url;
  const pathValues = new Map<string, string>();
  const query: [string, string][] = [];
  let body: string | undefined;
  for (const binding of action.bindings) {
    const selected = readPointer(input, binding.input);
    if (!selected.found) continue;
    const value = selected.value;
    validateWireValue(binding, value);
    if (binding.in === 'body') { body = JSON.stringify(value); headers['content-type'] = 'application/json'; }
    else if (binding.in === 'path') {
      if (!template.includes('{' + binding.name + '}')) throw new RunnerError('PATH_TEMPLATE', binding.input);
      // URL parsers normalize dot segments even when their dots are percent-encoded.
      const encoded = encodeURIComponent(String(value)).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
      pathValues.set(binding.name!, encoded);
    } else if (binding.in === 'query') {
      for (const item of Array.isArray(value) ? value : [value]) query.push([binding.name!, String(item)]);
    } else {
      const text = (binding.prefix ?? '') + String(value);
      headers[binding.name!.toLowerCase()] = text;
    }
  }
  template = template.replace(/{([^{}]+)}/g, (_match, name) => {
    if (!pathValues.has(name)) throw new RunnerError('PATH_MISSING');
    return pathValues.get(name)!;
  });
  if (/[{}]/.test(template)) throw new RunnerError('PATH_TEMPLATE');
  const url = new URL(template);
  for (const [name, value] of query) url.searchParams.append(name, value);
  return { method: action.entrypoint.method, url: url.href, headers, ...(body === undefined ? {} : { body }) };
}
export function projectOutputs(outputs: Output[], value: unknown): { internal: Record<string, unknown>; visible: Record<string, unknown> } {
  if (conflictingOutputVisibility(outputs)) throw new RunnerError('OUTPUT_VISIBILITY');
  const internal: Record<string, unknown> = Object.create(null), visible: Record<string, unknown> = Object.create(null);
  for (const output of outputs) {
    const selected = value === undefined ? { found: false } : readPointer(value, output.pointer);
    if (!selected.found) {
      if (output.required) throw new RunnerError('OUTPUT_MISSING', '/outputs/' + output.name);
      continue;
    }
    if (valueErrors({ type: output.type }, selected.value).length) throw new RunnerError('OUTPUT_TYPE', '/outputs/' + output.name);
    internal[output.name] = selected.value;
    if (output.visibility === 'model') visible[output.name] = selected.value;
  }
  return { internal, visible };
}
