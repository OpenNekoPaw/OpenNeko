import * as nodeFs from 'node:fs/promises';
import * as nodeOs from 'node:os';
import * as nodePath from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CutMediaImportError,
  CutWorkspaceMediaImporter,
  type CutMediaImportFileSystem,
} from './CutWorkspaceMediaImporter';

describe('CutWorkspaceMediaImporter', () => {
  it('keeps workspace media in place without creating an import directory', async () => {
    const fixture = await createFixture();
    const source = nodePath.join(fixture.workspace, 'cases', 'shot.mp4');
    await nodeFs.mkdir(nodePath.dirname(source), { recursive: true });
    await nodeFs.writeFile(source, 'workspace media');

    const importer = await CutWorkspaceMediaImporter.create(fixture.workspace);
    const prepared = await importer.prepare(fixture.document, source);

    expect(prepared).toEqual({
      copied: false,
      filePath: await nodeFs.realpath(source),
      workspaceRelativePath: 'cases/shot.mp4',
    });
    await expect(nodeFs.stat(nodePath.join(fixture.project, 'media'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('atomically copies workspace-external media beside the OTIO document', async () => {
    const fixture = await createFixture();
    const source = nodePath.join(fixture.root, 'outside', 'shot.mp4');
    await nodeFs.mkdir(nodePath.dirname(source), { recursive: true });
    await nodeFs.writeFile(source, 'external media');

    const importer = await CutWorkspaceMediaImporter.create(fixture.workspace);
    const prepared = await importer.prepare(fixture.document, source);

    expect(prepared.copied).toBe(true);
    expect(prepared.workspaceRelativePath).toBe('projects/demo/media/shot.mp4');
    expect(await nodeFs.readFile(prepared.filePath, 'utf8')).toBe('external media');
    expect((await nodeFs.readdir(nodePath.dirname(prepared.filePath))).sort()).toEqual([
      'shot.mp4',
    ]);
  });

  it('allocates a suffix instead of overwriting an existing imported file', async () => {
    const fixture = await createFixture();
    const source = nodePath.join(fixture.root, 'outside', 'shot.mp4');
    const importDirectory = nodePath.join(fixture.project, 'media');
    await nodeFs.mkdir(nodePath.dirname(source), { recursive: true });
    await nodeFs.mkdir(importDirectory, { recursive: true });
    await nodeFs.writeFile(source, 'new media');
    await nodeFs.writeFile(nodePath.join(importDirectory, 'shot.mp4'), 'existing media');

    const importer = await CutWorkspaceMediaImporter.create(fixture.workspace);
    const prepared = await importer.prepare(fixture.document, source);

    expect(nodePath.basename(prepared.filePath)).toBe('shot-2.mp4');
    expect(await nodeFs.readFile(nodePath.join(importDirectory, 'shot.mp4'), 'utf8')).toBe(
      'existing media',
    );
    expect(await nodeFs.readFile(prepared.filePath, 'utf8')).toBe('new media');
  });

  it('rejects directories and an import directory that escapes through a symlink', async () => {
    const fixture = await createFixture();
    const sourceDirectory = nodePath.join(fixture.root, 'outside');
    await nodeFs.mkdir(sourceDirectory, { recursive: true });
    const importer = await CutWorkspaceMediaImporter.create(fixture.workspace);

    await expect(importer.prepare(fixture.document, sourceDirectory)).rejects.toMatchObject({
      code: 'invalid-source',
    });

    const externalImportDirectory = nodePath.join(fixture.root, 'external-imports');
    await nodeFs.mkdir(externalImportDirectory);
    await nodeFs.symlink(externalImportDirectory, nodePath.join(fixture.project, 'media'));
    const source = nodePath.join(fixture.root, 'shot.mp4');
    await nodeFs.writeFile(source, 'external media');
    await expect(importer.prepare(fixture.document, source)).rejects.toMatchObject({
      code: 'workspace-escape',
    });
  });

  it('removes staging when publication fails and can discard an uncommitted copy', async () => {
    const fixture = await createFixture();
    const source = nodePath.join(fixture.root, 'outside', 'shot.mp4');
    await nodeFs.mkdir(nodePath.dirname(source), { recursive: true });
    await nodeFs.writeFile(source, 'external media');
    const failingFileSystem: CutMediaImportFileSystem = {
      realpath: (filePath) => nodeFs.realpath(filePath),
      stat: (filePath) => nodeFs.stat(filePath),
      mkdir: (filePath, options) => nodeFs.mkdir(filePath, options),
      copyFile: (from, to, mode) => nodeFs.copyFile(from, to, mode),
      link: async () => {
        throw Object.assign(new Error('publish failed'), { code: 'EIO' });
      },
      rm: (filePath, options) => nodeFs.rm(filePath, options),
    };
    const failingImporter = await CutWorkspaceMediaImporter.create(
      fixture.workspace,
      failingFileSystem,
    );

    await expect(failingImporter.prepare(fixture.document, source)).rejects.toBeInstanceOf(
      CutMediaImportError,
    );
    expect(await nodeFs.readdir(nodePath.join(fixture.project, 'media'))).toEqual([]);

    const importer = await CutWorkspaceMediaImporter.create(fixture.workspace);
    const prepared = await importer.prepare(fixture.document, source);
    await importer.discard(prepared);
    await expect(nodeFs.stat(prepared.filePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rolls back the published target and retries a failed staging cleanup', async () => {
    const fixture = await createFixture();
    const source = nodePath.join(fixture.root, 'outside', 'shot.mp4');
    await nodeFs.mkdir(nodePath.dirname(source), { recursive: true });
    await nodeFs.writeFile(source, 'external media');
    let stagingCleanupAttempts = 0;
    const cleanupFailingFileSystem: CutMediaImportFileSystem = {
      realpath: (filePath) => nodeFs.realpath(filePath),
      stat: (filePath) => nodeFs.stat(filePath),
      mkdir: (filePath, options) => nodeFs.mkdir(filePath, options),
      copyFile: (from, to, mode) => nodeFs.copyFile(from, to, mode),
      link: (from, to) => nodeFs.link(from, to),
      rm: async (filePath, options) => {
        if (filePath.endsWith('.tmp') && stagingCleanupAttempts === 0) {
          stagingCleanupAttempts += 1;
          throw Object.assign(new Error('transient cleanup failure'), { code: 'EIO' });
        }
        await nodeFs.rm(filePath, options);
      },
    };
    const importer = await CutWorkspaceMediaImporter.create(
      fixture.workspace,
      cleanupFailingFileSystem,
    );

    await expect(importer.prepare(fixture.document, source)).rejects.toMatchObject({
      code: 'copy-failed',
    });
    expect(await nodeFs.readdir(nodePath.join(fixture.project, 'media'))).toEqual([]);
    expect(stagingCleanupAttempts).toBe(1);
  });
});

async function createFixture(): Promise<{
  readonly root: string;
  readonly workspace: string;
  readonly project: string;
  readonly document: string;
}> {
  const root = await nodeFs.mkdtemp(nodePath.join(nodeOs.tmpdir(), 'neko-cut-import-'));
  const workspace = nodePath.join(root, 'workspace');
  const project = nodePath.join(workspace, 'projects', 'demo');
  const document = nodePath.join(project, 'edit.otio');
  await nodeFs.mkdir(project, { recursive: true });
  await nodeFs.writeFile(document, '{}');
  return { root, workspace, project, document };
}
