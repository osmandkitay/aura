import { describe, expect, it } from 'vitest';
import { encodeState, parseState, runPlan, stateFor } from '../../packages/aura-protocol/src/runner';
import { json, runnerFixture } from './runner-fixture';

describe('G5 optional response-scoped State', () => {
  it('round trips the exact v2 wire profile and keeps omitted ids unknown', () => {
    const f = runnerFixture();
    const header = encodeState({ version: 2, revision: f.index.revision, actions: [{ id: 'create', availability: 'blocked', reason: 'authentication-required', resolve: 'login' }] });
    expect(header).toMatch(/^v=2;data=[A-Za-z0-9_-]+$/);
    const state = parseState(header, f.index);
    expect(stateFor(state, 'create')).toEqual({ availability: 'blocked', reason: 'authentication-required', resolve: 'login' });
    expect(stateFor(state, 'publish')).toEqual({ availability: 'unknown' });
    expect(stateFor(parseState(null, f.index), 'create')).toEqual({ availability: 'unknown' });
  });
  it.each(['malformed', 'oversized', 'stale', 'duplicate', 'unknown', 'resolver', 'wrong-version', 'invalid-base64'])('ignores %s observations without corrupting successful HTTP', async kind => {
    const f = runnerFixture();
    let payload: any = { version: 2, revision: f.index.revision, actions: [{ id: 'create', availability: 'available' }] };
    if (kind === 'stale') payload.revision = '0'.repeat(64);
    if (kind === 'duplicate') payload.actions.push(payload.actions[0]);
    if (kind === 'unknown') payload.actions[0].id = 'absent';
    if (kind === 'resolver') payload.actions[0].resolve = 'session.login';
    if (kind === 'wrong-version') payload.version = 1;
    let header = 'v=2;data=' + Buffer.from(JSON.stringify(payload)).toString('base64url');
    if (kind === 'malformed') header = 'not-state';
    if (kind === 'oversized') header += 'a'.repeat(4096);
    if (kind === 'invalid-base64') header += '=';
    expect(parseState(header, f.index).diagnostic).toMatch(/^STATE_/);
    const fetcher: typeof fetch = async (url, init) => {
      const response = await f.fetcher(url, init);
      if (String(url).includes('api.example')) response.headers.set('aura-state', header);
      return response;
    };
    const result = await runPlan(f.plan, { fetch: fetcher });
    expect(result.status).toBe('success'); expect(result.completed[0].diagnostic).toMatch(/^STATE_/);
    expect(result.completed[0].state).toEqual({ availability: 'unknown' });
  });
  it.each([401, 403, 429])('reports %s and a valid resolver without inserting login or retrying mutations', async status => {
    const f = runnerFixture();
    const header = encodeState({ version: 2, revision: f.index.revision, actions: [{ id: 'create', availability: 'blocked', reason: 'blocked-in-this-response', resolve: 'login' }] });
    const fetcher: typeof fetch = async (url, init) => {
      if (String(url).endsWith('/v1/posts')) { f.calls.push({ url: String(url), init }); return json({ secret: 'not visible' }, status, { 'aura-state': header }); }
      return f.fetcher(url, init);
    };
    const result = await runPlan(f.plan, { fetch: fetcher });
    expect(result.status).toBe('partial'); expect(result.failure).toMatchObject({ status: 'blocked', httpStatus: status, resolve: 'login' });
    expect(f.calls).toHaveLength(2); expect(result.completed).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('not visible');
  });
  it('does not reinterpret State as authority when HTTP succeeds', async () => {
    const f = runnerFixture();
    const fetcher: typeof fetch = async (url, init) => {
      const response = await f.fetcher(url, init);
      if (String(url).endsWith('/v1/posts')) response.headers.set('aura-state', encodeState({ version: 2, revision: f.index.revision, actions: [{ id: 'publish', availability: 'blocked', resolve: 'login' }] }));
      return response;
    };
    expect((await runPlan(f.plan, { fetch: fetcher })).status).toBe('success');
    expect(f.calls).toHaveLength(3);
  });
});
