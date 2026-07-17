import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { ProjectSemanticCoverageQuery } from '@neko/shared';
import {
  PROJECT_SEARCH_SEMANTIC_COVERAGE_COMMAND,
  registerProjectSearchService,
} from '../host-vscode/commands';

vi.mock('vscode', async () => await import('../testing/vscode'));
vi.mock('../host-vscode/compatAdapters', () => ({
  createCompatibilityProjectSearchAdapters: () => [],
}));

describe('project search commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.mocked(vscode.workspace.fs.stat).mockRejectedValue(
      Object.assign(new Error('missing'), {
        code: 'ENOENT',
      }),
    );
    setWorkspaceFolders([{ uri: { fsPath: '/workspace' }, name: 'w', index: 0 }]);
  });

  it('debounces text document refreshes into partition-scoped changes', async () => {
    const context = { subscriptions: [] as { dispose(): void }[] } as vscode.ExtensionContext;
    const service = registerProjectSearchService(context, {
      resolvePath: async (filePath) => filePath,
    });
    const refresh = vi.spyOn(service, 'refresh').mockResolvedValue(undefined);
    const listener = vi.mocked(vscode.workspace.onDidChangeTextDocument).mock.calls[0]?.[0];

    expect(listener).toBeDefined();
    listener?.({
      document: {
        languageId: 'nekostory',
        uri: vscode.Uri.file('/workspace/cases/test.fountain'),
      },
    } as any);
    listener?.({
      document: {
        languageId: 'nekostory',
        uri: vscode.Uri.file('/workspace/cases/test.fountain'),
      },
    } as any);

    await vi.advanceTimersByTimeAsync(399);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith(
      '/workspace',
      'document-change',
      expect.objectContaining({
        partition: 'story-symbols',
        changedRefs: expect.arrayContaining([
          expect.objectContaining({ filePath: '/workspace/cases/test.fountain' }),
        ]),
      }),
    );

    service.dispose();
    vi.useRealTimers();
  });

  it('watches unified entity fact files as creative entity changes', async () => {
    const context = { subscriptions: [] as { dispose(): void }[] } as vscode.ExtensionContext;
    const service = registerProjectSearchService(context, {
      resolvePath: async (filePath) => filePath,
    });
    const refresh = vi.spyOn(service, 'refresh').mockResolvedValue(undefined);
    const entityWatcher = watcherForPattern('**/neko/entities/*.json');
    const onDidChange = vi.mocked(entityWatcher?.onDidChange).mock.calls[0]?.[0];

    expect(onDidChange).toBeDefined();
    onDidChange?.(vscode.Uri.file('/workspace/neko/entities/scenes.json'));

    await vi.advanceTimersByTimeAsync(299);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(refresh).toHaveBeenCalledWith(
      '/workspace',
      'file-change',
      expect.objectContaining({
        partition: 'creative-entities',
        changedRefs: expect.arrayContaining([
          expect.objectContaining({ filePath: '/workspace/neko/entities/scenes.json' }),
        ]),
      }),
    );

    service.dispose();
  });

  it('does not watch the retired generated asset JSON index', () => {
    const context = { subscriptions: [] as { dispose(): void }[] } as vscode.ExtensionContext;

    const service = registerProjectSearchService(context, {
      resolvePath: async (filePath) => filePath,
    });

    expect(vscode.workspace.createFileSystemWatcher).not.toHaveBeenCalledWith(
      '**/.neko/.cache/generated/index.json',
    );
    service.dispose();
  });

  it('refreshes the nearest marked Neko project instead of the parent workspace', async () => {
    setWorkspaceFolders([{ uri: { fsPath: '/workspace' }, name: 'w', index: 0 }]);
    vi.mocked(vscode.workspace.fs.stat).mockImplementation(async (uri: unknown) => {
      const filePath = isUriLike(uri) ? uri.fsPath : '';
      if (filePath === '/workspace/neko-test/neko/settings.json') {
        return { type: vscode.FileType.File } as never;
      }
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    });
    const context = { subscriptions: [] as { dispose(): void }[] } as vscode.ExtensionContext;
    const service = registerProjectSearchService(context, {
      resolvePath: async (filePath) => filePath,
    });
    const refresh = vi.spyOn(service, 'refresh').mockResolvedValue(undefined);
    const entityWatcher = watcherForPattern('**/neko/entities/*.json');
    const onDidChange = vi.mocked(entityWatcher?.onDidChange).mock.calls[0]?.[0];

    expect(onDidChange).toBeDefined();
    onDidChange?.(vscode.Uri.file('/workspace/neko-test/neko/entities/scenes.json'));

    await vi.advanceTimersByTimeAsync(300);

    expect(refresh).toHaveBeenCalledWith(
      '/workspace/neko-test',
      'file-change',
      expect.objectContaining({
        partition: 'creative-entities',
        changedRefs: expect.arrayContaining([
          expect.objectContaining({ filePath: '/workspace/neko-test/neko/entities/scenes.json' }),
        ]),
      }),
    );

    service.dispose();
  });

  it('registers semantic coverage command through the host facade and sanitizes invalid provider output', async () => {
    const context = { subscriptions: [] as { dispose(): void }[] } as vscode.ExtensionContext;
    const query = makeCoverageQuery();
    const service = registerProjectSearchService(context, {
      resolvePath: async (filePath) => filePath,
      semanticCoverageProviders: [
        {
          providerId: 'semantic.sidecar',
          querySemanticCoverage: vi.fn(async () => ({
            query,
            coverage: 'fresh' as const,
            freshness: 'fresh' as const,
            provider: {
              providerId: 'semantic.sidecar',
              sourceIdentity: '/workspace/.neko/semantic-index/comic/page-1.json',
            },
            projectRoot: '/workspace',
          })),
        },
      ],
    });
    const command = commandHandler(PROJECT_SEARCH_SEMANTIC_COVERAGE_COMMAND);

    expect(command).toBeDefined();
    const result = await command?.(query);

    expect(result).toEqual(
      expect.objectContaining({
        coverage: 'failed',
        freshness: 'failed',
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: 'semantic-coverage-invalid-provider-result' }),
        ]),
        projectRoot: '/workspace',
      }),
    );
    expect(JSON.stringify(result)).not.toContain('/workspace/.neko/semantic-index');

    service.dispose();
  });
});

function setWorkspaceFolders(
  folders: readonly {
    readonly uri: { readonly fsPath: string };
    readonly name: string;
    readonly index: number;
  }[],
): void {
  (
    vscode.workspace as unknown as {
      workspaceFolders: typeof folders;
    }
  ).workspaceFolders = folders;
}

function watcherForPattern(pattern: string): {
  readonly onDidChange: ReturnType<typeof vi.fn>;
} {
  const watcherIndex = vi
    .mocked(vscode.workspace.createFileSystemWatcher)
    .mock.calls.findIndex((call) => call[0] === pattern);
  return vi.mocked(vscode.workspace.createFileSystemWatcher).mock.results[watcherIndex]?.value as {
    readonly onDidChange: ReturnType<typeof vi.fn>;
  };
}

function isUriLike(value: unknown): value is { readonly fsPath?: string } {
  return typeof value === 'object' && value !== null && 'fsPath' in value;
}

function commandHandler(commandId: string): ((...args: unknown[]) => Promise<unknown>) | undefined {
  return vi
    .mocked(vscode.commands.registerCommand)
    .mock.calls.find((call) => call[0] === commandId)?.[1] as
    ((...args: unknown[]) => Promise<unknown>) | undefined;
}

function makeCoverageQuery(): ProjectSemanticCoverageQuery {
  return {
    sourceRef: {
      kind: 'document',
      source: { kind: 'file', projectRelativePath: 'docs/comic.pdf' },
    },
    range: {
      startLine: 1,
      endLine: 10,
    },
    analysisKind: 'ocr',
    projectRoot: '/workspace',
  };
}
