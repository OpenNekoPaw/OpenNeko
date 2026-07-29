import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { checkEngineRetirementBoundary } from '../check-engine-retirement-boundary.mjs';

describe('Engine product retirement boundary', () => {
  it('accepts the repository removal-first composition', async () => {
    assert.deepEqual(await checkEngineRetirementBoundary(undefined, async () => []), {
      featureManifestCount: 1,
      retiredCommandCount: 3,
    });
  });

  it('rejects an Engine feature reintroduced into release composition', async () => {
    const files = createValidFixture();
    files.set(
      'scripts/package-groups.json',
      JSON.stringify({
        packages: { buildRelease: ['neko-engine'], tsExtensions: [] },
      }),
    );
    await assert.rejects(
      checkEngineRetirementBoundary((file) => Promise.resolve(files.get(file))),
      /buildRelease still contains retired value neko-engine/u,
    );
  });

  it('rejects removal of the fail-closed command poison', async () => {
    const files = createValidFixture();
    files.set(
      'apps/neko-vscode/src/extension.ts',
      files
        .get('apps/neko-vscode/src/extension.ts')
        .replace("'neko.engine.probeInternal',", ''),
    );
    await assert.rejects(
      checkEngineRetirementBoundary((file) => Promise.resolve(files.get(file))),
      /does not poison retired media command neko\.engine\.probeInternal/u,
    );
  });

  it('rejects production source imports of the retired Engine client', async () => {
    const files = createValidFixture();
    files.set(
      'apps/neko-vscode/src/features/preview/services/PreviewService.ts',
      "import { EngineClient } from '@neko/neko-client';",
    );

    await assert.rejects(
      checkEngineRetirementBoundary(
        (file) => Promise.resolve(files.get(file)),
        async () => ['apps/neko-vscode/src/features/preview/services/PreviewService.ts'],
      ),
      /PreviewService\.ts: @neko\/neko-client import/u,
    );
  });
});

function createValidFixture() {
  const manifests = ['apps/neko-vscode/package.json'];
  return new Map([
    [
      'scripts/package-groups.json',
      JSON.stringify({ packages: { buildRelease: ['neko-tools'], tsExtensions: ['neko-tools'] } }),
    ],
    [
      'apps/neko-vscode/src/extension.ts',
      [
        "const FEATURE_ORDER = ['neko-tools'];",
        "const retiredFeatureIds = ['neko.neko-engine'];",
        "const commands = ['neko.engine.ensureFrameServer', 'neko.engine.extractThumbnail',",
        "'neko.engine.probeInternal',];",
        'throw new Error(`Retired media command ${command} cannot be used`);',
      ].join('\n'),
    ],
    ['scripts/openneko-vsix-contract.mjs', "const features = ['neko-tools'];"],
    ['scripts/package-openneko-platform.mjs', 'export const packageProduct = true;'],
    ['turbo.json', JSON.stringify({ tasks: {} })],
    ...manifests.map((file) => [file, JSON.stringify({ extensionDependencies: [] })]),
  ]);
}
