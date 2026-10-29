import http from 'node:http';
import { once } from 'node:events';
import { deriveDocument } from '../../packages/aura-protocol/src';
import { toPublishedAction, toPublishedIndex } from '../../packages/aura-protocol/src/surface';
import { AURA_PLAN_SCHEMA_URL, AURA_PROFILE, type Plan } from '../../packages/aura-protocol/src';
import { fixture } from './contract-fixture';

export async function httpFixture() {
  const traces: { method: string; url: string; headers: Record<string, string | undefined>; body?: unknown }[] = [];
  const artifacts: string[] = [];
  let content: Map<string, string>, nextId = 0;
  let delayCreateMs = 0, rejectPublish = false, siteArtifacts = true;
  function staticResponse(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const route = req.url!.replace(/^\/raw\/revision\/recipes/, '');
    const bytes = content?.get(route);
    if (!bytes) return false;
    artifacts.push(req.url!); res.writeHead(200, { 'content-type': 'application/json' }); res.end(bytes); return true;
  }
  const api = http.createServer(async (req, res) => {
    if (siteArtifacts && staticResponse(req, res)) return;
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    traces.push({ method: req.method!, url: req.url!, headers: { authorization: req.headers.authorization, 'content-type': req.headers['content-type'], accept: req.headers.accept }, ...(raw ? { body: JSON.parse(raw) } : {}) });
    const json = (value: unknown, status: number) => { if (!res.destroyed) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); } };
    if (req.url === '/v1/login' && req.method === 'POST') return json({ token: 'local-run-secret' }, 200);
    if (req.url === '/v1/posts' && req.method === 'POST') {
      if (req.headers.authorization !== 'Bearer local-run-secret') return json({}, 401);
      const id = 'draft-' + (++nextId);
      if (delayCreateMs) setTimeout(() => json({ id, padding: 'x'.repeat(50 * 1024) }, 201), delayCreateMs).unref();
      else json({ id, padding: 'x'.repeat(50 * 1024) }, 201);
      return;
    }
    if (/^\/v1\/posts\/[^/]+\/publish$/.test(req.url!) && req.method === 'POST') {
      if (rejectPublish) return json({}, 403);
      res.writeHead(204); res.end(); return;
    }
    json({}, 404);
  });
  const staticHost = http.createServer((req, res) => { if (!staticResponse(req, res)) { res.writeHead(404); res.end(); } });
  api.listen(0, '127.0.0.1'); await once(api, 'listening');
  staticHost.listen(0, '127.0.0.1'); await once(staticHost, 'listening');
  const origin = 'http://127.0.0.1:' + (api.address() as any).port;
  const artifactOrigin = 'http://127.0.0.1:' + (staticHost.address() as any).port;
  const { source, config } = fixture();
  source.servers[0].url = origin + '/v1'; config.target.url = origin + '/v1';
  config.source.url = origin + '/openapi.json'; config.publisher.url = artifactOrigin;
  const document = deriveDocument(source, config), index = toPublishedIndex(document);
  content = new Map([['/.well-known/aura.json', JSON.stringify(index)], ...document.actions.map(action => ['/.well-known/aura/actions/' + action.id + '.json', JSON.stringify(toPublishedAction(document, action))] as [string, string])]);
  const plan: Plan = { $schema: AURA_PLAN_SCHEMA_URL, profile: AURA_PROFILE, descriptor: origin + '/.well-known/aura.json', steps: [
    { stepId: 'login', actionId: 'login', inputs: [{ target: '/body', value: { password: 'caller-provided' } }] },
    { stepId: 'draftA', actionId: 'create', inputs: [{ target: '/body', value: { title: 'A' } }, { target: '/header/Authorization', from: { step: 'login', output: 'token' } }] },
    { stepId: 'publishA', actionId: 'publish', inputs: [{ target: '/path/id', from: { step: 'draftA', output: 'created_id' } }, { target: '/header/Authorization', from: { step: 'login', output: 'token' } }] }
  ] };
  return { origin, artifactOrigin, source, config, document, index, plan, traces, artifacts,
    serveArtifact(route: string, value: unknown) { content.set(route, JSON.stringify(value)); },
    reset() { traces.length = 0; artifacts.length = 0; nextId = 0; },
    setDelay(ms: number) { delayCreateMs = ms; }, setReject(value: boolean) { rejectPublish = value; },
    setSiteArtifacts(value: boolean) { siteArtifacts = value; },
    async close() { api.closeAllConnections(); staticHost.closeAllConnections(); await Promise.all([new Promise<void>(resolve => api.close(() => resolve())), new Promise<void>(resolve => staticHost.close(() => resolve()))]); }
  };
}
