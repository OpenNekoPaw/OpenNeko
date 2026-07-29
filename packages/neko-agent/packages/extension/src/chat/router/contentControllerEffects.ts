import * as vscode from 'vscode';
import type { AgentContentControllerEffectPort } from '@neko/agent/runtime';
import type { AgentWebviewToHostMessage } from '@neko-agent/types';
import type { ContentLocator } from '@neko/shared';
import type { VSCodeAgentHostControllerDeps } from './types';

export function createVSCodeContentControllerEffects(
  deps: VSCodeAgentHostControllerDeps,
): AgentContentControllerEffectPort {
  return {
    searchProjectFiles: ({ filter, conversationId, purpose }) => {
      const handler = deps.messages;
      if (!handler) {
        throw new Error('Agent project search handler is unavailable.');
      }
      return handler.searchProjectFiles(deps.webview, filter, conversationId, {
        ...(purpose !== undefined ? { purpose } : {}),
      });
    },
    openFile: ({ contentLocator }) => deps.fileOperationHandler.handleOpenFile(contentLocator),
    revealDocumentLocator: (input) => deps.fileOperationHandler.handleRevealDocumentLocator(input),
    revealFile: (contentLocator) => deps.fileOperationHandler.handleRevealFile(contentLocator),
    openExternalUrl: (url) => deps.fileOperationHandler.handleOpenUrl(url),
    revealContextSource: (message) => revealVSCodeContextSource(message, deps),
    downloadSvg: ({ svg, filename }) => deps.fileOperationHandler.handleDownloadSvg(svg, filename),
  };
}

async function revealVSCodeContextSource(
  message: Extract<AgentWebviewToHostMessage, { type: 'revealContextSource' }>,
  deps: VSCodeAgentHostControllerDeps,
): Promise<void> {
  const navigationData = message.navigationData;
  if (
    message.contextType === 'media' &&
    navigationData?.['partition'] === 'media-library' &&
    message.contentLocator
  ) {
    await vscode.commands.executeCommand(
      'neko.assets.revealMediaLibraryFile',
      contentLocatorWorkspacePath(message.contentLocator),
    );
    return;
  }
  if (message.contentLocator) {
    await deps.fileOperationHandler.handleOpenFile(message.contentLocator);
    return;
  }
  const canvasNodeId =
    message.contextType === 'canvas-node' ? navigationData?.['nodeId'] : undefined;
  if (canvasNodeId) {
    await vscode.commands.executeCommand('neko.canvas.selectNodeFromOutline', canvasNodeId);
    return;
  }
  throw new Error(
    `Cannot reveal context source '${message.contextId}' without a supported Host locator.`,
  );
}

function contentLocatorWorkspacePath(locator: ContentLocator): string {
  switch (locator.kind) {
    case 'workspace-file':
    case 'generated-output':
      return locator.path;
    case 'document-entry':
      return locator.source.path;
    case 'package-resource':
      throw new Error('Media Library reveal requires workspace-backed content.');
  }
}
