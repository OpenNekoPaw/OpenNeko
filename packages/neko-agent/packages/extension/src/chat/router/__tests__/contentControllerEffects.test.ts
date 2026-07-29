import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { createVSCodeContentControllerEffects } from '../contentControllerEffects';
import type { VSCodeAgentHostControllerDeps } from '../types';

vi.mock('vscode', async () => await import('../../../__mocks__/vscode'));

function createDeps(): VSCodeAgentHostControllerDeps {
  return {
    webview: { postMessage: vi.fn() },
    messages: { searchProjectFiles: vi.fn() },
    fileOperationHandler: {
      handleOpenFile: vi.fn(),
      handleRevealDocumentLocator: vi.fn(),
      handleRevealFile: vi.fn(),
      handleOpenUrl: vi.fn(),
      handleDownloadSvg: vi.fn(),
    },
  } as unknown as VSCodeAgentHostControllerDeps;
}

describe('VS Code content controller effects', () => {
  it('maps project search and file operations to the existing Host owners', async () => {
    const deps = createDeps();
    const effects = createVSCodeContentControllerEffects(deps);
    const context = {} as never;
    const contentLocator = { kind: 'workspace-file' as const, path: 'docs/guide.md' };

    await effects.searchProjectFiles(
      { filter: 'guide', conversationId: 'conversation-1' },
      context,
    );
    await effects.openFile({ contentLocator, options: { preview: true } }, context);
    await effects.revealFile(contentLocator, context);
    await effects.openExternalUrl('https://example.com', context);
    await effects.downloadSvg({ svg: '<svg />', filename: 'diagram.svg' }, context);

    expect(deps.messages?.searchProjectFiles).toHaveBeenCalledWith(
      deps.webview,
      'guide',
      'conversation-1',
      {},
    );
    expect(deps.fileOperationHandler.handleOpenFile).toHaveBeenCalledWith(contentLocator);
    expect(deps.fileOperationHandler.handleRevealFile).toHaveBeenCalledWith(contentLocator);
    expect(deps.fileOperationHandler.handleOpenUrl).toHaveBeenCalledWith('https://example.com');
    expect(deps.fileOperationHandler.handleDownloadSvg).toHaveBeenCalledWith(
      '<svg />',
      'diagram.svg',
    );
  });

  it('fails visibly when project search has no runtime handler', () => {
    const deps = createDeps();
    deps.messages = undefined;
    const effects = createVSCodeContentControllerEffects(deps);

    expect(() =>
      effects.searchProjectFiles(
        { filter: 'guide', conversationId: 'conversation-1' },
        {} as never,
      ),
    ).toThrow('Agent project search handler is unavailable.');
  });

  it('keeps media-library and canvas reveal commands in the VS Code adapter', async () => {
    const deps = createDeps();
    const effects = createVSCodeContentControllerEffects(deps);
    vi.mocked(vscode.commands.executeCommand).mockClear();

    await effects.revealContextSource(
      {
        type: 'revealContextSource',
        contextType: 'media',
        contextId: 'media-1',
        contentLocator: {
          kind: 'workspace-file',
          path: 'neko/assets/References/hero.png',
        },
        navigationData: { partition: 'media-library' },
      },
      {} as never,
    );
    await effects.revealContextSource(
      {
        type: 'revealContextSource',
        contextType: 'canvas-node',
        contextId: 'node-1',
        navigationData: { nodeId: 'node-1' },
      },
      {} as never,
    );

    expect(vscode.commands.executeCommand).toHaveBeenNthCalledWith(
      1,
      'neko.assets.revealMediaLibraryFile',
      'neko/assets/References/hero.png',
    );
    expect(vscode.commands.executeCommand).toHaveBeenNthCalledWith(
      2,
      'neko.canvas.selectNodeFromOutline',
      'node-1',
    );
  });

  it('rejects a context source that has no supported Host locator', async () => {
    const effects = createVSCodeContentControllerEffects(createDeps());

    await expect(
      effects.revealContextSource(
        {
          type: 'revealContextSource',
          contextType: 'entity',
          contextId: 'entity-1',
        },
        {} as never,
      ),
    ).rejects.toThrow("Cannot reveal context source 'entity-1' without a supported Host locator.");
  });
});
