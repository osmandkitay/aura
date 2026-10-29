import { expect, it } from 'vitest';
import { deriveDocument } from '../../packages/aura-protocol/src';
import { runPlan } from '../../packages/aura-protocol/src/runner';
import { toPublishedAction, toPublishedIndex } from '../../packages/aura-protocol/src/surface';
import { fixture } from './contract-fixture';
import { json, runnerFixture } from './runner-fixture';

it('rejects depth, node and serialized size expansion limits explicitly', () => {
  for (const kind of ['depth', 'nodes', 'bytes']) {
    const { source, config } = fixture(); config.actions = [config.actions[1]]; delete config.actions[0].requires; delete config.actions[0].errors;
    let schema: any = { type: 'string' };
    if (kind === 'depth') for (let i = 0; i < 66; i++) schema = { type: 'array', items: schema };
    if (kind === 'nodes') schema = { type: 'object', properties: Object.fromEntries(Array.from({ length: 10001 }, (_, i) => ['p' + i, { type: 'string' }])) };
    if (kind === 'bytes') schema.description = 'x'.repeat(1024 * 1024);
    source.components.schemas.Draft = schema;
    expect(() => deriveDocument(source, config)).toThrow(/(?:SCHEMA_DEPTH|SCHEMA_NODES|ACTION_SIZE).*source=.*config=/);
  }
});

it('distinguishes numeric object keys from arrays when assembling nested plan assignments', async () => {
  for (const array of [false, true]) {
    const f = runnerFixture();
    const schema = array ? { type: 'array', minItems: 1, items: { type: 'string' } } : { type: 'object', required: ['0'], properties: { '0': { type: 'string' } }, additionalProperties: false };
    f.source.components.schemas.Draft = schema;
    const document = deriveDocument(f.source, f.config), index = toPublishedIndex(document);
    const details = Object.fromEntries(document.actions.map(a => [a.id, toPublishedAction(document, a)]));
    f.plan.steps[1].inputs[0] = { target: '/body/0', value: 'numeric-field' };
    const fetcher: typeof fetch = async (url, init) => {
      const text = String(url);
      if (text === f.plan.descriptor) return json(index);
      if (text.startsWith('https://recipes.example/')) return json(details[text.split('/').pop()!.replace('.json', '')]);
      return f.fetcher(url, init);
    };
    const result = await runPlan(f.plan, { fetch: fetcher });
    expect(result.status).toBe('success');
    expect(JSON.parse(f.calls[1].init!.body as string)).toEqual(array ? ['numeric-field'] : { '0': 'numeric-field' });
  }
});

it('rejects Ajv-excluded schema properties and preserves supported constructor fields as own data', async () => {
  const f = runnerFixture();
  f.source.components.schemas.Draft = JSON.parse('{"type":"object","required":["__proto__"],"properties":{"__proto__":{"type":"string"}},"additionalProperties":false}');
  expect(() => deriveDocument(f.source, f.config)).toThrow(/SCHEMA_PROPERTY/);
  f.source.components.schemas.Draft = { type: 'object', required: ['constructor'], properties: { constructor: { type: 'string' } }, additionalProperties: false };
  const document = deriveDocument(f.source, f.config), index = toPublishedIndex(document);
  const details = Object.fromEntries(document.actions.map(a => [a.id, toPublishedAction(document, a)]));
  f.plan.steps[1].inputs[0] = { target: '/body/constructor', value: 'data' };
  const fetcher: typeof fetch = async (url, init) => {
    const text = String(url);
    if (text === f.plan.descriptor) return json(index);
    if (text.startsWith('https://recipes.example/')) return json(details[text.split('/').pop()!.replace('.json', '')]);
    return f.fetcher(url, init);
  };
  expect((await runPlan(f.plan, { fetch: fetcher })).status).toBe('success');
  expect(JSON.parse(f.calls[1].init!.body as string)).toEqual({ constructor: 'data' });
  expect(Object.getPrototypeOf({})).toBe(Object.prototype);
});

it('rejects known invalid wire values before login and never treats header casing as separate targets', async () => {
  const f = runnerFixture(); f.plan.steps[2].inputs[0] = { target: '/path/id', value: '..' };
  await expect(runPlan(f.plan, { fetch: f.fetcher })).rejects.toThrow(/PATH_DOT_SEGMENT/); expect(f.calls).toHaveLength(0);
  const { source, config } = fixture(); config.actions = [config.actions[3]];
  source.paths['/posts'].get.parameters = [{ in: 'header', name: 'ID', schema: { type: 'string' } }, { in: 'header', name: 'id', schema: { type: 'string' } }];
  expect(() => deriveDocument(source, config)).toThrow(/PARAMETER_DUPLICATE/);
});

it('rejects nonportable filenames at declaration time', () => {
  const { source, config } = fixture(); config.actions[0].id = 'CON.action';
  expect(() => deriveDocument(source, config)).toThrow(/CONFIG/);
});
