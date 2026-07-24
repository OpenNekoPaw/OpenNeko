import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  VSCodeLocalResourceAccessService,
  createDefaultLocalResourceAccessService,
  createExtensionAssetLocalResourceRootProvider,
  createExtensionCacheLocalResourceRootProvider,
  createStaticLocalResourceRootProvider,
  createWorkspaceCacheLocalResourceRootProvider,
  createWorkspaceLocalResourceRootProvider,
  normalizeLocalFilePath,
  revokeWebviewLocalResourceAccess,
} from '../local-resource-access';

vi.mock('vscode', () => ({
  Uri: class Uri {
    static file(filePath: string) {
      return {
        scheme: 'file',
        fsPath: filePath,
        path: filePath,
        toString: () => `file://${filePath}`,
      };
    }

    static parse(value: string) {
      if (value.startsWith('file://')) {
        const filePath = value.slice('file://'.length);
        return {
          scheme: 'file',
          fsPath: filePath,
          path: filePath,
          toString: () => value,
        };
      }
      const schemeMatch = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(value);
      return {
        scheme: schemeMatch?.[1] ?? '',
        fsPath: value,
        path: value,
        toString: () => value,
      };
    }

    static joinPath(base: { fsPath: string }, ...segments: string[]) {
      const filePath = [base.fsPath, ...segments].join('/');
      return {
        scheme: 'file',
        fsPath: filePath,
        path: filePath,
        toString: () => `file://${filePath}`,
      };
    }
  },
  workspace: {
    workspaceFolders: [
      {
        uri: {
          scheme: 'file',
          fsPath: '/workspace',
          path: '/workspace',
          toString: () => 'file:///workspace',
        },
        name: 'workspace',
        index: 0,
      },
    ],
  },
  extensions: {
    getExtension: vi.fn(),
  },
  commands: {
    executeCommand: vi.fn(),
  },
}));

describe('VSCodeLocalResourceAccessService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aggregates and deduplicates extension, workspace, media library, and cache roots', async () => {
    const vscode = await import('vscode');
    const service = new VSCodeLocalResourceAccessService({
      rootProviders: [
        createExtensionAssetLocalResourceRootProvider(vscode.Uri.file('/ext'), 'dist', 'webview'),
        createWorkspaceLocalResourceRootProvider(() => vscode.workspace.workspaceFolders),
        createStaticLocalResourceRootProvider('media', 'media-library', [
          vscode.Uri.file('/assets'),
          vscode.Uri.file('/assets'),
        ]),
        createExtensionCacheLocalResourceRootProvider(
          { globalStorageUri: vscode.Uri.file('/global') } as never,
          'resources',
        ),
      ],
    });

    await expect(service.getLocalResourceRoots()).resolves.toEqual([
      expect.objectContaining({ fsPath: '/ext/dist/webview' }),
      expect.objectContaining({ fsPath: '/workspace' }),
      expect.objectContaining({ fsPath: '/assets' }),
      expect.objectContaining({ fsPath: '/global/resources' }),
    ]);
  });

  it('filters broad filesystem and system temp roots from aggregated roots', async () => {
    const vscode = await import('vscode');
    const tempChild = path.join(os.tmpdir(), 'neko-preview');
    const service = new VSCodeLocalResourceAccessService({
      rootProviders: [
        createStaticLocalResourceRootProvider('unsafe', 'feature', [
          vscode.Uri.file('/'),
          vscode.Uri.file(os.homedir()),
          vscode.Uri.file(os.tmpdir()),
          vscode.Uri.file(tempChild),
        ]),
      ],
    });

    const roots = await service.getLocalResourceRoots();

    expect(roots.map((root) => root.fsPath)).toEqual([]);
  });

  it('projects authorized local paths and preserves remote URLs', async () => {
    const vscode = await import('vscode');
    const webview = {
      options: {},
      asWebviewUri: vi.fn((uri: { fsPath: string }) => ({
        toString: () => `webview:${uri.fsPath}`,
      })),
    };
    const service = new VSCodeLocalResourceAccessService({
      rootProviders: [
        createStaticLocalResourceRootProvider('media', 'media-library', [
          vscode.Uri.file('/assets'),
        ]),
      ],
    });

    await expect(service.toWebviewUri(webview as never, '/assets/page.png')).resolves.toEqual({
      ok: true,
      kind: 'local',
      source: '/assets/page.png',
      uri: 'webview:/assets/page.png',
    });
    await expect(
      service.toWebviewUri(webview as never, 'https://example.test/a.png'),
    ).resolves.toEqual({
      ok: true,
      kind: 'remote',
      source: 'https://example.test/a.png',
      uri: 'https://example.test/a.png',
    });
  });

  it('keeps VSCode Webview projections extension-owned and separate from source identity', async () => {
    const vscode = await import('vscode');
    const webview = {
      options: {},
      asWebviewUri: vi.fn((uri: { fsPath: string }) => ({
        toString: () => `vscode-webview:${uri.fsPath}`,
      })),
    };
    const service = new VSCodeLocalResourceAccessService({
      rootProviders: [
        createStaticLocalResourceRootProvider('workspace', 'workspace', [
          vscode.Uri.file('/workspace'),
        ]),
      ],
    });

    const result = await service.toWebviewUri(webview as never, '/workspace/assets/image.png', {
      caller: 'vscode-resource-projection',
    });

    expect(result).toEqual({
      ok: true,
      kind: 'local',
      source: '/workspace/assets/image.png',
      uri: 'vscode-webview:/workspace/assets/image.png',
    });
    expect(webview.asWebviewUri).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: '/workspace/assets/image.png' }),
    );
  });

  it('returns unauthorized result and logs warning for local paths outside roots', async () => {
    const vscode = await import('vscode');
    const logger = { warn: vi.fn() };
    const service = new VSCodeLocalResourceAccessService({
      logger,
      rootProviders: [
        createStaticLocalResourceRootProvider('media', 'media-library', [
          vscode.Uri.file('/assets'),
        ]),
      ],
    });

    await expect(
      service.toWebviewUri({ asWebviewUri: vi.fn() } as never, '/other/page.png', {
        caller: 'test',
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'unauthorized',
      source: '/other/page.png',
      message: 'Local resource path is outside authorized roots.',
    });
    expect(logger.warn).toHaveBeenCalledWith('Local resource path is outside authorized roots', {
      path: '/other/page.png',
      caller: 'test',
    });
  });

  it('does not project system temp files even when a narrow temp child root is authorized', async () => {
    const vscode = await import('vscode');
    const webview = {
      asWebviewUri: vi.fn((uri: { fsPath: string }) => ({
        toString: () => `webview:${uri.fsPath}`,
      })),
    };
    const tempFile = path.join(os.tmpdir(), 'neko-random-preview', 'page.png');
    const service = new VSCodeLocalResourceAccessService({
      rootProviders: [
        createStaticLocalResourceRootProvider('temp', 'feature', [
          vscode.Uri.file(path.dirname(tempFile)),
        ]),
      ],
    });

    await expect(
      service.toWebviewUri(webview as never, tempFile, { caller: 'temp-test' }),
    ).resolves.toEqual({
      ok: false,
      reason: 'unauthorized',
      source: tempFile,
      message: 'Local resource path is in system temp and cannot be projected.',
    });
    expect(webview.asWebviewUri).not.toHaveBeenCalled();
  });

  it('rejects macOS var folders temp paths before Webview projection', async () => {
    const vscode = await import('vscode');
    const webview = {
      asWebviewUri: vi.fn((uri: { fsPath: string }) => ({
        toString: () => `webview:${uri.fsPath}`,
      })),
    };
    const tempFile =
      '/var/folders/26/b9fmn08x6mv2bcl771rnjyt80000gn/T/neko_epub_1vehc43/0001_moe-017905.jpg';
    const service = new VSCodeLocalResourceAccessService({
      rootProviders: [
        createStaticLocalResourceRootProvider('temp', 'feature', [vscode.Uri.file('/var/folders')]),
      ],
    });

    await expect(
      service.toWebviewUri(webview as never, tempFile, { caller: 'neko-agent.stream-tool-result' }),
    ).resolves.toEqual({
      ok: false,
      reason: 'unauthorized',
      source: tempFile,
      message: 'Local resource path is in system temp and cannot be projected.',
    });
    expect(webview.asWebviewUri).not.toHaveBeenCalled();
  });

  it('configures webview roots without dropping existing options', async () => {
    const vscode = await import('vscode');
    const webview = {
      options: { retainContextWhenHidden: true },
      asWebviewUri: vi.fn(),
    };
    const service = new VSCodeLocalResourceAccessService({
      rootProviders: [
        createStaticLocalResourceRootProvider('media', 'media-library', [
          vscode.Uri.file('/assets'),
        ]),
      ],
    });

    await service.configureWebview(webview as never, { enableScripts: true });

    expect(webview.options).toEqual({
      retainContextWhenHidden: true,
      enableScripts: true,
      localResourceRoots: [expect.objectContaining({ fsPath: '/assets' })],
    });
  });

  it('revokes webview roots without dropping unrelated options', async () => {
    const vscode = await import('vscode');
    const webview: Pick<vscode.Webview, 'options'> = {
      options: {
        enableScripts: true,
        enableCommandUris: true,
        localResourceRoots: [vscode.Uri.file('/assets')],
      },
    };

    revokeWebviewLocalResourceAccess(webview);

    expect(webview.options).toEqual({
      enableScripts: true,
      enableCommandUris: true,
      localResourceRoots: [],
    });
  });

  it('creates a synchronous projector from an authorized root snapshot', async () => {
    const vscode = await import('vscode');
    const logger = { warn: vi.fn() };
    const webview = {
      asWebviewUri: vi.fn((uri: { fsPath: string }) => ({
        toString: () => `webview:${uri.fsPath}`,
      })),
    };
    const service = new VSCodeLocalResourceAccessService({ logger });
    const project = service.createSyncProjector(webview as never, [vscode.Uri.file('/assets')], {
      caller: 'sync-test',
    });

    expect(project('/assets/page.png')).toBe('webview:/assets/page.png');
    expect(project('https://example.test/page.png')).toBe('https://example.test/page.png');
    expect(project('/other/page.png')).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith('Local resource path is outside authorized roots', {
      path: '/other/page.png',
      caller: 'sync-test',
    });
  });

  it('normalizes file URIs and rejects non-file URI schemes', () => {
    expect(normalizeLocalFilePath('file:///assets/page.png')).toBe('/assets/page.png');
    expect(normalizeLocalFilePath('asset://project/page.png')).toBeUndefined();
    expect(normalizeLocalFilePath('')).toBeUndefined();
  });

  it('keeps Host-private cache roots out of default Webview authorization', async () => {
    const vscode = await import('vscode');
    const service = createDefaultLocalResourceAccessService({
      extensionUri: vscode.Uri.file('/ext'),
      context: { globalStorageUri: vscode.Uri.file('/global') } as never,
      getWorkspaceFolders: () => vscode.workspace.workspaceFolders,
    });

    await expect(service.getLocalResourceRoots()).resolves.toEqual([
      expect.objectContaining({ fsPath: '/ext/dist/webview' }),
      expect.objectContaining({ fsPath: '/workspace' }),
    ]);
  });

  it('creates workspace cache roots from workspace folders', async () => {
    const vscode = await import('vscode');
    const provider = createWorkspaceCacheLocalResourceRootProvider(() => [
      { uri: vscode.Uri.file('/workspace-a') },
      { uri: vscode.Uri.file('/workspace-b') },
    ]);

    await expect(Promise.resolve(provider.getRoots())).resolves.toEqual([
      expect.objectContaining({
        uri: expect.objectContaining({ fsPath: '/workspace-a/.neko/.cache' }),
      }),
      expect.objectContaining({
        uri: expect.objectContaining({ fsPath: '/workspace-b/.neko/.cache' }),
      }),
    ]);
  });
});
