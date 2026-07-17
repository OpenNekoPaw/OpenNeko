import assert from 'node:assert/strict';
import test from 'node:test';
import { validateLocalMetadataRuntimeMatrix } from '../check-local-metadata-runtime-matrix.mjs';

test('local metadata runtime matrix covers supported hosts, operating systems, and architectures', async () => {
  assert.deepEqual(await validateLocalMetadataRuntimeMatrix(), []);
});
