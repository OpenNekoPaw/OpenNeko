import * as vscode from 'vscode';
import type { AgentContextType } from '@neko/shared';
import {
  AGENT_DOCUMENT_CONTEXT_INTENTS,
  buildAgentCreationMessage,
  buildAgentFileContextPayload,
  buildAgentRetryCreationMessage,
  inferAgentCreationIntentFromFilePath,
} from '@neko/agent/runtime';
import { handleError } from '../base';
import type { ChatViewProvider } from '../chat';

/**
 * Register creation quick-start commands.
 *
 * These commands collect user intent + source context (QuickPick / file URI)
 * and hand it to the Agent chat. The Agent matches the appropriate Skill
 * (via IDC-stage selection + atomic tool orchestration) — no hard-coded
 * pipeline routing.
 */
export function registerCreationQuickStartCommands(
  context: vscode.ExtensionContext,
  chatViewProvider: ChatViewProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.agent.createFromFile', async (uri?: vscode.Uri) => {
      let filePath: string | undefined;

      if (uri) {
        filePath = uri.fsPath;
      } else {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          filePath = editor.document.uri.fsPath;
        }
      }

      if (!filePath) {
        void handleError(new Error('No file selected'), { showToUser: true });
        return;
      }

      await chatViewProvider.sendMessageToAssistant(
        buildAgentCreationMessage({
          intent: inferAgentCreationIntentFromFilePath(filePath),
          sourceFilePath: filePath,
        }),
        true,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.agent.retryCreation', async () => {
      await chatViewProvider.sendMessageToAssistant(buildAgentRetryCreationMessage(), true);
    }),
  );
}

/**
 * Register AI commands surfaced in the Explorer context menu.
 *
 * All commands send file-level chips to the agent panel.
 * The agent reads document/image/video content on demand via its tools.
 */
export function registerDocumentContextCommands(
  context: vscode.ExtensionContext,
  chatViewProvider: ChatViewProvider,
): void {
  const resolveFilePath = (uri: vscode.Uri | undefined): string | undefined =>
    uri?.fsPath ?? vscode.window.activeTextEditor?.document.uri.fsPath;

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.agent.addToContext',
      async (uri?: vscode.Uri, allUris?: vscode.Uri[]) => {
        const uris = allUris && allUris.length > 0 ? allUris : uri ? [uri] : [];
        if (uris.length === 0) {
          const filePath = resolveFilePath(undefined);
          if (filePath) {
            uris.push(vscode.Uri.file(filePath));
          }
        }
        if (uris.length === 0) return;

        for (const fileUri of uris) {
          const relPath = vscode.workspace.asRelativePath(fileUri);
          await chatViewProvider.sendContextPayload(
            buildAgentFileContextPayload({
              filePath: fileUri.fsPath,
              relativePath: relPath,
              id: fileUri.toString(),
              typeOverride: 'file',
            }),
          );
        }
      },
    ),
  );

  const sendFileChip = async (
    uri: vscode.Uri | undefined,
    intent: string,
    typeOverride?: AgentContextType,
  ): Promise<void> => {
    const filePath = resolveFilePath(uri);
    if (!filePath) return;
    const relativePath = vscode.workspace.asRelativePath(filePath);
    await chatViewProvider.sendContextPayload(
      buildAgentFileContextPayload({
        filePath,
        relativePath,
        intent,
        typeOverride,
      }),
    );
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.summarizeDocument', async (uri?: vscode.Uri) => {
      await sendFileChip(uri, AGENT_DOCUMENT_CONTEXT_INTENTS.summarizeDocument);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.chatWithDocument', async (uri?: vscode.Uri) => {
      await sendFileChip(uri, AGENT_DOCUMENT_CONTEXT_INTENTS.chatWithDocument);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.analyzeImage', async (uri?: vscode.Uri) => {
      await sendFileChip(uri, AGENT_DOCUMENT_CONTEXT_INTENTS.analyzeImage, 'image');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.extractImageText', async (uri?: vscode.Uri) => {
      await sendFileChip(uri, AGENT_DOCUMENT_CONTEXT_INTENTS.extractImageText, 'image');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.analyzeVideo', async (uri?: vscode.Uri) => {
      await sendFileChip(uri, AGENT_DOCUMENT_CONTEXT_INTENTS.analyzeVideo);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.generateSubtitles', async (uri?: vscode.Uri) => {
      await sendFileChip(uri, AGENT_DOCUMENT_CONTEXT_INTENTS.generateSubtitles);
    }),
  );
}
