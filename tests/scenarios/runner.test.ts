import { describe, expect, it } from 'vitest';
import { deriveDocument } from '../../packages/aura-protocol/src';
import { buildRequest, preparePlan, projectOutputs, runPlan } from '../../packages/aura-protocol/src/runner';
import { fixture } from './contract-fixture';
import { json, runnerFixture } from './runner-fixture';

describe('G4 deterministic execution', () => {
  it('pipes login/create/publish with no model round trip or credential/raw response disclosure', async () => {
    const f = runnerFixture(), result = await runPlan(f.plan, { fetch: f.fetcher });
    expect(result.status).toBe('success');
    expect(f.calls.map(c => [c.init?.method, c.url, c.init?.body])).toEqual([
      ['POST', 'https://api.example/v1/login', '{"password":"caller-secret"}'],
      ['POST', 'https://api.example/v1/posts', '{"title":"A"}'],
      ['POST', 'https://api.example/v1/posts/draft-1/publish', undefined]
    ]);
    expect(f.calls[1].init?.headers).toMatchObject({ authorization: 'Bearer run-only-token', 'content-type': 'application/json' });
    expect(result.completed.map(s => s.outputs)).toEqual([{}, { created_id: 'draft-1' }, {}]);
    expect(JSON.stringify(result)).not.toMatch(/run-only-token|caller-secret|padding|xxx/);
    expect(result.metrics).toMatchObject({ descriptorGets: 1, detailGets: 3, apiCalls: 3, intermediateLlmCalls: 0 });
    expect(f.artifacts).toHaveLength(4); expect(f.artifacts.some(u => u.includes('list.json'))).toBe(false);
    expect(result.metrics.responseBytes).toBeGreaterThan(50 * 1024);
  });
  it('keeps repeated action invocations separate and loads each detail once', async () => {
    const f = runnerFixture();
    f.plan.steps.splice(2, 0, { ...structuredClone(f.plan.steps[1]), stepId: 'draftB' });
    const result = await runPlan(f.plan, { fetch: f.fetcher });
    expect(result.status).toBe('success'); expect(f.calls[3].url).toContain('/draft-1/publish');
    expect(result.completed[2].outputs).toEqual({ created_id: 'draft-2' });
    expect(f.artifacts).toHaveLength(4);
  });
  it.each(['duplicate', 'forward', 'unknown-output', 'type', 'overlap', 'required', 'literal', 'unknown-action'])('rejects %s before the first API call', async kind => {
    const f = runnerFixture(), step = f.plan.steps[1];
    if (kind === 'duplicate') step.stepId = 'login';
    if (kind === 'forward') (step.inputs[1] as any).from.step = 'publishA';
    if (kind === 'unknown-output') (step.inputs[1] as any).from.output = 'absent';
    if (kind === 'type') step.inputs[0] = { target: '/body', from: { step: 'login', output: 'token' } };
    if (kind === 'overlap') step.inputs.push({ target: '/body/title', value: 'conflict' });
    if (kind === 'required') step.inputs.splice(0, 1);
    if (kind === 'literal') step.inputs[0] = { target: '/body', value: {} };
    if (kind === 'unknown-action') step.actionId = 'absent';
    await expect(preparePlan(f.plan, { fetch: f.fetcher })).rejects.toThrow(); expect(f.calls).toHaveLength(0);
  });
  it.each(['missing', 'wrong-type', 'wrong-media', 'bad-json'])('stops downstream writes after %s output', async kind => {
    const f = runnerFixture();
    const fetcher: typeof fetch = async (url, init) => {
      if (String(url).endsWith('/v1/posts')) {
        f.calls.push({ url: String(url), init });
        if (kind === 'wrong-media') return new Response('{}', { status: 201, headers: { 'content-type': 'text/plain' } });
        if (kind === 'bad-json') return new Response('{', { status: 201, headers: { 'content-type': 'application/json' } });
        return json(kind === 'missing' ? {} : { id: 42 }, 201);
      }
      return f.fetcher(url, init);
    };
    const result = await runPlan(f.plan, { fetch: fetcher });
    expect(result.status).toBe('partial'); expect(result.completed).toHaveLength(1);
    expect(result.failure?.status).toBe('failed'); expect(f.calls).toHaveLength(2);
  });
  it('preserves false, zero, empty, null and escaped/array pointers', () => {
    const outputs: any[] = [
      ['false', '/flag', 'boolean'], ['zero', '/count', 'integer'], ['empty', '/name', 'string'], ['nil', '/nil', ['string', 'null']], ['escaped', '/a~1b/~0/0', 'string']
    ].map(([name, pointer, type]) => ({ name, pointer, type, source: 'body', required: true, visibility: 'model' }));
    expect(projectOutputs(outputs, { flag: false, count: 0, name: '', nil: null, 'a/b': { '~': ['yes'] } }).visible)
      .toEqual({ false: false, zero: 0, empty: '', nil: null, escaped: 'yes' });
    expect(() => projectOutputs(outputs, { flag: false })).toThrow(/OUTPUT_MISSING/);
    expect(() => projectOutputs([outputs[0]], { flag: 'false' })).toThrow(/OUTPUT_TYPE/);
    expect(projectOutputs([{ ...outputs[0], pointer: '', required: false }], undefined).visible).toEqual({});
    expect(() => projectOutputs([{ ...outputs[4], pointer: '/a~1b/~0/01' }], { 'a/b': { '~': ['yes', 'no'] } })).toThrow(/OUTPUT_MISSING/);
  });
  it('keeps optional body separate and encodes all four HTTP namespaces correctly', () => {
    const { source, config } = fixture(); config.actions = [{ id: 'test', key: 'test.call', risk: 'medium', method: 'POST', path: '/items/{id}', outputs: [] }];
    source.paths['/items/{id}'] = { post: { servers: [{ url: 'https://api.example/v2' }], parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
      { in: 'query', name: 'id', schema: { type: 'integer' } }, { in: 'header', name: 'id', schema: { type: 'boolean' } }],
      requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } } } }, responses: { '204': { description: 'done' } } } };
    const action = deriveDocument(source, config).actions[0];
    expect(buildRequest(action, { path: { id: 'a/b ?' }, query: { id: 7 }, header: { id: false }, body: { id: 'body' } })).toEqual({
      method: 'POST', url: 'https://api.example/v2/items/a%2Fb%20%3F?id=7', headers: { id: 'false', 'content-type': 'application/json' }, body: '{"id":"body"}'
    });
    expect(buildRequest(action, { path: { id: 'x' } })).not.toHaveProperty('body');
    expect(() => buildRequest(action, { path: { id: 'x' }, body: {} })).toThrow(/INPUT_INVALID/);
  });
  it('refuses mixed revisions and missing detail files before API writes', async () => {
    for (const kind of ['revision', 'missing']) {
      const f = runnerFixture(); f.details.create.revision = '0'.repeat(64);
      const fetcher: typeof fetch = async (url, init) => kind === 'missing' && String(url).endsWith('/create.json') ? new Response(null, { status: 404 }) : f.fetcher(url, init);
      await expect(runPlan(f.plan, { fetch: fetcher })).rejects.toThrow(); expect(f.calls).toHaveLength(0);
    }
  });
  it('retains earlier completion on HTTP rejection, and never retries an uncertain mutation', async () => {
    for (const kind of ['rejected', 'timeout']) {
      const f = runnerFixture();
      const fetcher: typeof fetch = async (url, init) => {
        if (String(url).endsWith('/publish') || (kind === 'timeout' && String(url).endsWith('/v1/posts'))) {
          f.calls.push({ url: String(url), init });
          if (kind === 'timeout') throw new DOMException('timed out', 'TimeoutError');
          return json({ private: 'do not print' }, 403);
        }
        return f.fetcher(url, init);
      };
      const result = await runPlan(f.plan, { fetch: fetcher });
      expect(result.status).toBe(kind === 'timeout' ? 'outcome-unknown' : 'partial');
      expect(result.completed).toHaveLength(kind === 'timeout' ? 1 : 2);
      expect(result.failure?.status).toBe(kind === 'timeout' ? 'outcome-unknown' : 'blocked');
      expect(f.calls).toHaveLength(kind === 'timeout' ? 2 : 3);
      expect(JSON.stringify(result)).not.toContain('do not print');
    }
  });
  it('retains a known HTTP rejection if response-body cleanup fails', async () => {
    const f = runnerFixture();
    const fetcher: typeof fetch = async (url, init) => {
      if (String(url).endsWith('/v1/login')) {
        f.calls.push({ url: String(url), init });
        return new Response(new ReadableStream({ cancel() { throw new Error('cleanup failed'); } }), { status: 401 });
      }
      return f.fetcher(url, init);
    };
    const result = await runPlan(f.plan, { fetch: fetcher });
    expect(result.status).toBe('blocked');
    expect(result.failure).toMatchObject({ code: 'HTTP_STATUS', status: 'blocked', httpStatus: 401 });
    expect(f.calls).toHaveLength(1);
  });
});
