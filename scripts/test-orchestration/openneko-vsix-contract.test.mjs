import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  assertCanonicalOpenNekoManifest,
  assertOpenNekoReleaseArtifacts,
  expectedOpenNekoArtifacts,
  openNekoArtifactName,
} from '../openneko-vsix-contract.mjs';

describe('single OpenNeko VSIX contract', () => {
  it('names exactly one artifact per supported platform', () => {
    assert.equal(openNekoArtifactName('darwin-arm64', '0.0.2'), 'OpenNeko-darwin-arm64-0.0.2.vsix');
    assert.deepEqual(expectedOpenNekoArtifacts('0.0.2'), [
      'OpenNeko-darwin-arm64-0.0.2.vsix',
      'OpenNeko-linux-x64-0.0.2.vsix',
    ]);
    assert.throws(() => openNekoArtifactName('win32-x64', '0.0.2'), /Unsupported OpenNeko/u);
  });

  it('rejects missing, extra, or internal feature release artifacts', () => {
    const expected = expectedOpenNekoArtifacts('0.0.2');
    assert.deepEqual(assertOpenNekoReleaseArtifacts(expected, '0.0.2').files, expected);
    assert.throws(
      () => assertOpenNekoReleaseArtifacts([...expected, 'neko-agent-0.0.2.vsix'], '0.0.2'),
      /Release VSIX set mismatch/u,
    );
    assert.throws(
      () => assertOpenNekoReleaseArtifacts([expected[0]], '0.0.2'),
      /Release VSIX set mismatch/u,
    );
  });

  it('accepts the app-owned canonical manifest', async () => {
    const manifest = JSON.parse(await readFile('apps/neko-vscode/package.json', 'utf8'));
    const result = assertCanonicalOpenNekoManifest(manifest);
    assert.ok(result.contributionSections.includes('commands'));
    assert.ok(result.contributionSections.includes('customEditors'));
    assert.ok(manifest.contributes.commands.length > 50);
    assert.equal(
      manifest.contributes.themes[0].path,
      './dist/features/neko-tools/themes/neko-macos-dark-color-theme.json',
    );
  });

  it('rejects manifests that reintroduce multiple extension owners', () => {
    const valid = {
      name: 'neko-suite',
      publisher: 'neko',
      main: './dist/extension.js',
      files: ['dist/**', 'l10n/**', 'package.nls.json', 'package.nls.zh-cn.json'],
      contributes: { commands: [{ command: 'neko.test', title: 'Test' }] },
    };
    assert.throws(
      () =>
        assertCanonicalOpenNekoManifest({
          ...valid,
          extensionDependencies: ['neko.neko-agent'],
        }),
      /separately installed/u,
    );
    assert.throws(
      () => assertCanonicalOpenNekoManifest({ ...valid, contributes: {} }),
      /must own all retained contributions/u,
    );
  });

  it('routes full local release entry points through the unified assembler', async () => {
    const [buildScript, ciScript] = await Promise.all([
      readFile('build.sh', 'utf8'),
      readFile('ci.sh', 'utf8'),
    ]);
    for (const source of [buildScript, ciScript]) {
      assert.match(source, /package-openneko-platform\.mjs/u);
      assert.doesNotMatch(source, /release_ts|release_engine/u);
      assert.doesNotMatch(source, /package_extension "neko-suite"/u);
    }
  });
});
