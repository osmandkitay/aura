import { readPointer, writePointer } from '../pointer';
import { preparePlan, Fetcher, PreparedPlan } from './plan';
import { buildRequest, projectOutputs, RunnerError, valueErrors } from './request';
import { parseState, stateFor, StateObservation } from './state';

export { buildRequest, projectOutputs, RunnerError } from './request';
export { preparePlan } from './plan';
export { encodeState, parseState, stateFor, MAX_STATE_HEADER_BYTES } from './state';
export interface StepResult { stepId: string; actionId: string; actionUrl: string; revision: string; httpStatus: number; outputs: Record<string, unknown>; state: StateObservation; diagnostic?: string }
export interface RunResult {
  status: 'success' | 'failed' | 'blocked' | 'partial' | 'outcome-unknown';
  descriptor: string; revision: string; completed: StepResult[];
  failure?: { stepId: string; actionId: string; actionUrl: string; revision: string; code: string;
    status: 'failed' | 'blocked' | 'outcome-unknown'; httpStatus?: number; reason?: string; resolve?: string; state?: StateObservation; diagnostic?: string };
  metrics: { descriptorGets: number; detailGets: number; apiCalls: number; responseBytes: number; parseProjectionMs: number; elapsedMs: number; intermediateLlmCalls: 0 };
}
async function discardBody(response: Response): Promise<void> {
  try { await response.body?.cancel(); }
  catch { /* Cleanup failure must not replace an already known HTTP outcome. */ }
}
export async function executePlan(prepared: PreparedPlan, options: { fetch?: Fetcher; timeoutMs?: number } = {}): Promise<RunResult> {
  const start = performance.now(), fetcher = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) throw new RunnerError('TIMEOUT_OPTION');
  const { plan, index, actions } = prepared;
  const result: RunResult = { status: 'success', descriptor: plan.descriptor, revision: index.revision, completed: [],
    metrics: { descriptorGets: 0, detailGets: 0, apiCalls: 0, responseBytes: 0, parseProjectionMs: 0, elapsedMs: 0, intermediateLlmCalls: 0 } };
  const internal = new Map<string, Record<string, unknown>>();
  for (const step of plan.steps) {
    const { detail: action, url } = actions.get(step.actionId)!;
    const failure: NonNullable<RunResult['failure']> = { stepId: step.stepId, actionId: step.actionId, actionUrl: url,
      revision: action.revision, code: 'INPUT_INVALID', status: 'failed' };
    let dispatched = false, responseRead = false;
    try {
      const input: Record<string, unknown> = {};
      for (const assignment of step.inputs) {
        let value = assignment.value;
        if ('from' in assignment && assignment.from) {
          const previous = internal.get(assignment.from.step)!;
          const selected = readPointer(previous, '/' + assignment.from.output.replace(/~/g, '~0').replace(/\//g, '~1'));
          if (!selected.found) throw new RunnerError('FROM_MISSING');
          value = selected.value;
        }
        writePointer(input, assignment.target, value, action.input);
      }
      const request = buildRequest(action, input);
      dispatched = true; result.metrics.apiCalls++;
      const response = await fetcher(request.url, { method: request.method, headers: request.headers, body: request.body,
        redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
      failure.httpStatus = response.status;
      const parsedState = parseState(response.headers.get('aura-state'), index);
      const observation = stateFor(parsedState, action.id);
      failure.state = observation;
      if (parsedState.diagnostic) failure.diagnostic = parsedState.diagnostic;
      const success = action.success.find(s => s.status === response.status);
      if (!success) {
        failure.status = [401, 403, 429].includes(response.status) ? 'blocked' : 'failed';
        const declared = action.errors?.find(e => e.status === response.status);
        failure.code = 'HTTP_STATUS'; failure.reason = declared?.reason ?? observation.reason; failure.resolve = declared?.resolve ?? observation.resolve;
        responseRead = true; await discardBody(response);
        throw new RunnerError('HTTP_STATUS');
      }
      let data: unknown;
      if (success.contentType !== null) {
        if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== success.contentType) {
          responseRead = true; await discardBody(response); throw new RunnerError('RESPONSE_MEDIA');
        }
        const text = await response.text(); responseRead = true;
        result.metrics.responseBytes += Buffer.byteLength(text);
        const parseStart = performance.now();
        try { data = JSON.parse(text); } catch { throw new RunnerError('RESPONSE_JSON'); }
        if (valueErrors(success.schema!, data).length) throw new RunnerError('RESPONSE_SCHEMA');
        result.metrics.parseProjectionMs += performance.now() - parseStart;
      } else { responseRead = true; await discardBody(response); }
      const projectStart = performance.now();
      const projected = projectOutputs(action.outputs, data);
      result.metrics.parseProjectionMs += performance.now() - projectStart;
      internal.set(step.stepId, projected.internal);
      result.completed.push({ stepId: step.stepId, actionId: step.actionId, actionUrl: url,
        revision: action.revision, httpStatus: response.status, outputs: projected.visible, state: observation,
        ...(parsedState.diagnostic ? { diagnostic: parsedState.diagnostic } : {}) });
    } catch (error) {
      if (dispatched && !responseRead && !(error instanceof RunnerError)) {
        failure.status = 'outcome-unknown'; failure.code = 'TRANSPORT_OUTCOME_UNKNOWN';
      } else if (error instanceof RunnerError) failure.code = error.code;
      else failure.code = 'INPUT_INVALID';
      result.failure = failure;
      result.status = failure.status === 'outcome-unknown' ? 'outcome-unknown' : result.completed.length ? 'partial' : failure.status;
      break;
    }
  }
  result.metrics.elapsedMs = performance.now() - start;
  internal.clear();
  return result;
}
export async function runPlan(value: unknown, options: { fetch?: Fetcher; timeoutMs?: number } = {}): Promise<RunResult> {
  const start = performance.now();
  const prepared = await preparePlan(value, options);
  const result = await executePlan(prepared, options);
  result.metrics.descriptorGets = 1;
  result.metrics.detailGets = prepared.detailGets;
  result.metrics.elapsedMs = performance.now() - start;
  return result;
}
