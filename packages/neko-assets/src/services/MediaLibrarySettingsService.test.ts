import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import { MediaLibrarySettingsService } from './MediaLibrarySettingsService';

const fsMock = vi.hoisted(() => {
  const files = new Map<string, string>();
  const readablePaths = new Set<string>();
  const directoryPaths = new Set<string>();

  return {
    files,
    readablePaths,
    directoryPaths,
    readFile: vi.fn(async (filePath: string) => {
      const content = files.get(filePath);
      if (content === undefined) {
        throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: 'ENOENT' });
      }
      return content;
    }),
    writeFile: vi.fn(async (filePath: string, content: string) => {
      files.set(filePath, content);
    }),
    mkdir: vi.fn(async () => undefined),
    access: vi.fn(async (filePath: string) => {
      if (!readablePaths.has(filePath)) {
        throw Object.assign(new Error(`EACCES: ${filePath}`), { code: 'EACCES' });
      }
    }),
    stat: vi.fn(async (filePath: string) => {
      if (!directoryPaths.has(filePath) && !readablePaths.has(filePath)) {
        throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: 'ENOENT' });
      }
      return {
        isDirectory: () => directoryPaths.has(filePath),
      };
    }),
  };
});

vi.mock('fs/promises', () => ({
  readFile: fsMock.readFile,
  writeFile: fsMock.writeFile,
  mkdir: fsMock.mkdir,
  access: fsMock.access,
  stat: fsMock.stat,
  constants: { R_OK: 4 },
}));

vi.mock('vscode', () => {
  class EventEmitter<T> {
    private readonly listeners = new Set<(event: T) => void>();

    readonly event = (listener: (event: T) => void) => {
      this.listeners.add(listener);
      return { dispose: () => this.listeners.delete(listener) };
    };

    fire(event: T): void {
      for (const listener of this.listeners) {
        listener(event);
      }
    }

    dispose(): void {
      this.listeners.clear();
    }
  }

  const disposable = () => ({ dispose: vi.fn() });

  return {
    EventEmitter,
    RelativePattern: vi.fn(function RelativePattern(base: string, pattern: string) {
      return { base, pattern };
    }),
    workspace: {
      createFileSystemWatcher: vi.fn(() => ({
        onDidChange: vi.fn(disposable),
        onDidCreate: vi.fn(disposable),
        onDidDelete: vi.fn(disposable),
        dispose: vi.fn(),
      })),
    },
  };
});

vi.mock('../utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

const workspaceRoot = '/workspace/project';
const settingsPath = path.join(workspaceRoot, 'neko', 'settings.json');
const localSettingsPath = path.join(workspaceRoot, '.neko', 'settings.local.json');

function writeJson(filePath: string, value: unknown): void {
  fsMock.files.set(filePath, JSON.stringify(value));
}

function markReadableDirectory(dirPath: string): void {
  fsMock.directoryPaths.add(dirPath);
  fsMock.readablePaths.add(dirPath);
}

describe('MediaLibrarySettingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsMock.files.clear();
    fsMock.readablePaths.clear();
    fsMock.directoryPaths.clear();
  });

  it('exports resolved enabled readable roots with local overrides applied', async () => {
    writeJson(settingsPath, {
      mediaLibraries: [
        { name: 'Enabled', path: '/libraries/enabled', variable: 'ENABLED' },
        { name: 'Disabled', path: '/libraries/disabled', variable: 'DISABLED', enabled: false },
        { name: 'Override', path: '/libraries/original', variable: 'OVERRIDE' },
        { name: 'Missing', path: '/libraries/missing', variable: 'MISSING' },
      ],
    });
    writeJson(localSettingsPath, {
      mediaLibraryOverrides: {
        OVERRIDE: '/local/override',
      },
    });
    markReadableDirectory('/libraries/enabled');
    markReadableDirectory('/libraries/disabled');
    markReadableDirectory('/local/override');

    const service = new MediaLibrarySettingsService(workspaceRoot);
    await service.load();

    await expect(service.getWebviewResourceRoots()).resolves.toEqual([
      path.resolve('/libraries/enabled'),
      path.resolve('/local/override'),
    ]);
    await expect(service.getResolvedLibraries()).resolves.toEqual([
      expect.objectContaining({
        variable: 'ENABLED',
        resolvedPath: '/libraries/enabled',
        enabled: true,
        accessible: true,
        overridden: false,
      }),
      expect.objectContaining({
        variable: 'DISABLED',
        resolvedPath: '/libraries/disabled',
        enabled: false,
        accessible: true,
        overridden: false,
      }),
      expect.objectContaining({
        variable: 'OVERRIDE',
        resolvedPath: '/local/override',
        enabled: true,
        accessible: true,
        overridden: true,
      }),
      expect.objectContaining({
        variable: 'MISSING',
        resolvedPath: '/libraries/missing',
        enabled: true,
        accessible: false,
        overridden: false,
      }),
    ]);

    service.dispose();
  });

  it('reopens shared and local settings from files without reading the user metadata database', async () => {
    writeJson(settingsPath, {
      mediaLibraries: [{ name: 'Team Library', path: '/libraries/team', variable: 'TEAM_LIBRARY' }],
    });
    writeJson(localSettingsPath, {
      mediaLibraryOverrides: { TEAM_LIBRARY: '/libraries/local' },
    });
    markReadableDirectory('/libraries/local');

    const first = new MediaLibrarySettingsService(workspaceRoot);
    await first.load();
    await expect(first.getResolvedLibraries()).resolves.toEqual([
      expect.objectContaining({
        variable: 'TEAM_LIBRARY',
        resolvedPath: '/libraries/local',
        overridden: true,
      }),
    ]);
    first.dispose();

    vi.mocked(fs.readFile).mockClear();
    const reopened = new MediaLibrarySettingsService(workspaceRoot);
    await reopened.load();

    expect(vi.mocked(fs.readFile).mock.calls.map(([filePath]) => filePath)).toEqual([
      settingsPath,
      localSettingsPath,
    ]);
    expect(vi.mocked(fs.readFile).mock.calls.flat().join('\n')).not.toContain('neko.db');
    await expect(reopened.getResolvedLibraries()).resolves.toEqual([
      expect.objectContaining({
        variable: 'TEAM_LIBRARY',
        resolvedPath: '/libraries/local',
        accessible: true,
        overridden: true,
      }),
    ]);
    reopened.dispose();
  });

  it('resolves workspace path variables before checking media library accessibility', async () => {
    writeJson(settingsPath, {
      mediaLibraries: [
        {
          name: 'Workspace Assets',
          path: '${WORKSPACE}/libraries/enabled',
          variable: 'ASSETS',
        },
      ],
    });
    markReadableDirectory(path.join(workspaceRoot, 'libraries', 'enabled'));

    const service = new MediaLibrarySettingsService(workspaceRoot);
    await service.load();

    await expect(service.getResolvedLibraries()).resolves.toEqual([
      expect.objectContaining({
        variable: 'ASSETS',
        resolvedPath: path.join(workspaceRoot, 'libraries', 'enabled'),
        accessible: true,
      }),
    ]);
    await expect(service.getPathVariableMap()).resolves.toEqual(
      new Map([['ASSETS', path.join(workspaceRoot, 'libraries', 'enabled')]]),
    );

    service.dispose();
  });

  it('validates readable directories before saving new libraries', async () => {
    writeJson(settingsPath, { mediaLibraries: [] });
    markReadableDirectory('/libraries/new');

    const service = new MediaLibrarySettingsService(workspaceRoot);
    const onDidChange = vi.fn();
    service.onDidChange(onDidChange);
    await service.load();

    await service.addLibrary({ name: 'New', path: '/libraries/new', variable: 'NEW' });

    expect(fs.stat).toHaveBeenCalledWith('/libraries/new');
    expect(fs.access).toHaveBeenCalledWith('/libraries/new', fs.constants.R_OK);
    expect(JSON.parse(fsMock.files.get(settingsPath) ?? '{}')).toEqual({
      mediaLibraries: [{ name: 'New', path: '/libraries/new', variable: 'NEW' }],
    });
    expect(onDidChange).toHaveBeenCalledWith([
      expect.objectContaining({ variable: 'NEW', accessible: true }),
    ]);

    fsMock.readablePaths.add('/not-a-directory');
    await expect(
      service.addLibrary({ name: 'File', path: '/not-a-directory', variable: 'FILE' }),
    ).rejects.toThrow('Media library path is not a directory');

    service.dispose();
  });

  it('validates readable directories before saving local overrides', async () => {
    writeJson(settingsPath, {
      mediaLibraries: [{ name: 'Library', path: '/libraries/original', variable: 'LIBRARY' }],
    });
    markReadableDirectory('/libraries/original');
    markReadableDirectory('/libraries/local');

    const service = new MediaLibrarySettingsService(workspaceRoot);
    const onDidChange = vi.fn();
    service.onDidChange(onDidChange);
    await service.load();

    await service.setLocalOverride('LIBRARY', '/libraries/local');

    expect(JSON.parse(fsMock.files.get(localSettingsPath) ?? '{}')).toEqual({
      mediaLibraryOverrides: { LIBRARY: '/libraries/local' },
    });
    expect(onDidChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        variable: 'LIBRARY',
        resolvedPath: '/libraries/local',
        accessible: true,
        overridden: true,
      }),
    ]);

    await expect(service.setLocalOverride('LIBRARY', '/missing')).rejects.toThrow('ENOENT');

    service.dispose();
  });

  it('fires root update notifications when libraries are added, removed, or overridden', async () => {
    writeJson(settingsPath, { mediaLibraries: [] });
    markReadableDirectory('/libraries/new');
    markReadableDirectory('/libraries/override');

    const service = new MediaLibrarySettingsService(workspaceRoot);
    const onDidChange = vi.fn();
    service.onDidChange(onDidChange);
    await service.load();

    await service.addLibrary({ name: 'New', path: '/libraries/new', variable: 'NEW' });
    await service.setLocalOverride('NEW', '/libraries/override');
    await service.removeLibrary('NEW');

    expect(onDidChange).toHaveBeenCalledTimes(3);
    expect(onDidChange).toHaveBeenNthCalledWith(1, [
      expect.objectContaining({ variable: 'NEW', resolvedPath: '/libraries/new' }),
    ]);
    expect(onDidChange).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({ variable: 'NEW', resolvedPath: '/libraries/override' }),
    ]);
    expect(onDidChange).toHaveBeenNthCalledWith(3, []);

    service.dispose();
  });
});
