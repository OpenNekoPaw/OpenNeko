import { describe, expect, it, vi } from 'vitest';
import {
  authorizeWorkspaceContainedPath,
  authorizeWorkspaceReadablePath,
  type WorkspacePathGuardFileSystem,
} from './workspace-path-guard';

describe('workspace path authorization', () => {
  it('allows a readable path whose physical target is outside the Workspace', async () => {
    const fileSystem = createFileSystem({
      '/workspace/linked/file.txt': '/external/file.txt',
    });

    await expect(
      authorizeWorkspaceReadablePath({
        workspaceRoot: '/workspace',
        requestedPath: '/workspace/linked/file.txt',
        fs: fileSystem,
      }),
    ).resolves.toEqual({ authorized: true });
  });

  it('keeps the contained writer authorization strict for the same physical target', async () => {
    const fileSystem = createFileSystem({
      '/workspace': '/workspace',
      '/workspace/linked/file.txt': '/external/file.txt',
    });

    await expect(
      authorizeWorkspaceContainedPath({
        workspaceRoot: '/workspace',
        requestedPath: '/workspace/linked/file.txt',
        fs: fileSystem,
      }),
    ).resolves.toMatchObject({
      authorized: false,
      diagnostic: { code: 'unmanaged-symlink' },
    });
  });

  it('rejects a lexically outside path before resolving its target', async () => {
    const realpath = vi.fn<WorkspacePathGuardFileSystem['realpath']>();

    await expect(
      authorizeWorkspaceReadablePath({
        workspaceRoot: '/workspace',
        requestedPath: '/external/file.txt',
        fs: { lstat: vi.fn(), realpath },
      }),
    ).resolves.toMatchObject({
      authorized: false,
      diagnostic: { code: 'invalid-workspace-path' },
    });
    expect(realpath).not.toHaveBeenCalled();
  });

  it('projects permission denial without exposing a physical target', async () => {
    const denied = Object.assign(new Error('denied'), { code: 'EACCES' });
    const fileSystem: WorkspacePathGuardFileSystem = {
      lstat: vi.fn(),
      realpath: vi.fn().mockRejectedValue(denied),
    };

    const result = await authorizeWorkspaceReadablePath({
      workspaceRoot: '/workspace',
      requestedPath: '/workspace/neko/assets/Library/secret.txt',
      fs: fileSystem,
    });

    expect(result).toMatchObject({
      authorized: false,
      diagnostic: {
        code: 'library-permission-denied',
        workspacePath: 'neko/assets/Library/secret.txt',
        libraryName: 'Library',
      },
    });
    expect(JSON.stringify(result)).not.toContain('/external');
  });
});

function createFileSystem(
  realpaths: Readonly<Record<string, string>>,
): WorkspacePathGuardFileSystem {
  return {
    lstat: vi.fn(),
    realpath: vi.fn(async (filePath) => {
      const resolved = realpaths[filePath];
      if (!resolved) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return resolved;
    }),
  };
}
