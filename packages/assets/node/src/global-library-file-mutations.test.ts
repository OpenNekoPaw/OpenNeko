import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { moveGlobalLibraryFiles } from './global-library-file-mutations';

const temporaryRoots: string[] = [];

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    await chmod(root, 0o700).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
});

describe('Asset Center file movement', () => {
  it('moves a complete batch without replacing either item identity', async () => {
    const fixture = await createFixture();
    const first = path.join(fixture.source, 'first.png');
    const second = path.join(fixture.source, 'second.mp4');
    await writeFile(first, 'first');
    await writeFile(second, 'second');
    const commit = vi.fn(async () => undefined);

    await moveGlobalLibraryFiles({
      allowedRoot: fixture.allowedRoot,
      destinationDirectory: fixture.destination,
      sources: [
        { itemId: 'asset-first', absolutePath: first },
        { itemId: 'asset-second', absolutePath: second },
      ],
      commit,
    });

    await expect(readFile(path.join(fixture.destination, 'first.png'), 'utf8')).resolves.toBe(
      'first',
    );
    await expect(readFile(path.join(fixture.destination, 'second.mp4'), 'utf8')).resolves.toBe(
      'second',
    );
    await expect(lstat(first)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(second)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(commit).toHaveBeenCalledWith([
      expect.objectContaining({ itemId: 'asset-first' }),
      expect.objectContaining({ itemId: 'asset-second' }),
    ]);
  });

  it('rejects a destination outside the authorized root', async () => {
    const fixture = await createFixture();
    const outside = path.join(fixture.root, 'outside');
    const source = path.join(fixture.source, 'shot.png');
    await mkdir(outside);
    await writeFile(source, 'shot');

    await expect(
      moveGlobalLibraryFiles({
        allowedRoot: fixture.allowedRoot,
        destinationDirectory: outside,
        sources: [{ itemId: 'asset-shot', absolutePath: source }],
      }),
    ).rejects.toThrow('outside the authorized owner root');
    await expect(readFile(source, 'utf8')).resolves.toBe('shot');
  });

  it('rejects existing targets and duplicate target names before moving files', async () => {
    const fixture = await createFixture();
    const firstDirectory = path.join(fixture.allowedRoot, 'first');
    const secondDirectory = path.join(fixture.allowedRoot, 'second');
    await mkdir(firstDirectory);
    await mkdir(secondDirectory);
    const first = path.join(firstDirectory, 'shot.png');
    const second = path.join(secondDirectory, 'shot.png');
    await writeFile(first, 'first');
    await writeFile(second, 'second');
    await writeFile(path.join(fixture.destination, 'existing.png'), 'existing');
    const existingSource = path.join(fixture.source, 'existing.png');
    await writeFile(existingSource, 'source');

    await expect(
      moveGlobalLibraryFiles({
        allowedRoot: fixture.allowedRoot,
        destinationDirectory: fixture.destination,
        sources: [{ itemId: 'asset-existing', absolutePath: existingSource }],
      }),
    ).rejects.toThrow('target already exists');
    await expect(
      moveGlobalLibraryFiles({
        allowedRoot: fixture.allowedRoot,
        destinationDirectory: fixture.destination,
        sources: [
          { itemId: 'asset-first', absolutePath: first },
          { itemId: 'asset-second', absolutePath: second },
        ],
      }),
    ).rejects.toThrow("target name 'shot.png' is duplicated");
    await expect(readFile(first, 'utf8')).resolves.toBe('first');
    await expect(readFile(second, 'utf8')).resolves.toBe('second');
  });

  it('rejects symbolic-link sources without changing their targets', async () => {
    const fixture = await createFixture();
    const target = path.join(fixture.source, 'target.png');
    const linked = path.join(fixture.source, 'linked.png');
    await writeFile(target, 'target');
    await symlink(target, linked);

    await expect(
      moveGlobalLibraryFiles({
        allowedRoot: fixture.allowedRoot,
        destinationDirectory: fixture.destination,
        sources: [{ itemId: 'asset-linked', absolutePath: linked }],
      }),
    ).rejects.toThrow('is not an authorized file');
    await expect(readFile(target, 'utf8')).resolves.toBe('target');
    await expect(lstat(linked)).resolves.toMatchObject({});
  });

  it.runIf(process.platform !== 'win32')(
    'rolls back earlier files when a later filesystem step fails',
    async () => {
      const fixture = await createFixture();
      const protectedDirectory = path.join(fixture.allowedRoot, 'protected');
      const first = path.join(fixture.source, 'first.png');
      const second = path.join(protectedDirectory, 'second.png');
      await mkdir(protectedDirectory);
      await writeFile(first, 'first');
      await writeFile(second, 'second');
      await chmod(protectedDirectory, 0o555);

      try {
        await expect(
          moveGlobalLibraryFiles({
            allowedRoot: fixture.allowedRoot,
            destinationDirectory: fixture.destination,
            sources: [
              { itemId: 'asset-first', absolutePath: first },
              { itemId: 'asset-second', absolutePath: second },
            ],
          }),
        ).rejects.toThrow("could not move item 'asset-second'");
      } finally {
        await chmod(protectedDirectory, 0o700);
      }

      await expect(readFile(first, 'utf8')).resolves.toBe('first');
      await expect(readFile(second, 'utf8')).resolves.toBe('second');
      await expect(lstat(path.join(fixture.destination, 'first.png'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await expect(lstat(path.join(fixture.destination, 'second.png'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    },
  );

  it('rolls back every file when metadata commit fails', async () => {
    const fixture = await createFixture();
    const first = path.join(fixture.source, 'first.png');
    const second = path.join(fixture.source, 'second.png');
    await writeFile(first, 'first');
    await writeFile(second, 'second');

    await expect(
      moveGlobalLibraryFiles({
        allowedRoot: fixture.allowedRoot,
        destinationDirectory: fixture.destination,
        sources: [
          { itemId: 'asset-first', absolutePath: first },
          { itemId: 'asset-second', absolutePath: second },
        ],
        commit: async () => {
          throw new Error('membership commit failed');
        },
      }),
    ).rejects.toThrow('membership commit failed');

    await expect(readFile(first, 'utf8')).resolves.toBe('first');
    await expect(readFile(second, 'utf8')).resolves.toBe('second');
    await expect(lstat(path.join(fixture.destination, 'first.png'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(lstat(path.join(fixture.destination, 'second.png'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});

async function createFixture(): Promise<{
  readonly root: string;
  readonly allowedRoot: string;
  readonly source: string;
  readonly destination: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'openneko-library-move-'));
  temporaryRoots.push(root);
  const allowedRoot = path.join(root, 'library');
  const source = path.join(allowedRoot, 'source');
  const destination = path.join(allowedRoot, 'destination');
  await mkdir(source, { recursive: true });
  await mkdir(destination);
  return { root, allowedRoot, source, destination };
}
