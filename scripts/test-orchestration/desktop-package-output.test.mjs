import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
  assertDesktopPackageOutput,
  resolveDesktopPackageExecutable,
} from '../assert-desktop-package-output.mjs';

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('Desktop package output assertion', () => {
  it('maps only the macOS target to its canonical executable', () => {
    assert.equal(
      resolveDesktopPackageExecutable('darwin-arm64', '/repo'),
      join(
        '/repo',
        'apps/neko-desktop/out/OpenNeko-darwin-arm64/OpenNeko.app/Contents/MacOS/OpenNeko',
      ),
    );
    assert.throws(
      () => resolveDesktopPackageExecutable('win32-x64', '/repo'),
      /Unsupported OpenNeko Desktop package target: win32-x64/u,
    );
    assert.throws(
      () => resolveDesktopPackageExecutable('linux-x64', '/repo'),
      /Unsupported OpenNeko Desktop package target: linux-x64/u,
    );
  });

  it('accepts an existing canonical executable and returns its identity', async () => {
    const repositoryRoot = await createTemporaryRoot();
    const executablePath = resolveDesktopPackageExecutable('darwin-arm64', repositoryRoot);
    await mkdir(dirname(executablePath), { recursive: true });
    await writeFile(executablePath, 'fixture');

    assert.deepEqual(assertDesktopPackageOutput({ repositoryRoot, target: 'darwin-arm64' }), {
      executablePath,
      target: 'darwin-arm64',
    });
  });

  it('fails visibly when Forge returns without the canonical executable', async () => {
    const repositoryRoot = await createTemporaryRoot();

    assert.throws(
      () => assertDesktopPackageOutput({ repositoryRoot, target: 'darwin-arm64' }),
      /OpenNeko Desktop package output is missing for darwin-arm64/u,
    );
  });
});

async function createTemporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), 'openneko-desktop-package-output-'));
  temporaryRoots.push(root);
  return root;
}
