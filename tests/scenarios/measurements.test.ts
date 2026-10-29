import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { deriveDocument } from '../../packages/aura-protocol/src';
import { preparePlan, runPlan, executePlan } from '../../packages/aura-protocol/src/runner';
import { toPublishedAction, toPublishedIndex } from '../../packages/aura-protocol/src/surface';
import { runOpenApi } from '../interop/openapi-consumer.mjs';
import { fixture } from './contract-fixture';
import { httpFixture } from './http-fixture';
import { ROOT } from './helpers';
import { execFileSync } from 'node:child_process';

it('records real costs against full and trimmed OpenAPI without a weak LLM baseline', async () => {
  const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v));
  const f = await httpFixture();
  try {
    const l1 = [1, 10, 50].map(count => {
      const { source, config } = fixture();
      config.actions = Array.from({ length: count }, (_, i) => ({ ...config.actions[3], id: 'list-' + String(i).padStart(2, '0') }));
      const start = performance.now(), document = deriveDocument(source, config), elapsedMs = performance.now() - start;
      return { actions: count, minifiedBytes: bytes(toPublishedIndex(document)), warmInProcessCompileMs: +elapsedMs.toFixed(3) };
    });
    const l2 = toPublishedAction(f.document, f.document.actions.find(a => a.id === 'create')!);
    const tasks: any[] = [];
    const comparison: any[] = [];
    for (const count of [1, 3]) {
      const plan = { ...f.plan, steps: f.plan.steps.slice(0, count) };
      f.reset(); const first = await runPlan(plan);
      expect(first.status).toBe('success'); const requests = structuredClone(f.traces);
      const expected = first.completed.map(s => ({ stepId: s.stepId, outputs: s.outputs }));
      const prepared = await preparePlan(plan); f.reset();
      const cached = await executePlan(prepared);
      expect(cached.status).toBe('success'); expect(f.traces).toEqual(requests);
      const selectedActions = new Set(plan.steps.map(s => s.actionId));
      const contractBytes = bytes(f.index) + f.document.actions.filter(a => selectedActions.has(a.id)).reduce((sum, a) => sum + bytes(toPublishedAction(f.document, a)), 0);
      for (const [mode, result] of [['first', first], ['cached-details', cached]] as const) tasks.push({ steps: count, mode, ...result.metrics,
        networkContractBytes: mode === 'first' ? contractBytes : 0,
        modelVisibleOutputBytes: bytes(result.completed.map(s => s.outputs)), resultEnvelopeBytes: bytes(result) });
      const selectedIds = new Set(plan.steps.map(s => s.actionId));
      const config = { ...f.config, actions: f.config.actions.filter(a => selectedIds.has(a.id)) };
      const paths = new Set(config.actions.map(a => a.path));
      const trimmed = { ...f.source, paths: Object.fromEntries(Object.entries(f.source.paths).filter(([p]) => paths.has(p))) };
      // Omit unused methods, not just unused paths.
      for (const [p, value] of Object.entries(trimmed.paths) as [string, any][]) trimmed.paths[p] = Object.fromEntries(Object.entries(value).filter(([method]) => method === 'parameters' || config.actions.some(a => a.path === p && a.method.toLowerCase() === method)));
      const components: any = {}, visited = new Set<string>();
      const retain = (value: any): void => {
        if (!value || typeof value !== 'object') return;
        if (value.$ref && !visited.has(value.$ref)) {
          visited.add(value.$ref);
          const parts = value.$ref.slice(2).split('/').map((p: string) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
          if (parts[0] !== 'components' || parts.length !== 3) throw new Error('Unexpected fixture reference');
          const component = f.source.components[parts[1]][parts[2]];
          components[parts[1]] ??= {}; components[parts[1]][parts[2]] = component; retain(component);
        }
        for (const child of Object.values(value)) retain(child);
      };
      retain(trimmed.paths);
      for (const selection of config.actions) {
        const op = f.source.paths[selection.path][selection.method.toLowerCase()];
        for (const requirement of op.security ?? f.source.security ?? []) for (const name of Object.keys(requirement)) {
          components.securitySchemes ??= {}; components.securitySchemes[name] = f.source.components.securitySchemes[name];
        }
      }
      trimmed.components = components;
      for (const [name, source] of [['full-openapi', f.source], ['trimmed-openapi', trimmed]] as const) {
        const sourceUrl = f.artifactOrigin + '/bench/' + name + '.json', configUrl = f.artifactOrigin + '/bench/config.json';
        f.serveArtifact('/bench/' + name + '.json', source); f.serveArtifact('/bench/config.json', config);
        for (const cache of [false, true]) {
          f.reset(); const start = performance.now();
          const inputSource = cache ? source : await (await fetch(sourceUrl)).json();
          const inputConfig = cache ? config : await (await fetch(configUrl)).json();
          const baseline = await runOpenApi(inputSource, inputConfig, plan);
          const elapsedMs = performance.now() - start;
          expect(baseline.completed).toEqual(expected); expect(f.traces).toEqual(requests);
          comparison.push({ representation: name, steps: count, mode: cache ? 'cached-source' : 'first',
            sourceBytes: bytes(source), declarationBytes: bytes(config), networkContractBytes: cache ? 0 : bytes(source) + bytes(config), apiCalls: f.traces.length,
            sourceNetworkGets: cache ? 0 : 2, elapsedMs: +elapsedMs.toFixed(3), parseProjectionMs: +baseline.parseProjectionMs.toFixed(3),
            responseBytes: baseline.responseBytes, modelVisibleOutputBytes: bytes(baseline.completed.map(s => s.outputs)), intermediateLlmCalls: 0 });
        }
      }
    }
    const compilation = [1, 10, 50].map(count => JSON.parse(execFileSync(process.execPath, [path.join(ROOT, 'scripts/measure-compile.mjs'), String(count)], { encoding: 'utf8' })));
    const report = { environment: { node: process.version, platform: process.platform, arch: process.arch, date: new Date().toISOString() },
      compilation,
      tokenizer: null, l1, l2: { minifiedBytes: bytes(l2), inputSchemaBytes: bytes(l2.input), responseContractBytes: bytes(l2.success),
        responseSchemaBytes: l2.success.reduce((sum, s) => sum + (s.schema === undefined ? 0 : bytes(s.schema)), 0), dependentSchemaFetches: 0 },
      tasks, comparison, correctness: 'All baseline HTTP traces and selected outputs matched AURA; no intermediate model calls.',
      caveats: ['Loopback synthetic API; single samples, not production speed claims.', 'All first runs fetch their contracts over loopback: baseline source + declaration (2 GETs), AURA L1 + selected L2 (2 or 4 GETs).',
        'Cached AURA reuses a validated prepared plan; cached baselines reuse parsed source.', 'All runners share API/auth/data/task/cache conditions and pipe outputs without an LLM.',
        'Compilation peak RSS comes from a fresh Node subprocess per action count; it includes Node and module startup.', 'No tokenizer or token-count estimate is used.', 'Unsupported endpoints are covered by rejection scenarios and not timed as successful tasks.', 'Error/replanning paths are tested separately and excluded from success timings.'] };
    if (process.env.AURA_RECORD_MEASUREMENTS === '1') {
      const directory = path.join(ROOT, 'docs/measurements'); fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, 'local.json'), JSON.stringify(report, null, 2) + '\n');
    }
    expect(report.l1.map(v => v.actions)).toEqual([1, 10, 50]);
    expect(report.tasks.every(t => t.intermediateLlmCalls === 0)).toBe(true);
  } finally { await f.close(); }
}, 15000); // Includes three fresh Node processes; this is a correctness measurement, not a speed budget.
