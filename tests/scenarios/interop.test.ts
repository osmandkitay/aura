import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { deriveDocument, finalizeDocument } from '../../packages/aura-protocol/src';
import { toPublishedAction, toPublishedIndex } from '../../packages/aura-protocol/src/surface';
import { runPlan } from '../../packages/aura-protocol/src/runner';
// Independent consumer has no production implementation imports.
import { consume } from '../interop/minimal-consumer.mjs';
import { httpFixture } from './http-fixture';
import { ROOT } from './helpers';

describe('G6 real HTTP and independent consumption', () => {
  it('consumes identical bytes at site well-known and third-party raw subdirectory URLs', async () => {
    const f = await httpFixture();
    try {
      const remote = { ...f.plan, descriptor: f.artifactOrigin + '/raw/revision/recipes/.well-known/aura.json' };
      const siteBytes = await (await fetch(f.plan.descriptor)).text(), remoteBytes = await (await fetch(remote.descriptor)).text();
      expect(siteBytes).toBe(remoteBytes);
      f.reset(); const site = await runPlan(f.plan); const expectedRequests = structuredClone(f.traces);
      expect(site.status).toBe('success'); expect(f.artifacts).toHaveLength(4);
      f.setSiteArtifacts(false);
      expect((await fetch(f.plan.descriptor)).status).toBe(404);
      f.reset(); const thirdParty = await runPlan(remote);
      expect(thirdParty.status).toBe('success'); expect(f.traces).toEqual(expectedRequests);
      expect(f.artifacts.every(p => p.startsWith('/raw/revision/recipes/'))).toBe(true);
      f.reset(); const independent = await consume(remote);
      expect(f.traces).toEqual(expectedRequests);
      expect(independent).toEqual(site.completed.map(s => ({ stepId: s.stepId, outputs: s.outputs })));
      expect(JSON.stringify(independent)).not.toContain('local-run-secret');
      expect((await fetch(f.origin + '/openapi.json')).status).toBe(404); // Execution never needs source.
    } finally { await f.close(); }
  });
  it('publishes and executes the fully authored recipe without source OpenAPI', async () => {
    const f = await httpFixture();
    try {
      const authored = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/minimal-site/authored-aura.json'), 'utf8'));
      const oldTarget = authored.target.url;
      authored.target.url = f.origin + '/v1'; authored.publisher.url = f.artifactOrigin;
      for (const action of authored.actions) {
        expect(action.entrypoint.url.startsWith(oldTarget + '/')).toBe(true);
        action.entrypoint.url = authored.target.url + action.entrypoint.url.slice(oldTarget.length);
      }
      const document = deriveDocument(finalizeDocument(authored));
      const index = toPublishedIndex(document);
      f.serveArtifact('/authored/.well-known/aura.json', index);
      for (const action of document.actions) f.serveArtifact('/authored/.well-known/aura/actions/' + action.id + '.json', toPublishedAction(document, action));
      f.setSiteArtifacts(false);
      const plan = { ...f.plan, descriptor: f.artifactOrigin + '/authored/.well-known/aura.json' };
      const result = await runPlan(plan);
      expect(result.status).toBe('success'); expect(index.source.kind).toBe('aura-v2');
      const expected = structuredClone(f.traces); f.reset();
      expect(await consume(plan)).toEqual(result.completed.map(s => ({ stepId: s.stepId, outputs: s.outputs })));
      expect(f.traces).toEqual(expected);
    } finally { await f.close(); }
  });
  it('reports real HTTP timeout and partial completion without retry or rollback', async () => {
    const f = await httpFixture();
    try {
      f.setDelay(500);
      const timeout = await runPlan(f.plan, { timeoutMs: 150 });
      expect(timeout.status).toBe('outcome-unknown'); expect(timeout.completed.map(s => s.stepId)).toEqual(['login']);
      expect(f.traces.filter(t => t.url === '/v1/posts')).toHaveLength(1);
      f.setDelay(0); f.setReject(true); f.reset();
      const rejected = await runPlan(f.plan);
      expect(rejected.status).toBe('partial'); expect(rejected.completed.map(s => s.stepId)).toEqual(['login', 'draftA']);
      expect(rejected.failure).toMatchObject({ status: 'blocked', httpStatus: 403 });
      expect(f.traces).toHaveLength(3);
    } finally { await f.close(); }
  });
});
