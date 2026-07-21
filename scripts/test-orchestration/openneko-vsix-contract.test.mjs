import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  OPENNEKO_FEATURE_PACKAGES,
  assertOpenNekoReleaseArtifacts,
  composeOpenNekoManifest,
  expectedOpenNekoArtifacts,
  mergeOpenNekoLocalization,
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

  it('composes the real retained manifests without internal extension dependencies', async () => {
    const appManifest = await readJson('apps/neko-vscode/package.json');
    const featureManifests = await Promise.all(
      OPENNEKO_FEATURE_PACKAGES.map(async (packageName) => [
        packageName,
        await readJson(`packages/${packageName}/package.json`),
      ]),
    );
    const manifest = composeOpenNekoManifest({ appManifest, featureManifests });

    assert.equal(manifest.main, './dist/extension.js');
    assert.deepEqual(manifest.files, [
      'dist/**',
      'package.nls.json',
      'package.nls.zh-cn.json',
      'README.md',
      'LICENSE',
    ]);
    assert.equal(manifest.extensionPack, undefined);
    assert.equal(
      manifest.extensionDependencies?.some((id) => id.startsWith('neko.')) ?? false,
      false,
    );
    assert.ok(manifest.contributes.commands.length > 0);
    assert.ok(manifest.contributes.customEditors.length > 0);
    assert.deepEqual(
      manifest.contributes.themes.map(({ path }) => path),
      [
        './dist/features/neko-tools/themes/neko-macos-dark-color-theme.json',
        './dist/features/neko-tools/themes/neko-macos-light-color-theme.json',
      ],
    );
    assert.equal(
      manifest.contributes.iconThemes[0].path,
      './dist/features/neko-tools/themes/neko-file-icon-theme.json',
    );
    assert.equal(
      manifest.contributes.languages[0].configuration,
      './dist/features/neko-tools/language-configuration.json',
    );
    assert.deepEqual(manifest.contributes.languages[0].icon, {
      light: './dist/features/neko-tools/themes/icons/file-timeline.svg',
      dark: './dist/features/neko-tools/themes/icons/file-timeline.svg',
    });
  });

  it('fails visibly for contribution and localization collisions', () => {
    const manifests = OPENNEKO_FEATURE_PACKAGES.map((packageName) => [
      packageName,
      {
        version: '0.0.2',
        contributes: {},
      },
    ]);
    manifests[0][1].contributes = { commands: [{ command: 'neko.test', title: 'One' }] };
    manifests[1][1].contributes = { commands: [{ command: 'neko.test', title: 'Two' }] };

    assert.throws(
      () =>
        composeOpenNekoManifest({
          appManifest: { name: 'neko-suite', version: '0.0.2' },
          featureManifests: manifests,
        }),
      /commands:command=neko\.test conflicts/u,
    );
    assert.throws(
      () =>
        mergeOpenNekoLocalization([
          ['neko-agent/package.nls.json', { displayName: 'Agent' }],
          ['neko-assets/package.nls.json', { displayName: 'Assets' }],
        ]),
      /Localization key displayName conflicts/u,
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

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}
