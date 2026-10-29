// Benchmark baseline: local OpenAPI + explicit selections + a generic linear
// executor. It pipes outputs without an LLM and imports no AURA implementation.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../packages/aura-protocol/package.json', import.meta.url));
const Ajv = require('ajv');
const ajv = new Ajv({ strict: false, strictNumbers: true, ownProperties: true });
function pointer(root, path) {
  return path === '' ? root : path.slice(1).split('/').map(s => s.replace(/~1/g, '/').replace(/~0/g, '~')).reduce((v, k) => v?.[k], root);
}
function resolve(root, schema, active = []) {
  if (!schema || typeof schema !== 'object') return schema;
  if (schema.$ref) {
    if (!schema.$ref.startsWith('#/') || active.includes(schema.$ref)) throw new Error('unsupported baseline ref');
    return resolve(root, pointer(root, schema.$ref.slice(1)), [...active, schema.$ref]);
  }
  if (Array.isArray(schema)) return schema.map(s => resolve(root, s, active));
  return Object.fromEntries(Object.entries(schema).map(([k, v]) => [k, resolve(root, v, active)]));
}
export async function runOpenApi(root, config, plan, fetcher = fetch) {
  const values = new Map(), completed = [];
  let parseProjectionMs = 0, responseBytes = 0;
  for (const step of plan.steps) {
    const selection = config.actions.find(a => a.id === step.actionId);
    if (!selection) throw new Error('unknown selection');
    const pathItem = root.paths[selection.path], operation = pathItem[selection.method.toLowerCase()], input = {};
    for (const assignment of step.inputs) {
      const parts = assignment.target.slice(1).split('/').map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'));
      let object = input;
      for (const part of parts.slice(0, -1)) object = object[part] ??= {};
      object[parts.at(-1)] = Object.hasOwn(assignment, 'value') ? assignment.value : values.get(assignment.from.step)[assignment.from.output];
    }
    const server = operation.servers?.[0] ?? pathItem.servers?.[0] ?? root.servers?.[0];
    let template = server.url.replace(/\/$/, '') + selection.path;
    const headers = {}, query = [];
    const parameters = new Map();
    for (const p of [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])].map(p => resolve(root, p))) parameters.set(p.in + ':' + p.name, p);
    for (const p of parameters.values()) {
      const value = input[p.in]?.[p.name];
      if (value === undefined) { if (p.required) throw new Error('parameter required'); continue; }
      if (!ajv.validate(resolve(root, p.schema), value)) throw new Error('parameter type');
      if (p.in === 'path') template = template.replace('{' + p.name + '}', encodeURIComponent(String(value)).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()));
      else if (p.in === 'query') for (const v of Array.isArray(value) ? value : [value]) query.push([p.name, String(v)]);
      else if (p.in === 'header') headers[p.name.toLowerCase()] = String(value);
      else throw new Error('unsupported baseline parameter');
    }
    const url = new URL(template); for (const [key, value] of query) url.searchParams.append(key, value);
    const security = operation.security ?? root.security ?? [];
    if (security.length) {
      if (security.length !== 1 || Object.keys(security[0]).length !== 1) throw new Error('unsupported baseline auth');
      const name = Object.keys(security[0])[0], scheme = root.components.securitySchemes[name];
      if (scheme.type === 'http' && scheme.scheme === 'bearer') headers.authorization = 'Bearer ' + input.header.Authorization;
      else if (scheme.type === 'apiKey' && scheme.in === 'header') headers[scheme.name.toLowerCase()] = input.header[scheme.name];
      else throw new Error('unsupported baseline auth');
    }
    const successResponses = Object.entries(operation.responses).filter(([code]) => /^2[0-9]{2}$/.test(code)).map(([code, r]) => [Number(code), resolve(root, r)]);
    if (successResponses.some(([, r]) => r.content?.['application/json'])) headers.accept = 'application/json';
    let body;
    if (operation.requestBody) {
      const declaration = resolve(root, operation.requestBody);
      if (input.body === undefined && declaration.required) throw new Error('body required');
      if (input.body !== undefined) {
        if (!ajv.validate(declaration.content['application/json'].schema, input.body)) throw new Error('body invalid');
        body = JSON.stringify(input.body); headers['content-type'] = 'application/json';
      }
    }
    const response = await fetcher(url, { method: selection.method, headers, body, redirect: 'error' });
    const declared = successResponses.find(([code]) => code === response.status)?.[1];
    if (!declared) throw new Error('HTTP status');
    let data;
    if (declared.content) {
      if (response.headers.get('content-type')?.split(';')[0] !== 'application/json') throw new Error('media');
      const text = await response.text(), start = performance.now(); responseBytes += Buffer.byteLength(text);
      data = JSON.parse(text);
      if (!ajv.validate(declared.content['application/json'].schema, data)) throw new Error('response schema');
      parseProjectionMs += performance.now() - start;
    }
    const start = performance.now(), internal = {}, visible = {};
    for (const output of selection.outputs) {
      const value = pointer(data, output.pointer);
      if (value === undefined) { if (output.required) throw new Error('output missing'); continue; }
      if (!ajv.validate({ type: output.type }, value)) throw new Error('output type');
      internal[output.name] = value; if (output.visibility === 'model') visible[output.name] = value;
    }
    parseProjectionMs += performance.now() - start; values.set(step.stepId, internal); completed.push({ stepId: step.stepId, outputs: visible });
  }
  return { completed, responseBytes, parseProjectionMs };
}
