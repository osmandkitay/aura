import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const aura = require('../packages/aura-protocol/dist/index.js');
const source = JSON.parse(fs.readFileSync(new URL('../examples/minimal-site/source/openapi.json', import.meta.url), 'utf8'));
const config = JSON.parse(fs.readFileSync(new URL('../examples/minimal-site/aura.config.json', import.meta.url), 'utf8'));
const count = Number(process.argv[2]);
if (![1, 10, 50].includes(count)) throw new Error('Expected action count 1, 10 or 50');
config.actions = Array.from({ length: count }, (_, i) => ({ ...config.actions.find(a => a.id === 'list'), id: 'list-' + String(i).padStart(2, '0') }));
const start = performance.now();
const document = aura.deriveDocument(source, config);
console.log(JSON.stringify({ selectedOperations: count, uniqueSourceOperations: 1, elapsedMs: +(performance.now() - start).toFixed(3), peakRssBytes: process.resourceUsage().maxRSS * 1024,
  canonicalDocumentBytes: Buffer.byteLength(JSON.stringify(document)) }));
