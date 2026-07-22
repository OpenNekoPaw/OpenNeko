import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createNodeHostAdapter } from '../node-host-adapter';
import { createNodeWorkspaceContentHostAdapter } from '../node-workspace-content-host';

const createdPaths: string[] = [];

afterEach(() => {
  for (const target of createdPaths.splice(0).reverse()) {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

describe('createNodeHostAdapter', () => {
  it('projects workspace roots, storage layout, and path variables', async () => {
    const workspaceRoot = createTempDir();
    const homedir = createTempDir();
    const host = createNodeHostAdapter({ workDir: workspaceRoot, homedir });

    const workspace = await host.workspace.getWorkspace();

    expect(workspace.workspaceRoot).toBe(path.resolve(workspaceRoot));
    expect(workspace.storageLayout?.project.local.root).toBe(
      path.join(path.resolve(workspaceRoot), '.neko'),
    );
    expect(workspace.storageLayout?.global.root).toBe(path.join(path.resolve(homedir), '.neko'));
    expect(workspace.pathVariables?.get('A')).toBeUndefined();
    expect(workspace.pathVariables?.get('WORKSPACE')).toBe(path.resolve(workspaceRoot));
    expect(workspace.pathVariables?.get('PROJECT')).toBe(path.resolve(workspaceRoot));
    expect(workspace.pathVariables?.get('NEKO_HOME')).toBe(
      path.join(path.resolve(homedir), '.neko'),
    );
    expect(workspace.trust).toBe('trusted');
  });

  it('keeps media library variables out of the base host adapter', async () => {
    const workspaceRoot = createTempDir();
    const mediaRoot = createTempDir();
    fs.mkdirSync(path.join(workspaceRoot, 'neko'), { recursive: true });
    fs.writeFileSync(
      path.join(workspaceRoot, 'neko', 'settings.json'),
      JSON.stringify({
        mediaLibraries: [{ name: 'Assets', path: mediaRoot, variable: 'ASSETS' }],
      }),
      'utf8',
    );

    const host = createNodeHostAdapter({ workDir: workspaceRoot });
    const workspace = await host.workspace.getWorkspace();

    expect(workspace.pathVariables?.get('ASSETS')).toBeUndefined();
  });

  it('projects workspace-linked media libraries without adding path variables or read roots', async () => {
    const workspaceRoot = createTempDir();
    const homedir = createTempDir();
    const mediaRoot = createTempDir();
    const localMediaRoot = createTempDir();
    const assetsRoot = path.join(workspaceRoot, 'neko', 'assets');
    fs.mkdirSync(assetsRoot, { recursive: true });
    fs.symlinkSync(mediaRoot, path.join(assetsRoot, 'Assets'), directoryLinkType());
    fs.symlinkSync(localMediaRoot, path.join(assetsRoot, 'Local'), directoryLinkType());

    const host = createNodeWorkspaceContentHostAdapter({ workDir: workspaceRoot, homedir });
    const workspace = await host.workspace.getWorkspace();

    expect(workspace.pathVariables?.get('ASSETS')).toBeUndefined();
    expect(workspace.pathVariables?.get('LOCAL')).toBeUndefined();
    expect(workspace.pathVariables?.get('WORKSPACE')).toBe(path.resolve(workspaceRoot));
    const contentPolicy = await host.contentPolicy?.getSnapshot();
    expect(contentPolicy).toMatchObject({
      mediaLibraries: [
        { name: 'Assets', workspacePath: 'neko/assets/Assets', availability: 'available' },
        { name: 'Local', workspacePath: 'neko/assets/Local', availability: 'available' },
      ],
      authorizedReadRoots: [path.resolve(workspaceRoot)],
    });
    expect(host.paths.resolvePath({ path: 'neko/assets/Assets/epub/book.epub' })).toEqual({
      type: 'local',
      path: path.join(path.resolve(workspaceRoot), 'neko', 'assets', 'Assets', 'epub', 'book.epub'),
    });
  });

  it('resolves and contracts workspace paths with TUI variables', () => {
    const workspaceRoot = createTempDir();
    const homedir = createTempDir();
    const host = createNodeHostAdapter({ workDir: workspaceRoot, homedir });

    expect(host.paths.resolvePath({ path: '${WORKSPACE}/books/book.epub' })).toEqual({
      type: 'local',
      path: path.join(path.resolve(workspaceRoot), 'books', 'book.epub'),
    });
    expect(host.paths.resolvePath({ path: 'relative/file.txt' })).toEqual({
      type: 'local',
      path: path.join(path.resolve(workspaceRoot), 'relative/file.txt'),
    });
    expect(
      host.paths.contractPath({ absolutePath: path.join(workspaceRoot, 'shots', 'a.png') }),
    ).toBe('${WORKSPACE}/shots/a.png');
  });

  it('implements filesystem primitives with explicit file types', async () => {
    const workspaceRoot = createTempDir();
    const host = createNodeHostAdapter({ workDir: workspaceRoot });
    const dir = path.join(workspaceRoot, 'nested');
    const filePath = path.join(dir, 'note.txt');

    await host.files.createDirectory(dir);
    await host.files.writeText(filePath, 'hello');

    await expect(host.files.readText(filePath)).resolves.toBe('hello');
    await expect(host.files.readBytes(filePath)).resolves.toEqual(Buffer.from('hello'));
    await expect(host.files.stat(filePath)).resolves.toMatchObject({
      type: 'file',
      sizeBytes: 5,
    });
    await expect(host.files.readDirectory(dir)).resolves.toEqual([
      { name: 'note.txt', type: 'file' },
    ]);

    await host.files.delete(filePath);
    await expect(host.files.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('denies Agent direct access to managed .neko storage', async () => {
    const workspaceRoot = createTempDir();
    const host = createNodeHostAdapter({ workDir: workspaceRoot });
    const managedPath = path.join(workspaceRoot, '.neko', 'memory.md');

    expect(
      await host.accessPolicy?.decide({
        actor: 'agent',
        operation: 'read',
        path: managedPath,
      }),
    ).toMatchObject({
      allowed: false,
      diagnostic: {
        code: 'host-access-denied-managed-storage',
        severity: 'error',
      },
    });
    expect(
      await host.accessPolicy?.decide({
        actor: 'agent',
        operation: 'write',
        scope: 'workspace-cache',
      }),
    ).toMatchObject({ allowed: false });
    expect(
      await host.accessPolicy?.decide({
        actor: 'client',
        operation: 'write',
        path: managedPath,
      }),
    ).toEqual({ allowed: true });
    expect(
      await host.accessPolicy?.decide({
        actor: 'domain-runtime',
        operation: 'write',
        path: managedPath,
      }),
    ).toEqual({ allowed: true });
  });

  it('keeps path containment checks rooted at the requested directory', () => {
    const workspaceRoot = createTempDir();
    const host = createNodeHostAdapter({ workDir: workspaceRoot });

    expect(
      host.paths.isInside({
        path: path.join(workspaceRoot, '.neko', 'memory.md'),
        root: path.join(workspaceRoot, '.neko'),
      }),
    ).toBe(true);
    expect(
      host.paths.isInside({
        path: path.join(workspaceRoot, '.neko-other', 'memory.md'),
        root: path.join(workspaceRoot, '.neko'),
      }),
    ).toBe(false);
  });
});

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-node-host-'));
  createdPaths.push(dir);
  return dir;
}

function directoryLinkType(): 'dir' | 'junction' {
  return process.platform === 'win32' ? 'junction' : 'dir';
}
