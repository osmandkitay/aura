import { Plan, PublishedAuraAction, PublishedAuraIndex } from '../schema/types';
import { validatePlan, validatePublishedAction, validatePublishedIndex } from '../validate';
import { schemaAt, typeFits } from '../validate/integrity';
import { assertSummary } from '../surface';
import { pointerEscape, pointersOverlap, readPointer, writePointer } from '../pointer';
import { RunnerError, validateNumbers, validateWireValue, valueErrors } from './request';

export interface PreparedAction { detail: PublishedAuraAction; url: string }
export interface PreparedPlan { plan: Plan; index: PublishedAuraIndex; actions: Map<string, PreparedAction>; detailGets: number }
export type Fetcher = typeof fetch;
export function artifactUrl(text: string): URL {
  const url = new URL(text);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new RunnerError('ARTIFACT_URL');
  return url;
}
export async function readArtifact(url: string, fetcher: Fetcher, timeoutMs: number): Promise<unknown> {
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
  if (response.status !== 200 || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new RunnerError('ARTIFACT_HTTP');
  const text = await response.text();
  if (Buffer.byteLength(text) > 1024 * 1024) throw new RunnerError('ARTIFACT_SIZE');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new RunnerError('ARTIFACT_JSON'); }
  validateNumbers(value);
  return value;
}
export function validateAssignments(plan: Plan, actions: Map<string, PreparedAction>): void {
  const seen = new Map<string, PublishedAuraAction>();
  for (const [index, step] of plan.steps.entries()) {
    const at = '/steps/' + index;
    if (seen.has(step.stepId)) throw new RunnerError('STEP_DUPLICATE', at);
    const action = actions.get(step.actionId)!.detail;
    const literal: Record<string, unknown> = {};
    const references: string[] = [];
    for (const [i, assignment] of step.inputs.entries()) {
      const target: any = schemaAt(action.input, assignment.target);
      if (!assignment.target || !target || typeof target !== 'object') throw new RunnerError('INPUT_TARGET', at + '/inputs/' + i);
      if (step.inputs.slice(0, i).some(a => pointersOverlap(a.target, assignment.target))) throw new RunnerError('INPUT_CONFLICT', at + '/inputs/' + i);
      if ('from' in assignment && assignment.from) {
        const source = seen.get(assignment.from.step);
        if (!source) throw new RunnerError('FROM_STEP', at + '/inputs/' + i);
        const output = source.outputs.find(o => o.name === assignment.from!.output);
        if (!output) throw new RunnerError('FROM_OUTPUT', at + '/inputs/' + i);
        if (!typeFits(output.type, target.type)) throw new RunnerError('FROM_TYPE', at + '/inputs/' + i);
        references.push(assignment.target);
        writePointer(literal, assignment.target, undefined, action.input);
      } else {
        if (valueErrors(target, assignment.value).length) throw new RunnerError('LITERAL_INVALID', at + '/inputs/' + i);
        writePointer(literal, assignment.target, assignment.value, action.input);
      }
    }
    // Check required siblings even when a reference will populate their parent.
    const required = (schema: any, pointer: string): void => {
      if (step.inputs.some(a => a.target === pointer || pointer.startsWith(a.target + '/'))) return;
      for (const [name, child] of Object.entries(schema?.properties ?? {})) {
        const childPointer = pointer + '/' + pointerEscape(name);
        const mandatory = (schema.required ?? []).includes(name);
        const touched = step.inputs.some(a => a.target === childPointer || a.target.startsWith(childPointer + '/'));
        if (mandatory && !touched) throw new RunnerError('INPUT_REQUIRED', at + childPointer);
        if (mandatory || touched) required(child, childPointer);
      }
    };
    required(action.input, '');
    const knownErrors = valueErrors(action.input, literal).filter(error => {
      const pointer = error.keyword === 'required' ? error.instancePath + '/' + pointerEscape(error.params.missingProperty) : error.instancePath;
      return !references.some(ref => pointersOverlap(pointer, ref));
    });
    if (knownErrors.length) throw new RunnerError('LITERAL_INVALID', at);
    for (const binding of action.bindings) {
      const selected = readPointer(literal, binding.input);
      if (selected.found && !references.some(ref => pointersOverlap(ref, binding.input))) validateWireValue(binding, selected.value);
    }
    seen.set(step.stepId, action);
  }
}
export async function preparePlan(value: unknown, options: { fetch?: Fetcher; timeoutMs?: number } = {}): Promise<PreparedPlan> {
  validateNumbers(value);
  const checked = validatePlan(value);
  if (!checked.valid) throw new RunnerError('PLAN_SCHEMA');
  const plan = structuredClone(checked.value!), fetcher = options.fetch ?? fetch, timeoutMs = options.timeoutMs ?? 10000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) throw new RunnerError('TIMEOUT_OPTION');
  artifactUrl(plan.descriptor);
  const ids = new Set<string>();
  for (const step of plan.steps) {
    if (ids.has(step.stepId)) throw new RunnerError('STEP_DUPLICATE');
    ids.add(step.stepId);
  }
  const rawIndex = await readArtifact(plan.descriptor, fetcher, timeoutMs);
  const indexResult = validatePublishedIndex(rawIndex);
  if (!indexResult.valid) throw new RunnerError('INDEX_INVALID');
  const index = indexResult.value!;
  if (plan.revision && plan.revision !== index.revision) throw new RunnerError('REVISION_PIN');
  for (const step of plan.steps) if (!index.actions.some(a => a.id === step.actionId)) throw new RunnerError('ACTION_UNKNOWN');
  const actions = new Map<string, PreparedAction>();
  for (const step of plan.steps) {
    if (actions.has(step.actionId)) continue;
    const summary = index.actions.find(a => a.id === step.actionId)!;
    const url = new URL(summary.href, plan.descriptor).href;
    const detailResult = validatePublishedAction(await readArtifact(url, fetcher, timeoutMs));
    if (!detailResult.valid) throw new RunnerError('ACTION_INVALID');
    const detail = detailResult.value!;
    if (detail.id !== step.actionId) throw new RunnerError('ACTION_ID');
    try { assertSummary(index, detail); } catch { throw new RunnerError('INDEX_DETAIL_MISMATCH'); }
    for (const id of [...(detail.requires ?? []), ...(detail.errors ?? []).flatMap(e => e.resolve ? [e.resolve] : [])])
      if (!index.actions.some(a => a.id === id)) throw new RunnerError('RESOLVER_UNKNOWN');
    actions.set(step.actionId, { detail, url });
  }
  try { validateAssignments(plan, actions); }
  catch (error) { if (error instanceof RunnerError) throw error; throw new RunnerError('INPUT_TARGET'); }
  return { plan, index, actions, detailGets: actions.size };
}
