import * as vscode from 'vscode';
import {
  isNpcAgentWorkflowRequest,
  isNpcTestBenchLaunchRequest,
  NEKO_AGENT_CHARACTER_DIALOGUE_COMMAND,
  NEKO_AGENT_EMBODY_CHARACTER_COMMAND,
  type NpcAgentWorkflowRequest,
} from '@neko/shared';
import type { AgentContextPayload } from '@neko/shared';
import { refreshOllamaModels } from '@neko/platform';
import {
  NEKO_AGENT_REGISTER_SLASH_COMMANDS_COMMAND,
  NEKO_AI_ASSISTANT_FOCUS_COMMAND,
} from '@neko-agent/types';
import {
  buildAgentPromptCommandMessage,
  buildAgentScriptCommandMessage,
} from '@neko/agent/runtime';
import { getRootLogger, handleError, ServiceCollection } from '../base';
import { IPlatform } from '../bootstrap';
import type { ChatViewProvider } from '../chat';
import {
  getSlashCommandRegistry,
  type PluginSlashCommandDef,
} from '../services/slashCommandRegistry';
/**
 * Register core extension commands.
 *
 * This module is intentionally a host bridge: it owns VSCode command APIs,
 * editor/input collection and webview forwarding. Agent/platform packages own
 * prompt construction, media generation and model refresh policy.
 */
export function registerAgentCoreCommands(
  context: vscode.ExtensionContext,
  chatViewProvider: ChatViewProvider,
  services: ServiceCollection,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.chat', () => {
      vscode.commands.executeCommand(NEKO_AI_ASSISTANT_FOCUS_COMMAND);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.sendMessage', async (message: string) => {
      await chatViewProvider.sendMessageToAssistant(message, true);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.agent.invokeSkill',
      async (args?: { skillName?: string; intent?: string; skill?: { name?: string } }) => {
        await vscode.commands.executeCommand(NEKO_AI_ASSISTANT_FOCUS_COMMAND);
        if (args?.intent) {
          const skillPrefix = args.skill?.name ? `[${args.skill.name}] ` : '';
          await chatViewProvider.sendMessageToAssistant(`${skillPrefix}${args.intent}`, true);
        } else if (args?.skillName) {
          await chatViewProvider.sendMessageToAssistant(`/${args.skillName}`, true);
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.agent.sendContext',
      async (payload: AgentContextPayload) => {
        await chatViewProvider.sendContextPayload(payload);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      NEKO_AGENT_CHARACTER_DIALOGUE_COMMAND,
      async (request: unknown) => {
        await vscode.commands.executeCommand(NEKO_AI_ASSISTANT_FOCUS_COMMAND);
        if (!isNpcTestBenchLaunchRequest(request)) {
          await vscode.window.showErrorMessage('无法启动角色对话：启动请求无效。');
          return null;
        }
        return chatViewProvider.startCharacterDialogue(request);
      },
    ),
  );

  registerCharacterRoleWorkflowCommand(
    context,
    chatViewProvider,
    NEKO_AGENT_EMBODY_CHARACTER_COMMAND,
    'embody-character',
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.generateImage', async () => {
      const prompt = await vscode.window.showInputBox({
        prompt: 'Describe the image you want to generate',
        placeHolder: 'A beautiful sunset over mountains...',
      });

      if (!prompt) return;

      await chatViewProvider.sendMessageToAssistant(
        buildAgentPromptCommandMessage({ kind: 'generate-image', prompt }),
        true,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.generateVideo', async () => {
      const prompt = await vscode.window.showInputBox({
        prompt: 'Describe the video you want to generate',
        placeHolder: 'A timelapse of clouds moving...',
      });

      if (!prompt) return;

      await chatViewProvider.sendMessageToAssistant(
        buildAgentPromptCommandMessage({ kind: 'generate-video', prompt }),
        true,
      );
    }),
  );

  registerScriptCommands(context, chatViewProvider);
  registerServiceCommands(context, services);
  registerPluginCommands(context, chatViewProvider);
  registerDragAndDropCommands(context, chatViewProvider);
}

function registerScriptCommands(
  context: vscode.ExtensionContext,
  chatViewProvider: ChatViewProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.script.generate', async () => {
      const text = getSelectedOrFullEditorText();
      if (text === undefined) return;

      await chatViewProvider.sendMessageToAssistant(
        buildAgentScriptCommandMessage({ kind: 'generate', text }),
        true,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.script.optimize', async () => {
      const text = getFullEditorText();
      if (text === undefined) return;

      await chatViewProvider.sendMessageToAssistant(
        buildAgentScriptCommandMessage({ kind: 'optimize', text }),
        true,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.script.generateImage', async () => {
      const text = getFullEditorText();
      if (text === undefined) return;

      await chatViewProvider.sendMessageToAssistant(
        buildAgentScriptCommandMessage({ kind: 'generate-image', text }),
        true,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.script.generateVideo', async () => {
      const text = getFullEditorText();
      if (text === undefined) return;

      await chatViewProvider.sendMessageToAssistant(
        buildAgentScriptCommandMessage({ kind: 'generate-video', text }),
        true,
      );
    }),
  );
}

function registerCharacterRoleWorkflowCommand(
  context: vscode.ExtensionContext,
  chatViewProvider: ChatViewProvider,
  command: string,
  workflow: NpcAgentWorkflowRequest['workflow'],
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(command, async (request: unknown) => {
      await vscode.commands.executeCommand(NEKO_AI_ASSISTANT_FOCUS_COMMAND);
      if (!isNpcAgentWorkflowRequest(request) || request.workflow !== workflow) {
        await vscode.window.showErrorMessage('无法启动角色工作流：请求无效。');
        return null;
      }
      await chatViewProvider.startEmbodyCharacter(request);
      return { ok: true, workflow: request.workflow };
    }),
  );
}

function registerServiceCommands(
  context: vscode.ExtensionContext,
  services: ServiceCollection,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.agent.refreshModels', async () => {
      const platform = services.get(IPlatform);
      if (!platform) return;
      const result = await refreshOllamaModels({
        config: platform.config,
        logger: getRootLogger(),
      });
      getRootLogger().info(`Ollama model refresh: +${result.added} new model(s)`);
    }),
  );
}

function registerPluginCommands(
  context: vscode.ExtensionContext,
  chatViewProvider: ChatViewProvider,
): void {
  const slashRegistry = getSlashCommandRegistry();
  context.subscriptions.push(
    slashRegistry,
    vscode.commands.registerCommand(
      NEKO_AGENT_REGISTER_SLASH_COMMANDS_COMMAND,
      (extensionId: string, commands: PluginSlashCommandDef[]) => {
        if (!extensionId || !Array.isArray(commands)) return;
        slashRegistry.register(extensionId, commands);
        chatViewProvider.sendPluginSlashCommands(slashRegistry.getAll());
      },
    ),
  );

  context.subscriptions.push(
    slashRegistry.onDidChange(() => {
      chatViewProvider.sendPluginSlashCommands(slashRegistry.getAll());
    }),
  );

  chatViewProvider.setPluginCommandsGetter(() => slashRegistry.getAll());
}

function registerDragAndDropCommands(
  context: vscode.ExtensionContext,
  chatViewProvider: ChatViewProvider,
): void {
  const dndBroker = chatViewProvider.dndBroker;
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.agent.getDndPayload', () => {
      return dndBroker.getPayload();
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.agent.clearDndPayload', () => {
      dndBroker.clearPayload();
    }),
  );
}

function getSelectedOrFullEditorText(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void handleMissingEditor();
    return undefined;
  }

  const selection = editor.selection;
  return editor.document.getText(selection.isEmpty ? undefined : selection);
}

function getFullEditorText(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void handleMissingEditor();
    return undefined;
  }

  return editor.document.getText();
}

async function handleMissingEditor(): Promise<void> {
  await handleError(new Error('No active editor'), { showToUser: true });
}
