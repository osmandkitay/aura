import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { deriveDocument, validatePlan, validatePublishedAction, type Output } from '../../packages/aura-protocol/src';
import { buildRequest, encodeState, projectOutputs, runPlan } from '../../packages/aura-protocol/src/runner';
import { fixture } from './contract-fixture';
import { runnerFixture } from './runner-fixture';
import { ROOT } from './helpers';
const Ajv = createRequire(path.join(ROOT, 'packages/aura-protocol/package.json'))('ajv');

it.each([
  ['integer', '9007199254740993'], ['number', '-9007199254740993'], ['number', '1e400']
])('stops an unsupported %s response (%s) before reusing its ID', async (type, token) => {
  const f = runnerFixture((source, config) => {
    source.components.schemas.Created.properties.id = { type };
    source.components.parameters.ID.schema = { type };
    config.actions[1].outputs[0].type = type as 'integer' | 'number';
  });
  const fetcher: typeof fetch = async (url, init) => {
    if (String(url).endsWith('/v1/posts')) {
      f.calls.push({ url: String(url), init });
      return new Response('{"id":' + token + '}', { status: 201, headers: { 'content-type': 'application/json' } });
    }
    return f.fetcher(url, init);
  };
  const result = await runPlan(f.plan, { fetch: fetcher });
  expect(result.failure?.code).toBe('NUMBER_UNSUPPORTED');
  expect(result.status).toBe('partial');
  expect(result.completed).toHaveLength(1);
  expect(f.calls).toHaveLength(2);
  expect(JSON.stringify(result)).not.toMatch(/900719925474099[23]/);
});

it('rejects overlapping visibility at declaration, artifact and direct projection boundaries', () => {
  const { source, config } = fixture();
  const credential = config.actions[0].outputs[0];
  const login = runnerFixture().details.login;
  for (const outputs of [
    [credential, { ...credential, name: 'response', pointer: '', type: 'object' as const, visibility: 'model' as const }],
    [credential, { ...credential, name: 'alias', visibility: 'model' as const }],
    [{ ...credential, pointer: '', type: 'object' as const }, { ...credential, name: 'child', visibility: 'model' as const }]
  ]) {
    config.actions[0].outputs = outputs;
    expect(() => deriveDocument(source, config)).toThrow(/visibility/i);
    expect(validatePublishedAction({ ...login, outputs }).valid).toBe(false);
    expect(() => projectOutputs(outputs, { token: 'private-token' })).toThrow(/OUTPUT_VISIBILITY/);
  }
  const siblings = [credential, { ...credential, name: 'public', pointer: '/tokens', visibility: 'model' as const }];
  expect(projectOutputs(siblings, { token: 'private-token', tokens: 'safe' }).visible).toEqual({ public: 'safe' });
});

it('rejects encoded placeholders consistently before constructing or executing a request', async () => {
  const f = runnerFixture();
  const action = f.details.publish;
  action.entrypoint.url = action.entrypoint.url.replace('{id}', '%7Bid%7D');
  expect(validatePublishedAction(action).valid).toBe(false);
  expect(() => buildRequest(action, { path: { id: 'selected-id' }, header: { Authorization: 'token' } })).toThrow(/PATH_TEMPLATE/);
  await expect(runPlan(f.plan, { fetch: f.fetcher })).rejects.toThrow(/ACTION_INVALID/);
  expect(f.calls).toHaveLength(0);
  // Encoded braces can still be literal path data alongside a real placeholder.
  action.entrypoint.url = 'https://api.example/v1/%7Bliteral%7D/{id}/publish';
  expect(validatePublishedAction(action).errors).toEqual([]);
  expect(buildRequest(action, { path: { id: 'a/b' }, header: { Authorization: 'token' } }).url)
    .toBe('https://api.example/v1/%7Bliteral%7D/a%2Fb/publish');
});

it('rejects nested unsupported numbers even under open schemas and in plan literals', async () => {
  const f = runnerFixture((source) => { source.components.schemas.Draft.additionalProperties = true; });
  const output = { name: 'data', source: 'body' as const, pointer: '', type: 'object' as const, required: true, visibility: 'model' as const };
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/aura-protocol/schema/aura-plan.schema.json'), 'utf8'));
  const external = new Ajv({ strict: false, strictNumbers: true }).compile(schema);
  for (const value of [Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, -Infinity]) {
    const body = { title: 'valid', metadata: [{ id: value }] };
    f.plan.steps[1].inputs[0] = { target: '/body', value: body };
    expect(validatePlan(f.plan).valid).toBe(false);
    expect(external(f.plan)).toBe(false);
    await expect(runPlan(f.plan, { fetch: f.fetcher })).rejects.toThrow(/NUMBER_UNSUPPORTED/);
    expect(() => buildRequest(f.details.create, { body, header: { Authorization: 'token' } })).toThrow(/NUMBER_UNSUPPORTED/);
    expect(() => projectOutputs([output], body)).toThrow(/NUMBER_UNSUPPORTED/);
  }
  expect(f.artifacts).toHaveLength(0); expect(f.calls).toHaveLength(0);
  f.source.components.schemas.Draft.properties.title.default = Number.MAX_SAFE_INTEGER + 1;
  expect(() => deriveDocument(f.source, f.config)).toThrow(/NUMBER_UNSUPPORTED.*source=.*default.*config=/);
});

it('preserves safe integer boundaries, fractional numbers and large string IDs', () => {
  const f = runnerFixture();
  for (const value of [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 0.5, '9007199254740993']) {
    const type = typeof value === 'number' ? 'number' : 'string';
    const output: Output = { name: 'id', source: 'body', pointer: '/id', type, required: true, visibility: 'model' };
    expect(projectOutputs([output], { id: value }).visible).toEqual({ id: value });
    const action = structuredClone(f.details.publish);
    (action.input as any).properties.path.properties.id = { type };
    expect(buildRequest(action, { path: { id: value }, header: { Authorization: 'token' } }).url)
      .toBe('https://api.example/v1/posts/' + String(value) + '/publish');
  }
});

it('retains observations for other actions on the response that supplied them', async () => {
  const f = runnerFixture();
  const actions = [{ id: 'list', availability: 'available' as const },
    { id: 'publish', availability: 'blocked' as const, reason: 'this-response', resolve: 'login' }];
  const fetcher: typeof fetch = async (url, init) => {
    const response = await f.fetcher(url, init);
    if (String(url).endsWith('/v1/posts')) response.headers.set('aura-state', encodeState({ version: 2, revision: f.index.revision, actions }));
    return response;
  };
  const result = await runPlan(f.plan, { fetch: fetcher });
  expect(result.status).toBe('success');
  expect(result.completed[1].state).toEqual({ actions });
  expect(result.completed[2].state).toEqual({ actions: [] });
  expect(f.calls).toHaveLength(3);
});
