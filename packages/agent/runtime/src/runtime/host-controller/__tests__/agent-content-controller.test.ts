import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { AgentWebviewToHostMessage } from '@neko/agent-contracts';
import {
  searchAgentWorkspaceMentions,
  tryHandleAgentContentControllerRoute,
  type AgentContentControllerEffectPort,
  type AgentHostRouteEffectContext,
} from '..';

function createContext(): AgentHostRouteEffectContext {
  return {
    identity: {
      hostKind: 'electron',
      applicationId: 'app-1',
      windowId: 'window-1',
      viewId: 'view-1',
      workspaceId: 'workspace-1',
      connectionId: 'connection-1',
    },
    post: vi.fn(),
  };
}

function createEffects(): AgentContentControllerEffectPort {
  return {
    searchProjectFiles: vi.fn(),
    openFile: vi.fn(),
    revealDocumentLocator: vi.fn(),
    revealFile: vi.fn(),
    openExternalUrl: vi.fn(),
    revealContextSource: vi.fn(),
    downloadSvg: vi.fn(),
  };
}

async function dispatch(
  message: AgentWebviewToHostMessage,
  effects: AgentContentControllerEffectPort,
  context: AgentHostRouteEffectContext,
): Promise<void> {
  const operation = tryHandleAgentContentControllerRoute(message, effects, context);
  if (!operation) {
    throw new Error(`Expected shared content controller to handle ${message.type}.`);
  }
  await operation;
}

describe('Agent content controller', () => {
  it('projects canonical media types for Workspace mention references', async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), 'agent-mention-media-'));
    const missingGitignore = Object.assign(new Error('missing'), { code: 'ENOENT' });
    try {
      const projection = await searchAgentWorkspaceMentions({
        workspace: {
          workspaceId: 'workspace-1',
          workspacePath,
          displayName: 'Workspace',
          locator: { kind: 'variable', value: '${HOME}/workspace' },
        },
        host: {
          files: {
            readDirectory: vi.fn(async () => [
              { name: 'test.png', type: 'file' as const },
              { name: 'test.fountain', type: 'file' as const },
            ]),
            readText: vi.fn(async () => Promise.reject(missingGitignore)),
          },
          paths: {},
        } as Parameters<typeof searchAgentWorkspaceMentions>[0]['host'],
        filter: 'test',
        purpose: 'entry',
      });

      expect(projection.files).toEqual([
        expect.objectContaining({ name: 'test.fountain' }),
        expect.objectContaining({ name: 'test.png', mediaType: 'image' }),
      ]);
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it('routes all content operations through narrow Host effects with connection context', async () => {
    const effects = createEffects();
    const context = createContext();
    const contentLocator = { kind: 'workspace-file' as const, path: 'docs/guide.pdf' };
    const documentLocator = { kind: 'page' as const, pageNumber: 3, pageIndex: 2 };
    const contextSource = {
      type: 'revealContextSource' as const,
      contextType: 'document-selection' as const,
      contextId: 'selection-1',
      contentLocator,
    };

    await dispatch(
      {
        type: 'searchProjectFiles',
        filter: 'guide',
        conversationId: 'conversation-1',
      },
      effects,
      context,
    );
    await dispatch(
      {
        type: 'openFile',
        contentLocator,
        options: { preview: true, line: 4, column: 2 },
      },
      effects,
      context,
    );
    await dispatch(
      { type: 'revealDocumentLocator', contentLocator, locator: documentLocator },
      effects,
      context,
    );
    await dispatch({ type: 'revealFile', contentLocator }, effects, context);
    await dispatch({ type: 'openUrl', url: 'https://example.com' }, effects, context);
    await dispatch(contextSource, effects, context);
    await dispatch(
      { type: 'downloadSvg', svg: '<svg />', filename: 'diagram.svg' },
      effects,
      context,
    );

    expect(effects.searchProjectFiles).toHaveBeenCalledWith(
      { filter: 'guide', conversationId: 'conversation-1' },
      context,
    );
    expect(effects.openFile).toHaveBeenCalledWith(
      {
        contentLocator,
        options: { preview: true, line: 4, column: 2 },
      },
      context,
    );
    expect(effects.revealDocumentLocator).toHaveBeenCalledWith(
      { contentLocator, locator: documentLocator },
      context,
    );
    expect(effects.revealFile).toHaveBeenCalledWith(contentLocator, context);
    expect(effects.openExternalUrl).toHaveBeenCalledWith('https://example.com', context);
    expect(effects.revealContextSource).toHaveBeenCalledWith(contextSource, context);
    expect(effects.downloadSvg).toHaveBeenCalledWith(
      { svg: '<svg />', filename: 'diagram.svg' },
      context,
    );
  });

  it('allows roleplay and entry searches without an ordinary conversation', async () => {
    const effects = createEffects();
    const context = createContext();

    await dispatch(
      { type: 'searchProjectFiles', filter: '', purpose: 'roleplay' },
      effects,
      context,
    );
    await dispatch(
      { type: 'searchProjectFiles', filter: 'hero', purpose: 'entry' },
      effects,
      context,
    );

    expect(effects.searchProjectFiles).toHaveBeenNthCalledWith(
      1,
      { filter: '', purpose: 'roleplay' },
      context,
    );
    expect(effects.searchProjectFiles).toHaveBeenNthCalledWith(
      2,
      { filter: 'hero', purpose: 'entry' },
      context,
    );
    expect(context.post).not.toHaveBeenCalled();
  });

  it('rejects ordinary search without explicit conversation identity', async () => {
    const effects = createEffects();
    const context = createContext();

    await dispatch(
      { type: 'searchProjectFiles', filter: 'guide', conversationId: '' },
      effects,
      context,
    );

    expect(effects.searchProjectFiles).not.toHaveBeenCalled();
    expect(context.post).toHaveBeenCalledWith({
      type: 'globalError',
      message: 'Cannot search project files without an explicit conversationId.',
    });
  });

  it('returns Host effect failures to the composition boundary', async () => {
    const effects = createEffects();
    const context = createContext();
    const failure = new Error('External open denied');
    effects.openExternalUrl = vi.fn().mockRejectedValue(failure);

    const operation = tryHandleAgentContentControllerRoute(
      { type: 'openUrl', url: 'https://example.com' },
      effects,
      context,
    );

    await expect(operation).rejects.toBe(failure);
  });

  it('does not claim routes owned by another controller', () => {
    expect(
      tryHandleAgentContentControllerRoute({ type: 'getConfig' }, createEffects(), createContext()),
    ).toBeNull();
  });
});
