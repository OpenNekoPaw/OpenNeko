import { mkdtemp, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ILogger } from '@neko/shared/logger';
import { createElectronNekoHostPorts } from './electron-host-ports';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { force: true, recursive: true });
  }
});

describe('ElectronNekoHostPorts', () => {
  it('projects an Electron host without inventing a workspace', async () => {
    const root = await createTemporaryRoot();
    const host = createHost(root);

    expect(await host.environment.getHostIdentity()).toMatchObject({
      kind: 'electron',
      ui: 'graphical',
    });
    expect(await host.workspace.getWorkspace()).toEqual({
      pathVariables: new Map([
        ['HOME', root],
        ['NEKO_HOME', path.join(root, '.openneko')],
      ]),
      trust: 'unknown',
    });
    expect(() => host.paths.resolvePath({ path: 'relative.txt' })).toThrow('without a workspace');
  });

  it('uses variable-backed paths and real filesystem operations', async () => {
    const root = await createTemporaryRoot();
    const workspaceRoot = path.join(root, 'workspace');
    const host = createHost(root, workspaceRoot);
    await host.files.createDirectory(workspaceRoot);
    const filePath = path.join(workspaceRoot, 'hello.txt');

    await host.files.writeText(filePath, 'hello');

    await expect(host.files.readText(filePath)).resolves.toBe('hello');
    expect(host.paths.contractPath({ absolutePath: filePath })).toBe('${WORKSPACE}/hello.txt');
    expect(host.paths.resolvePath({ path: '${WORKSPACE}/hello.txt' })).toEqual({
      type: 'local',
      path: filePath,
    });
  });

  it('denies direct Agent access to managed storage', async () => {
    const root = await createTemporaryRoot();
    const workspaceRoot = path.join(root, 'workspace');
    const host = createHost(root, workspaceRoot);

    expect(
      await host.accessPolicy?.decide({
        actor: 'agent',
        operation: 'write',
        scope: 'workspace-local',
      }),
    ).toMatchObject({
      allowed: false,
      diagnostic: { code: 'desktop-host-access-denied-managed-storage' },
    });
    expect(
      await host.accessPolicy?.decide({
        actor: 'agent',
        operation: 'read',
        path: path.join(workspaceRoot, '.private', 'state.json'),
      }),
    ).toMatchObject({
      allowed: false,
      diagnostic: { code: 'desktop-host-access-denied-managed-storage' },
    });
  });
});

async function createTemporaryRoot(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'openneko-desktop-'));
  temporaryDirectories.push(directory);
  return directory;
}

function createHost(homedir: string, workspaceRoot?: string) {
  return createElectronNekoHostPorts({
    homedir,
    nekoHome: path.join(homedir, '.openneko'),
    logger: createLogger(),
    ...(workspaceRoot ? { workspaceRoot } : {}),
  });
}

function createLogger(): ILogger {
  return {
    source: 'test',
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => createLogger(),
    setLevel: vi.fn(),
  };
}
