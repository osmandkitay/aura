#!/usr/bin/env node
import { readJsonFile } from '../filesystem';
import { runPlan } from '../runner';

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log('aura-runner <plan.json> [--timeout-ms <positive integer>]\nRuns one explicit linear plan. No automatic retry or recovery.');
    return 0;
  }
  if (!(args.length === 1 || (args.length === 3 && args[1] === '--timeout-ms' && /^[1-9][0-9]*$/.test(args[2])))) throw new Error('Expected aura-runner <plan.json> [--timeout-ms <positive integer>]');
  const result = await runPlan(readJsonFile(args[0]), { timeoutMs: args[2] ? Number(args[2]) : undefined });
  console.log(JSON.stringify(result, null, 2));
  return result.status === 'success' ? 0 : 1;
}
void main().then(code => { process.exitCode = code; }).catch(error => {
  console.error(error instanceof Error && error.name === 'RunnerError' ? error.message : 'RUNNER_PREPARATION_FAILED');
  process.exitCode = 1;
});
