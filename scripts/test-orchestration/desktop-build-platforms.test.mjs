import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { parse } from 'yaml';

import {
  SUPPORTED_DESKTOP_TARGETS,
  resolveSupportedDesktopTarget,
} from '../assert-supported-desktop-host.mjs';

describe('Desktop build platform contract', () => {
  it('accepts exactly macOS Apple Silicon', () => {
    assert.deepEqual(SUPPORTED_DESKTOP_TARGETS, ['darwin-arm64']);
    assert.equal(resolveSupportedDesktopTarget('darwin', 'arm64'), 'darwin-arm64');

    for (const [platform, arch] of [
      ['linux', 'x64'],
      ['darwin', 'x64'],
      ['win32', 'x64'],
      ['win32', 'arm64'],
      ['win32', 'ia32'],
      ['freebsd', 'x64'],
    ]) {
      assert.throws(
        () => resolveSupportedDesktopTarget(platform, arch),
        new RegExp(
          `Unsupported OpenNeko Desktop build host: ${platform}-${arch}.*darwin-arm64`,
          'u',
        ),
      );
    }
  });

  it('guards every native Desktop Forge entry point', async () => {
    const packageJson = JSON.parse(await readFile('apps/neko-desktop/package.json', 'utf8'));
    const hostGuardSource = await readFile('scripts/assert-supported-desktop-host.mjs', 'utf8');
    const outputGuardSource = await readFile('scripts/assert-desktop-package-output.mjs', 'utf8');
    const scripts = packageJson.scripts ?? {};
    for (const command of ['build', 'dev', 'make', 'package']) {
      assert.match(
        scripts[command] ?? '',
        /^node \.\.\/\.\.\/scripts\/assert-supported-desktop-host\.mjs && electron-forge /u,
        `${command} must reject unsupported hosts before Forge`,
      );
    }

    for (const command of ['build', 'make', 'package']) {
      assert.match(
        scripts[command] ?? '',
        /&& node \.\.\/\.\.\/scripts\/assert-desktop-package-output\.mjs$/u,
        `${command} must fail when Forge returns without the canonical target output`,
      );
    }

    for (const [name, source] of [
      ['host guard', hostGuardSource],
      ['output guard', outputGuardSource],
    ]) {
      assert.match(
        source,
        /import\.meta\.url === pathToFileURL\(process\.argv\[1\]\)\.href/u,
        `${name} must execute through a cross-platform file URL comparison`,
      );
    }
  });

  it('packages only on macOS and keeps Windows/Linux test-only', async () => {
    const workflow = parse(await readFile('.github/workflows/ci.yml', 'utf8'));
    const staticBuild = workflow.jobs?.['static-build'];
    const nativePackage = workflow.jobs?.['desktop-package'];

    assert.equal(staticBuild?.['runs-on'], 'ubuntu-latest');
    assert.equal(
      findRunStep(staticBuild, 'Run host-neutral build checks'),
      'pnpm check:static-build',
    );
    assert.equal(findRunStep(staticBuild, 'Package Desktop'), undefined);

    assert.equal(nativePackage?.strategy, undefined);
    assert.equal(nativePackage?.['runs-on'], 'macos-15');
    assert.equal(findRunStep(nativePackage, 'Typecheck Desktop'), 'pnpm typecheck:desktop');
    assert.equal(
      findRunStep(nativePackage, 'Validate native Sharp bundle runtime'),
      'node --test scripts/test-orchestration/sharp-cjs-bundle-runtime.test.mjs',
    );
    const packageStep = findStep(nativePackage, 'Package Desktop');
    assert.equal(packageStep?.run, 'pnpm package:desktop');
    assert.equal(packageStep?.env?.NODE_OPTIONS, '--max-old-space-size=4096');
    assert.equal(nativePackage?.steps?.at(-1)?.with?.name, 'openneko-darwin-arm64');
    assert.equal(
      nativePackage?.steps?.at(-1)?.with?.path,
      'apps/neko-desktop/out/OpenNeko-darwin-arm64/',
    );
    assert.equal(nativePackage?.steps?.at(-1)?.with?.['if-no-files-found'], 'error');
    const platformTest = workflow.jobs?.['platform-test'];
    assert.deepEqual(platformTest?.strategy?.matrix?.os, ['ubuntu-latest', 'windows-2025']);
    assert.equal(platformTest?.['runs-on'], '${{ matrix.os }}');
    assert.equal(findRunStep(platformTest, 'Typecheck Desktop'), 'pnpm typecheck:desktop');
    assert.equal(
      findRunStep(platformTest, 'Validate local metadata runtime'),
      'pnpm check:local-metadata-runtimes',
    );
    const forbidden = JSON.stringify(platformTest);
    assert.doesNotMatch(forbidden, /package:desktop|electron-forge|upload-artifact|make:desktop/u);
  });
});

function findRunStep(job, stepName) {
  return findStep(job, stepName)?.run;
}

function findStep(job, stepName) {
  return job?.steps?.find((candidate) => candidate.name === stepName);
}
