import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { calculateExtensionPackageTreeSha256 } from './extension-package-integrity';

describe('extension package tree integrity', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('produces a stable digest and detects content changes', async () => {
    const root = await createPackageRoot();
    await writeFile(join(root, 'runtime.txt'), 'reviewed', 'utf8');
    const expected = await calculateExtensionPackageTreeSha256(root);

    await expect(calculateExtensionPackageTreeSha256(root)).resolves.toBe(expected);
    await writeFile(join(root, 'runtime.txt'), 'modified', 'utf8');
    await expect(calculateExtensionPackageTreeSha256(root)).resolves.not.toBe(expected);
  });

  it.skipIf(process.platform === 'win32')(
    'includes executable permission in the digest',
    async () => {
      const root = await createPackageRoot();
      const executable = join(root, 'runtime');
      await writeFile(executable, 'runtime', 'utf8');
      await chmod(executable, 0o644);
      const nonExecutable = await calculateExtensionPackageTreeSha256(root);

      await chmod(executable, 0o755);
      await expect(calculateExtensionPackageTreeSha256(root)).resolves.not.toBe(nonExecutable);
    },
  );

  it('rejects links instead of hashing content outside the package', async () => {
    const root = await createPackageRoot();
    const outsideRoot = await mkdtemp(join(tmpdir(), 'openneko-extension-outside-'));
    roots.push(outsideRoot);
    const outside = join(outsideRoot, 'outside.txt');
    await writeFile(outside, 'outside', 'utf8');
    await symlink(outside, join(root, 'linked-runtime'));

    await expect(calculateExtensionPackageTreeSha256(root)).rejects.toThrow('unsafe path');
  });

  async function createPackageRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'openneko-extension-integrity-'));
    roots.push(root);
    await mkdir(join(root, '.openneko-plugin'), { recursive: true });
    await writeFile(
      join(root, '.openneko-plugin', 'plugin.json'),
      JSON.stringify({ name: 'sample', version: '1.0.0' }),
      'utf8',
    );
    return root;
  }
});
