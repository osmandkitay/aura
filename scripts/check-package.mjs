import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import http from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = path.join(root, 'packages/aura-protocol');
// Follow npm's launcher on PATH (including Unix symlinks and Windows npm.cmd),
// rather than assuming npm belongs to the installation of the running Node.
const launchers = [process.env.npm_execpath, ...(process.env.PATH ?? '').split(path.delimiter)
  .filter(Boolean).map(directory => path.join(directory, process.platform === 'win32' ? 'npm.cmd' : 'npm'))]
  .filter(file => file && fs.existsSync(file)).map(file => fs.realpathSync(file));
const npmCli = launchers.flatMap(file => path.basename(file) === 'npm-cli.js' ? [file] :
  [path.join(path.dirname(file), 'node_modules/npm/bin/npm-cli.js')]).find(file => fs.existsSync(file));
if (!npmCli) throw new Error('npm was not found: run through npm or put its launcher on PATH');
const npm = (args, cwd) => execFileSync(process.execPath, [npmCli, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-package-'));
const start = performance.now();
let server;
try {
  const packed = JSON.parse(npm(['pack', '--json', '--ignore-scripts', '--pack-destination', temporary], pkg))[0];
  const archive = path.join(temporary, packed.filename);
  const installed = path.join(temporary, 'clean'); fs.mkdirSync(installed);
  fs.writeFileSync(path.join(installed, 'package.json'), '{"private":true}');
  const installStart = performance.now();
  npm(['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', archive], installed);
  const installMs = performance.now() - installStart;
  const moduleRoot = path.join(installed, 'node_modules/aura-protocol');
  const require = createRequire(path.join(installed, 'package.json'));
  const aura = require('aura-protocol');
  assert.equal(typeof require('aura-protocol/runner').runPlan, 'function');
  const installedPackage = JSON.parse(fs.readFileSync(path.join(moduleRoot, 'package.json'), 'utf8'));
  for (const name of ['aura-protocol', 'aura-validate', 'aura-runner']) {
    assert.ok(fs.existsSync(path.join(installed, 'node_modules/.bin', name + (process.platform === 'win32' ? '.cmd' : ''))));
    assert.ok(fs.readFileSync(path.join(moduleRoot, installedPackage.bin[name]), 'utf8').startsWith('#!/usr/bin/env node'));
  }
  const schemas = fs.readdirSync(path.join(pkg, 'schema')).filter(f => f.endsWith('.json'));
  for (const file of schemas) {
    assert.deepEqual(fs.readFileSync(path.join(moduleRoot, 'dist', file)), fs.readFileSync(path.join(pkg, 'schema', file)));
    const schema = JSON.parse(fs.readFileSync(path.join(moduleRoot, 'dist', file), 'utf8'));
    assert.equal(schema.$id, `${aura.AURA_SCHEMA_BASE_URL}/${file}`);
  }
  let apiCalls = 0;
  server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/v1/entries') {
      apiCalls++;
      let body = ''; for await (const chunk of req) body += chunk;
      assert.deepEqual(JSON.parse(body), { name: 'hello' });
      res.writeHead(201, { 'content-type': 'application/json' }); res.end('{"id":"created-1"}'); return;
    }
    const files = { '/.well-known/aura.json': 'public/.well-known/aura.json', '/.well-known/aura/actions/create.json': 'public/.well-known/aura/actions/create.json' };
    const file = files[req.url];
    if (!file) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(fs.readFileSync(path.join(installed, file)));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const requestSchema = { type: 'object', required: ['name'], properties: { name: { type: 'string' } } };
  const responseSchema = { type: 'object', required: ['id'], properties: { id: { type: 'string' } } };
  const operation = {
    requestBody: { required: true, content: { 'application/json': { schema: requestSchema } } },
    responses: { '201': { description: 'created', content: { 'application/json': { schema: responseSchema } } } }
  };
  const source = { openapi: '3.1.1', info: { title: 'Existing API', version: '1' },
    servers: [{ url: origin + '/v1' }], paths: { '/entries': { post: operation } } };
  const config = { $schema: aura.AURA_CONFIG_SCHEMA_URL, publisher: { name: 'Author', url: 'https://recipes.example', role: 'third-party' },
    source: { url: origin + '/openapi.json', version: '1' }, target: { url: origin + '/v1' },
    actions: [{ id: 'create', key: 'entry.create', risk: 'medium', method: 'POST', path: '/entries', outputs: [{ name: 'id', source: 'body', pointer: '/id', type: 'string', required: true, visibility: 'model' }] }] };
  fs.writeFileSync(path.join(installed, 'openapi.json'), JSON.stringify(source));
  fs.writeFileSync(path.join(installed, 'aura.config.json'), JSON.stringify(config));
  const cli = path.join(moduleRoot, 'dist/cli/aura-protocol.js');
  const run = args => execFileSync(process.execPath, [cli, ...args], { cwd: installed, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const publishStart = performance.now();
  run(['derive', 'openapi.json', '--config', 'aura.config.json']);
  run(['publish', '.derived/aura-v2.json', '--out', 'public']);
  run(['validate', 'public/.well-known/aura.json']);
  const firstPublishMs = performance.now() - publishStart;
  execFileSync(process.execPath, [path.join(moduleRoot, 'dist/cli/aura-validate.js'), 'public/.well-known/aura.json'], { cwd: installed });
  const Ajv = require('ajv');
  for (const [file, schemaName] of [['.derived/aura-v2.json', 'v2'], ['public/.well-known/aura.json', 'publish'], ['public/.well-known/aura/actions/create.json', 'action']]) {
    const value = JSON.parse(fs.readFileSync(path.join(installed, file), 'utf8'));
    const schema = JSON.parse(fs.readFileSync(path.join(moduleRoot, `dist/aura-${schemaName}.schema.json`), 'utf8'));
    const validate = new Ajv({ strict: false }).compile(schema);
    assert.equal(validate(value), true, JSON.stringify(validate.errors));
  }
  // No working-directory rescue: hiding installed schemas must break validation.
  const asset = path.join(moduleRoot, 'dist/aura-action.schema.json');
  fs.renameSync(asset, asset + '.hidden');
  try {
    assert.throws(() => run(['validate', 'public/.well-known/aura/actions/create.json']));
  } finally { fs.renameSync(asset + '.hidden', asset); }
  const plan = { $schema: aura.AURA_PLAN_SCHEMA_URL, profile: aura.AURA_PROFILE,
    descriptor: origin + '/.well-known/aura.json', steps: [{ stepId: 'first', actionId: 'create', inputs: [{ target: '/body', value: { name: 'hello' } }] }] };
  fs.writeFileSync(path.join(installed, 'plan.json'), JSON.stringify(plan));
  const publishedIndex = JSON.parse(fs.readFileSync(path.join(installed, 'public/.well-known/aura.json'), 'utf8'));
  const state = { version: 2, revision: publishedIndex.revision, actions: [] };
  for (const [name, value] of [['config', config], ['plan', plan], ['state', state]]) {
    const schema = JSON.parse(fs.readFileSync(path.join(moduleRoot, `dist/aura-${name}.schema.json`), 'utf8'));
    const validate = new Ajv({ strict: false }).compile(schema);
    assert.equal(validate(value), true, JSON.stringify(validate.errors));
  }
  const consumptionStart = performance.now();
  const runnerOutput = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(moduleRoot, 'dist/cli/aura-runner.js'), 'plan.json'], { cwd: installed, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject); child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error('Packaged runner failed: ' + stderr)));
  });
  const firstConsumptionMs = performance.now() - consumptionStart;
  const result = JSON.parse(runnerOutput);
  assert.equal(result.status, 'success'); assert.equal(apiCalls, 1);
  assert.deepEqual(result.completed[0].outputs, { id: 'created-1' });
  if (process.argv.includes('--remote')) {
    for (const file of schemas) {
      const response = await fetch(`${aura.AURA_SCHEMA_BASE_URL}/${file}`);
      assert.equal(response.status, 200, `Public schema is unavailable: ${response.url}`);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), fs.readFileSync(path.join(pkg, 'schema', file)));
    }
  }
  const report = { archive: packed.filename, files: packed.files.length, archiveBytes: packed.size, unpackedBytes: packed.unpackedSize, schemas: schemas.length,
    isolatedInstall: true, externalAjv: true, cwdFallback: false, packagedRunner: true,
    installMs: +installMs.toFixed(2), firstPublishMs: +firstPublishMs.toFixed(2), firstConsumptionMs: +firstConsumptionMs.toFixed(2),
    elapsedMs: +(performance.now() - start).toFixed(2), publicSchemaCheck: process.argv.includes('--remote') ? 'passed' : 'not requested' };
  if (process.argv.includes('--record')) fs.writeFileSync(path.join(root, 'docs/measurements/package.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (!path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Unexpected cleanup path');
  fs.rmSync(temporary, { recursive: true, force: true });
}
