import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../schema');
const profile = JSON.parse(fs.readFileSync(path.join(directory, '../package.json'), 'utf8')).version;
const base = `https://raw.githubusercontent.com/osmandkitay/aura/v${profile}/packages/aura-protocol/schema`;
const string = { type: 'string', minLength: 1 };
const reserved = '[Cc][Oo][Nn]|[Pp][Rr][Nn]|[Aa][Uu][Xx]|[Nn][Uu][Ll]|[Cc][Oo][Mm][1-9]|[Ll][Pp][Tt][1-9]';
const id = { ...string, pattern: `^(?!(?:${reserved})(?:\\.|$))[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9_-])?$` };
const key = { ...string, pattern: '^[a-z0-9]+(?:\\.[a-z0-9]+)+$' };
const pointer = { type: 'string', pattern: '^(?:/(?:[^~]|~[01])*)*$' };
const url = { ...string, pattern: '^https?://' };
const revision = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const method = { enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] };
const risk = { enum: ['low', 'medium', 'high'] };
const types = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];
const valueType = { oneOf: [{ enum: types }, { type: 'array', minItems: 2, maxItems: 2,
  uniqueItems: true, contains: { const: 'null' }, items: { enum: types } }] };
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, required, properties });
const array = (items, extra = {}) => ({ type: 'array', items, ...extra });
const ref = name => ({ $ref: `#/$defs/${name}` });
const ids = array(id, { uniqueItems: true });
const publisher = object({ name: string, url, role: { enum: ['site-owner', 'third-party'] } });
const source = object({ kind: { enum: ['openapi', 'aura-v2'] }, url, version: string });
const target = object({ url });
const output = object({ name: id, source: { const: 'body' }, pointer, type: valueType,
  required: { type: 'boolean' }, visibility: { enum: ['model', 'credential'] } });
const error = object({ status: { type: 'integer', minimum: 300, maximum: 599 },
  reason: { ...string, maxLength: 160, pattern: '^[ -~]+$' }, resolve: id }, ['status']);
const common = { id, key, risk, title: string, outputs: array(output), requires: ids, errors: array(error) };
const binding = {
  oneOf: [
    object({ input: pointer, in: { const: 'body' }, target: { const: '' } }),
    object({ input: pointer, in: { enum: ['path', 'query', 'header'] }, name: string,
      style: { enum: ['simple', 'form'] }, explode: { type: 'boolean' }, prefix: { const: 'Bearer ' } },
    ['input', 'in', 'name', 'style', 'explode'])
  ]
};
const auth = { oneOf: [object({ kind: { const: 'none' } }), object({ kind: { enum: ['bearer', 'api-key'] }, input: pointer, name: string })] };
const runtime = { anyOf: [ { type: 'boolean' }, object({
  type: valueType, properties: { type: 'object', propertyNames: { not: { const: '__proto__' } }, additionalProperties: ref('runtime') },
  required: array({ type: 'string' }, { uniqueItems: true }), additionalProperties: ref('runtime'),
  items: ref('runtime'), enum: array({}, { minItems: 1, uniqueItems: true }), const: {},
  title: { type: 'string' }, description: { type: 'string' }, default: {}, examples: array({}),
  minimum: { type: 'number' }, maximum: { type: 'number' }, exclusiveMinimum: { type: 'number' },
  exclusiveMaximum: { type: 'number' }, multipleOf: { type: 'number', exclusiveMinimum: 0 },
  minLength: { type: 'integer', minimum: 0 }, maxLength: { type: 'integer', minimum: 0 }, pattern: { type: 'string' },
  minItems: { type: 'integer', minimum: 0 }, maxItems: { type: 'integer', minimum: 0 }, uniqueItems: { type: 'boolean' },
  minProperties: { type: 'integer', minimum: 0 }, maxProperties: { type: 'integer', minimum: 0 }
}, ['type']) ] };
const success = { oneOf: [object({ status: { type: 'integer', minimum: 200, maximum: 299 }, contentType: { const: null } }),
  object({ status: { type: 'integer', minimum: 200, maximum: 299, not: { const: 204 } }, contentType: { const: 'application/json' }, schema: ref('runtime') })] };
const action = object({ ...common,
  entrypoint: object({ method, url, encoding: { enum: ['json', 'none'] } }),
  input: ref('runtime'), bindings: array(binding), auth, success: array(success, { minItems: 1 }),
  origin: object({ source: { enum: ['openapi', 'aura-v2'] }, ref: string, operationId: string, summary: { type: 'string' } }, ['source', 'ref']),
  aliases: array(string, { uniqueItems: true })
}, ['id', 'key', 'risk', 'entrypoint', 'input', 'bindings', 'auth', 'success', 'outputs', 'origin']);
const envelope = { profile: { const: profile }, revision, publisher, source, target };
const protocol = { protocol: { const: 'AURA' }, version: { const: '2.0' } };
const schemaId = name => ({ const: `${base}/aura-${name}.schema.json` });
const signature = object({ name: { type: 'string' }, type: valueType, required: { type: 'boolean' } });
const assignment = object({ target: pointer, value: {}, from: object({ step: id, output: id }) }, ['target']);
assignment.oneOf = [{ required: ['value'], not: { required: ['from'] } }, { required: ['from'], not: { required: ['value'] } }];
const schemas = {
  v2: object({ $schema: schemaId('v2'), ...protocol, ...envelope, actions: array(ref('action'), { minItems: 1 }) }),
  action: object({ $schema: schemaId('action'), ...envelope, ...action.properties }, ['$schema', ...Object.keys(envelope), ...action.required]),
  publish: object({ $schema: schemaId('publish'), ...protocol, ...envelope,
    actions: array(object({ id, key, href: { type: 'string', pattern: '^aura/actions/[A-Za-z0-9._-]+\\.json$' },
      inputs: array(signature), outputs: array(signature), requires: ids }, ['id', 'key', 'href', 'inputs', 'outputs']), { minItems: 1 }) }),
  config: object({ $schema: schemaId('config'), publisher, source: object({ url, version: string }), target,
    actions: array(object({ ...common, method, path: { ...string, pattern: '^/' } }, ['id', 'key', 'risk', 'method', 'path', 'outputs']), { minItems: 1 }) }),
  plan: object({ $schema: schemaId('plan'), profile: { const: profile }, descriptor: url, revision,
    steps: array(object({ stepId: id, actionId: id, inputs: array(assignment) }), { minItems: 1 }) }, ['$schema', 'profile', 'descriptor', 'steps']),
  state: object({ version: { const: 2 }, revision,
    actions: array(object({ id, availability: { enum: ['available', 'blocked'] }, reason: error.properties.reason, resolve: id }, ['id', 'availability'])) })
};
for (const [name, body] of Object.entries(schemas)) {
  const schema = { $schema: 'http://json-schema.org/draft-07/schema#', $id: `${base}/aura-${name}.schema.json`, ...body };
  if (name === 'v2') schema.$defs = { runtime, action };
  if (name === 'action') schema.$defs = { runtime };
  const file = path.join(directory, `aura-${name}.schema.json`);
  const bytes = JSON.stringify(schema, null, 2) + '\n';
  if (process.argv.includes('--check')) {
    if (fs.readFileSync(file, 'utf8') !== bytes) throw new Error(`Generated schema drift: ${name}`);
  } else fs.writeFileSync(file, bytes);
}
