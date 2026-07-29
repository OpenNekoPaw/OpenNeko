import * as vscode from 'vscode';
import type { NekoAgentAPI } from '@neko/shared';

import type { FeatureRuntimeContext } from '../../feature-runtime-context';
import type { CapabilityContribution } from '../../kernel/capability-contribution';
import { CapabilityUnavailableError } from '../../kernel/lazy-capability';
import type { CapabilityId } from '../../kernel/types';
import { ChatViewProvider } from './chat';
import { registerAgentCoreCommands, type AgentCommandSurface } from './commands/agentCoreCommands';
import {
  registerCreationQuickStartCommands,
  registerDocumentContextCommands,
} from './commands/agentContextCommands';
import type { NekoAgentRuntime } from './index';

export interface LazyNekoAgentSurfaceOptions {
  readonly context: FeatureRuntimeContext;
  readonly capabilityId: CapabilityId;
  readonly contribution: CapabilityContribution<NekoAgentRuntime>;
}

export function registerLazyNekoAgentSurface(options: LazyNekoAgentSurfaceOptions): NekoAgentAPI {
  const access = new LazyAgentRuntimeAccess(options.capabilityId, options.contribution);
  const commandSurface = createCommandSurface(access);
  options.context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      new LazyAgentWebviewViewProvider(access),
    ),
  );
  registerAgentCoreCommands(options.context, commandSurface);
  registerCreationQuickStartCommands(options.context, commandSurface);
  registerDocumentContextCommands(options.context, commandSurface);

  return {
    getSkills() {
      return access.requireReady().api.getSkills();
    },
    resolveGeneratedOutput(contentLocator) {
      return access.invoke((runtime) => runtime.api.resolveGeneratedOutput(contentLocator));
    },
  };
}

class LazyAgentRuntimeAccess {
  readonly #capabilityId: CapabilityId;
  readonly #contribution: CapabilityContribution<NekoAgentRuntime>;
  #ready: NekoAgentRuntime | undefined;
  #pluginCommandsGetter: Parameters<ChatViewProvider['setPluginCommandsGetter']>[0] | undefined;

  constructor(capabilityId: CapabilityId, contribution: CapabilityContribution<NekoAgentRuntime>) {
    this.#capabilityId = capabilityId;
    this.#contribution = contribution;
  }

  invoke<TResult>(
    operation: (runtime: NekoAgentRuntime) => TResult | Promise<TResult>,
    signal?: AbortSignal,
  ): Promise<TResult> {
    return this.#contribution.invoke(async (runtime) => {
      this.#bind(runtime);
      return operation(runtime);
    }, signal);
  }

  requireReady(): NekoAgentRuntime {
    if (this.#ready) return this.#ready;
    throw new Error(
      `Capability ${this.#capabilityId} has not been initialized. Open the OpenNeko Agent view before requesting its synchronous API.`,
    );
  }

  setPluginCommandsGetter(
    getter: Parameters<ChatViewProvider['setPluginCommandsGetter']>[0],
  ): void {
    this.#pluginCommandsGetter = getter;
    this.#ready?.chatViewProvider.setPluginCommandsGetter(getter);
  }

  #bind(runtime: NekoAgentRuntime): void {
    if (this.#ready && this.#ready !== runtime) {
      throw new Error(`Capability ${this.#capabilityId} returned more than one runtime instance.`);
    }
    this.#ready = runtime;
    if (this.#pluginCommandsGetter) {
      runtime.chatViewProvider.setPluginCommandsGetter(this.#pluginCommandsGetter);
    }
  }
}

class LazyAgentWebviewViewProvider implements vscode.WebviewViewProvider {
  readonly #access: LazyAgentRuntimeAccess;

  constructor(access: LazyAgentRuntimeAccess) {
    this.#access = access;
  }

  async resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const controller = new AbortController();
    const cancellation = token.onCancellationRequested(() => {
      controller.abort(new Error('OpenNeko Agent view resolution was cancelled.'));
    });
    try {
      await this.#access.invoke(
        (runtime) => runtime.chatViewProvider.resolveWebviewView(webviewView, context, token),
        controller.signal,
      );
    } catch (error) {
      webviewView.webview.html = unavailableHtml(error);
    } finally {
      cancellation.dispose();
    }
  }
}

function createCommandSurface(access: LazyAgentRuntimeAccess): AgentCommandSurface {
  return {
    sendMessageToAssistant: (message, autoSend) =>
      access.invoke((runtime) =>
        runtime.chatViewProvider.sendMessageToAssistant(message, autoSend),
      ),
    sendContextPayload: (payload) =>
      access.invoke((runtime) => runtime.chatViewProvider.sendContextPayload(payload)),
    startCharacterDialogue: (request) =>
      access.invoke((runtime) => runtime.chatViewProvider.startCharacterDialogue(request)),
    startEmbodyCharacter: (request) =>
      access.invoke((runtime) => runtime.chatViewProvider.startEmbodyCharacter(request)),
    sendPluginSlashCommands(commands) {
      void access
        .invoke((runtime) => runtime.chatViewProvider.sendPluginSlashCommands(commands))
        .catch(() => undefined);
    },
    setPluginCommandsGetter(getter) {
      access.setPluginCommandsGetter(getter);
    },
    refreshModels: () => access.invoke((runtime) => runtime.refreshModels()),
    getDndPayload: () =>
      access.invoke((runtime) => runtime.chatViewProvider.dndBroker.getPayload()),
    clearDndPayload: () =>
      access.invoke((runtime) => runtime.chatViewProvider.dndBroker.clearPayload()),
  };
}

function unavailableHtml(error: unknown): string {
  const diagnostic =
    error instanceof CapabilityUnavailableError
      ? `[${error.diagnostic.capabilityId}/${error.diagnostic.code}] ${error.diagnostic.message} Cause: ${error.diagnostic.causalChain.join(' -> ')}`
      : error instanceof Error
        ? error.message
        : String(error);
  return `<!doctype html>
<html lang="zh-CN">
  <body>
    <h2>OpenNeko Agent 当前不可用</h2>
    <p>${escapeHtml(diagnostic)}</p>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/gu,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character,
  );
}
