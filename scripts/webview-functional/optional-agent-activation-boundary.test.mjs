import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const repoRoot = resolve(import.meta.dirname, '../..');
const extensionEntries = [
  'packages/neko-engine/packages/extension/src/extension.ts',
  'packages/neko-cut/packages/extension/src/extension.ts',
  'packages/neko-story/packages/extension/src/extension.ts',
  'packages/neko-canvas/packages/extension/src/extension.ts',
];

describe('optional Agent capability activation boundary', () => {
  it('does not await Agent activation from an extension that Agent can depend on', async () => {
    for (const path of extensionEntries) {
      const source = await readFile(resolve(repoRoot, path), 'utf8');
      assert.doesNotMatch(
        source,
        /await\s+registerOptionalAgentCapabilityProvider/u,
        `${path} can deadlock through Agent extensionDependencies`,
      );
      assert.match(source, /void registerOptionalAgentCapabilityProvider/u);
      assert.match(source, /registerOptionalAgentCapabilityProvider[\s\S]*?\.catch\(/u);
    }
  });
});
