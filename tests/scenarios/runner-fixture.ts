import { AURA_PLAN_SCHEMA_URL, AURA_PROFILE, deriveDocument, type Plan } from '../../packages/aura-protocol/src';
import { toPublishedAction, toPublishedIndex } from '../../packages/aura-protocol/src/surface';
import { fixture } from './contract-fixture';

export function runnerFixture() {
  const { source, config } = fixture(), document = deriveDocument(source, config);
  const descriptor = 'https://recipes.example/raw/subdirectory/.well-known/aura.json';
  const index = toPublishedIndex(document);
  const details = Object.fromEntries(document.actions.map(action => [action.id, toPublishedAction(document, action)]));
  const plan: Plan = { $schema: AURA_PLAN_SCHEMA_URL, profile: AURA_PROFILE, descriptor, steps: [
    { stepId: 'login', actionId: 'login', inputs: [{ target: '/body', value: { password: 'caller-secret' } }] },
    { stepId: 'draftA', actionId: 'create', inputs: [{ target: '/body', value: { title: 'A' } }, { target: '/header/Authorization', from: { step: 'login', output: 'token' } }] },
    { stepId: 'publishA', actionId: 'publish', inputs: [{ target: '/path/id', from: { step: 'draftA', output: 'created_id' } }, { target: '/header/Authorization', from: { step: 'login', output: 'token' } }] }
  ] };
  const calls: { url: string; init?: RequestInit }[] = [], artifacts: string[] = [];
  let createCount = 0;
  const api = (url: string, init?: RequestInit): Response => {
    calls.push({ url, init });
    if (url.endsWith('/login')) return json({ token: 'run-only-token' });
    if (url.endsWith('/posts')) return json({ id: 'draft-' + (++createCount), padding: 'x'.repeat(50 * 1024) }, 201);
    return new Response(null, { status: 204 });
  };
  const fetcher = async (url: any, init?: RequestInit): Promise<Response> => {
    if (String(url).startsWith('https://recipes.example/')) {
      artifacts.push(String(url));
      if (String(url) === descriptor) return json(index);
      const id = String(url).split('/').pop()!.replace(/\.json$/, '');
      return details[id] ? json(details[id]) : new Response(null, { status: 404 });
    }
    return api(String(url), init);
  };
  return { source, config, document, index, details, plan, calls, artifacts, fetcher, api };
}
export function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
}
