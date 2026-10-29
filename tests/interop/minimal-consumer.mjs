// Independent conformance consumer. No AURA implementation imports.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../packages/aura-protocol/package.json', import.meta.url));
const Ajv = require('ajv');
const ajv = new Ajv({ strict: false, strictNumbers: true, ownProperties: true });
function get(value, pointer) {
  if (pointer === '') return { exists: true, value };
  if (!pointer.startsWith('/') || /~(?:[^01]|$)/.test(pointer)) throw new Error('pointer');
  for (const part of pointer.slice(1).split('/').map(p => p.replace(/~1/g, '/').replace(/~0/g, '~'))) {
    if (value === null || typeof value !== 'object' || (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(part)) || !Object.hasOwn(value, part)) return { exists: false };
    value = value[part];
  }
  return { exists: true, value };
}
function set(value, pointer, data) {
  const parts = pointer.slice(1).split('/').map(p => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  for (const part of parts.slice(0, -1)) {
    if (['__proto__', 'constructor', 'prototype'].includes(part)) throw new Error('unsafe pointer');
    value = value[part] ??= {};
  }
  if (['__proto__', 'constructor', 'prototype'].includes(parts.at(-1))) throw new Error('unsafe pointer');
  value[parts.at(-1)] = data;
}
export function constructRequest(action, input) {
  if (!ajv.validate(action.input, input)) throw new Error('invalid input');
  let url = action.entrypoint.url;
  const headers = {}, query = [];
  let body;
  if (action.success.some(s => s.contentType === 'application/json')) headers.accept = 'application/json';
  for (const binding of action.bindings) {
    const selected = get(input, binding.input);
    if (!selected.exists) continue;
    if (binding.in === 'body' && binding.target === '') { body = JSON.stringify(selected.value); headers['content-type'] = 'application/json'; }
    else if (binding.in === 'path' && binding.style === 'simple' && binding.explode === false) {
      if (['.', '..'].includes(selected.value)) throw new Error('dot segment');
      const encoded = encodeURIComponent(String(selected.value)).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
      url = url.split('{' + binding.name + '}').join(encoded);
    } else if (binding.in === 'query' && binding.style === 'form' && binding.explode === true) {
      for (const item of Array.isArray(selected.value) ? selected.value : [selected.value]) query.push([binding.name, String(item)]);
    } else if (binding.in === 'header' && binding.style === 'simple' && binding.explode === false) headers[binding.name.toLowerCase()] = (binding.prefix ?? '') + String(selected.value);
    else throw new Error('unsupported binding');
  }
  const parsed = new URL(url);
  for (const [key, value] of query) parsed.searchParams.append(key, value);
  return { method: action.entrypoint.method, url: parsed.href, headers, ...(body === undefined ? {} : { body }) };
}
export function project(action, response) {
  const internal = {}, visible = {};
  for (const output of action.outputs) {
    const selected = get(response, output.pointer);
    if (!selected.exists) { if (output.required) throw new Error('output missing'); continue; }
    if (!ajv.validate({ type: output.type }, selected.value)) throw new Error('output type');
    Object.defineProperty(internal, output.name, { value: selected.value, enumerable: true });
    if (output.visibility === 'model') Object.defineProperty(visible, output.name, { value: selected.value, enumerable: true });
  }
  return { internal, visible };
}
export async function consume(plan, fetcher = fetch) {
  const index = await (await fetcher(plan.descriptor)).json(), details = new Map(), values = new Map(), completed = [];
  for (const step of plan.steps) {
    if (details.has(step.actionId)) continue;
    const summary = index.actions.find(s => s.id === step.actionId);
    if (!summary) throw new Error('unknown action');
    const detail = await (await fetcher(new URL(summary.href, plan.descriptor))).json();
    if (detail.id !== summary.id || detail.key !== summary.key || detail.revision !== index.revision) throw new Error('revision or identity mismatch');
    details.set(step.actionId, detail);
  }
  for (const step of plan.steps) {
    const action = details.get(step.actionId), input = {};
    for (const assignment of step.inputs) set(input, assignment.target, Object.hasOwn(assignment, 'value') ? assignment.value : get(values.get(assignment.from.step), '/' + assignment.from.output).value);
    const request = constructRequest(action, input), response = await fetcher(request.url, { ...request, redirect: 'error' });
    const success = action.success.find(s => s.status === response.status);
    if (!success) throw new Error('HTTP status');
    let body;
    if (success.contentType !== null) {
      if (response.headers.get('content-type')?.split(';')[0] !== success.contentType) throw new Error('media');
      body = await response.json();
      if (!ajv.validate(success.schema, body)) throw new Error('response schema');
    }
    const outputs = project(action, body); values.set(step.stepId, outputs.internal);
    completed.push({ stepId: step.stepId, outputs: outputs.visible });
  }
  return completed;
}
