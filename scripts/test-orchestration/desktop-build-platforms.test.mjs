import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { parse } from 'yaml';

import {
  SUPPORTED_DESKTOP_TARGETS,
  resolveSupportedDesktopTarget,
} from '../assert-supported-desktop-host.mjs';

describe('Desktop build platform contract', () => {
  it('accepts exactly macOS Apple Silicon and Windows x64', () => {
    assert.deepEqual(SUPPORTED_DESKTOP_TARGETS, ['darwin-arm64', 'win32-x64']);
    assert.equal(resolveSupportedDesktopTarget('darwin', 'arm64'), 'darwin-arm64');
    assert.equal(resolveSupportedDesktopTarget('win32', 'x64'), 'win32-x64');

    for (const [platform, arch] of [
      ['linux', 'x64'],
      ['darwin', 'x64'],
      ['win32', 'arm64'],
      ['win32', 'ia32'],
      ['freebsd', 'x64'],
    ]) {
      assert.throws(
        () => resolveSupportedDesktopTarget(platform, arch),
        new RegExp(
          `Unsupported OpenNeko Desktop build host: ${platform}-${arch}.*darwin-arm64, win32-x64`,
          'u',
        ),
      );
    }
  });

  it('guards every native Desktop Forge entry point', async () => {
    const packageJson = JSON.parse(await readFile('apps/neko-desktop/package.json', 'utf8'));
    const scripts = packageJson.scripts ?? {};
    for (const command of ['build', 'dev', 'make', 'package']) {
      assert.match(
        scripts[command] ?? '',
        /^node \.\.\/\.\.\/scripts\/assert-supported-desktop-host\.mjs && electron-forge /u,
        `${command} must reject unsupported hosts before Forge`,
      );
    }
  });

  it('separates Ubuntu static validation from native package jobs', async () => {
    const workflow = parse(await readFile('.github/workflows/ci.yml', 'utf8'));
    const staticBuild = workflow.jobs?.['static-build'];
    const nativePackage = workflow.jobs?.['desktop-package'];

    assert.equal(staticBuild?.['runs-on'], 'ubuntu-latest');
    assert.equal(
      findRunStep(staticBuild, 'Run host-neutral build checks'),
      'pnpm check:static-build',
    );
    assert.equal(findRunStep(staticBuild, 'Package Desktop'), undefined);

    assert.deepEqual(nativePackage?.strategy?.matrix?.include, [
      { target: 'darwin-arm64', os: 'macos-15' },
      { target: 'win32-x64', os: 'windows-2025' },
    ]);
    assert.equal(nativePackage?.['runs-on'], '${{ matrix.os }}');
    assert.equal(findRunStep(nativePackage, 'Typecheck Desktop'), 'pnpm typecheck:desktop');
    assert.equal(findRunStep(nativePackage, 'Package Desktop'), 'pnpm package:desktop');
    assert.equal(nativePackage?.steps?.at(-1)?.with?.name, 'openneko-${{ matrix.target }}');
    assert.equal(
      nativePackage?.steps?.at(-1)?.with?.path,
      'apps/neko-desktop/out/OpenNeko-${{ matrix.target }}/',
    );
    assert.equal(nativePackage?.steps?.at(-1)?.with?.['if-no-files-found'], 'error');
    assert.deepEqual(workflow.jobs?.['local-metadata-runtime']?.strategy?.matrix?.os, [
      'macos-15',
      'windows-2025',
    ]);
  });
});

function findRunStep(job, stepName) {
  return job?.steps?.find((candidate) => candidate.name === stepName)?.run;
}
