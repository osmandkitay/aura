import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { AURA_ACTION_SCHEMA_URL, AURA_PROFILE, validatePublishedAction } from '../../packages/aura-protocol/src';
import { buildRequest, projectOutputs } from '../../packages/aura-protocol/src/runner';
import { constructRequest, project } from '../interop/minimal-consumer.mjs';
import { fixture } from './contract-fixture';
import { ROOT } from './helpers';

const vectors = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/interop/vectors.json'), 'utf8'));
for (const vector of vectors) it('independent shared vector: ' + vector.name, () => {
  const { config } = fixture();
  const validation = validatePublishedAction({ $schema: AURA_ACTION_SCHEMA_URL, profile: AURA_PROFILE,
    revision: 'a'.repeat(64), publisher: config.publisher, source: { ...config.source, kind: 'aura-v2' }, target: config.target, ...vector.action });
  expect(validation.errors).toEqual([]);
  expect(buildRequest(vector.action, vector.input)).toEqual(vector.expectedRequest);
  expect(constructRequest(vector.action, vector.input)).toEqual(vector.expectedRequest);
  expect(projectOutputs(vector.action.outputs, vector.response).visible).toEqual(vector.expectedOutputs);
  expect(project(vector.action, vector.response).visible).toEqual(vector.expectedOutputs);
});
