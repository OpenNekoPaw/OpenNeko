import type { SupportedLocale } from '@neko/shared/i18n';
import {
  buildExtensionCommandConversationSummaries,
  buildExtensionCommandHostEffectPlan,
  buildExtensionCommandResultPayload,
  normalizeSlashCommandName,
  parseBuiltinCommandArgs,
  type ExtensionCommandConversationSummarySource,
  type ExtensionCommandHostEffect,
  type ExtensionCommandResultPayload,
} from './extension-command-presenter';
import { resolveSlashCommandCatalogEntry } from './command-catalog';
import { getCommandHandler } from './command-executor';
import { handleStatus } from './handlers';
import type { CommandContext, CommandResult } from './types';

export interface ExtensionSlashCommandRuntimeInput {
  command: string;
  args?: string;
  conversationId: string;
}

export interface ExtensionSlashCommandRuntimeResult {
  command: string;
  handled: boolean;
  source: 'builtin' | 'unknown';
}

export interface ExtensionSlashCommandConversationSource {
  list(): readonly ExtensionCommandConversationSummarySource[];
  getMessageCount(conversationId: string): number | undefined;
  create(): Promise<string>;
  clearCurrent(conversationId: string): void;
}

export interface ExtensionSlashCommandSettingsSource {
  provider?: string | null;
  model?: string | null;
  executionMode?: string | null;
}

export interface ExtensionSlashCommandContextManager {
  getTokenCount(conversationId: string): number;
  compress(conversationId: string): Promise<void>;
}

export interface ExtensionSlashCommandRuntimeDeps {
  locale: SupportedLocale;
  conversations: ExtensionSlashCommandConversationSource;
  settings?: ExtensionSlashCommandSettingsSource;
  updateExecutionMode?(conversationId: string, mode: 'auto' | 'ask' | 'plan'): void;
  contextManager?: ExtensionSlashCommandContextManager;
}

export interface ExtensionSlashCommandRuntimeEffects {
  postMessage(message: ExtensionCommandResultPayload): void | Promise<void>;
  executeHostEffect(effect: ExtensionCommandHostEffect): void | Promise<void>;
}

export function runExtensionSlashCommandRuntime(
  input: ExtensionSlashCommandRuntimeInput,
  deps: ExtensionSlashCommandRuntimeDeps,
  effects: ExtensionSlashCommandRuntimeEffects,
): Promise<ExtensionSlashCommandRuntimeResult> | ExtensionSlashCommandRuntimeResult {
  const command = normalizeSlashCommandName(input.command);
  const context = createExtensionSlashCommandContext(input.conversationId, deps);
  const commandEntry = resolveSlashCommandCatalogEntry(command, {
    surface: 'extension',
  });

  if (commandEntry?.source === 'builtin') {
    const handler = getCommandHandler(command);
    if (!handler) {
      throw new Error(`Builtin extension command /${command} has no registered handler.`);
    }

    const result = handler(parseBuiltinCommandArgs(input.args), context);
    if (isPromiseLike(result)) {
      return result.then(async (resolved) => {
        await dispatchBuiltinSlashCommandResult(command, input, deps, effects, resolved);
        return { command, handled: true, source: 'builtin' };
      });
    }

    const dispatched = dispatchBuiltinSlashCommandResult(command, input, deps, effects, result);
    if (isPromiseLike(dispatched)) {
      return dispatched.then(() => ({ command, handled: true, source: 'builtin' }));
    }

    return { command, handled: true, source: 'builtin' };
  }

  const posted = effects.postMessage(
    buildExtensionCommandResultPayload({
      conversationId: input.conversationId,
      command,
      locale: deps.locale,
      result: {
        handled: false,
        continueExecution: true,
        semantic: {
          family: 'shell',
          result: { kind: 'diagnostic', code: 'unknown-command', command },
        },
      },
    }),
  );
  if (isPromiseLike(posted)) {
    return posted.then(() => ({ command, handled: false, source: 'unknown' }));
  }
  return { command, handled: false, source: 'unknown' };
}

export function buildExtensionSlashStatusPayload(input: {
  conversationId: string;
  deps: ExtensionSlashCommandRuntimeDeps;
}): ExtensionCommandResultPayload {
  const result = handleStatus(
    [],
    createExtensionSlashCommandContext(input.conversationId, input.deps),
  );

  return buildExtensionCommandResultPayload({
    conversationId: input.conversationId,
    command: 'status',
    locale: input.deps.locale,
    result: assertSynchronousStatusResult(result),
  });
}

function createExtensionSlashCommandContext(
  conversationId: string,
  deps: ExtensionSlashCommandRuntimeDeps,
): CommandContext {
  return {
    locale: deps.locale,
    config: {
      provider: deps.settings?.provider ?? undefined,
      model: deps.settings?.model ?? undefined,
      executionMode: deps.settings?.executionMode ?? undefined,
    },
    conversations: {
      list: () => deps.conversations.list().map(({ id, title }) => ({ id, title })),
      getActiveId: () => conversationId,
      getActiveMessageCount: () => deps.conversations.getMessageCount(conversationId) ?? 0,
      create: () => deps.conversations.create(),
      clearCurrent: () => deps.conversations.clearCurrent(conversationId),
    },
    updateExecutionMode: (mode) => deps.updateExecutionMode?.(conversationId, mode),
    contextManager: {
      getTokenCount: (id: string) => deps.contextManager?.getTokenCount(id) ?? 0,
      compress: async (id: string) => {
        await deps.contextManager?.compress(id);
      },
    },
  };
}

function dispatchBuiltinSlashCommandResult(
  command: string,
  input: ExtensionSlashCommandRuntimeInput,
  deps: ExtensionSlashCommandRuntimeDeps,
  effects: ExtensionSlashCommandRuntimeEffects,
  result: CommandResult,
): void | Promise<void> {
  if (result.action === 'showStatus') {
    return effects.postMessage(
      buildExtensionSlashStatusPayload({ conversationId: input.conversationId, deps }),
    );
  }

  const effectPlan = buildExtensionCommandHostEffectPlan({
    result,
    ...(input.conversationId ? { activeConversationId: input.conversationId } : {}),
  });

  const before = executeHostEffects(effectPlan.beforeResult, effects);
  if (isPromiseLike(before)) {
    return before.then(() => {
      const posted = postBuiltinResult(command, input.conversationId, result, deps, effects);
      const after = executeHostEffects(effectPlan.afterResult, effects);
      return waitForPostAndAfterEffects(posted, after);
    });
  }

  const posted = postBuiltinResult(command, input.conversationId, result, deps, effects);
  const after = executeHostEffects(effectPlan.afterResult, effects);
  return waitForPostAndAfterEffects(posted, after);
}

function postBuiltinResult(
  command: string,
  conversationId: string,
  result: CommandResult,
  deps: ExtensionSlashCommandRuntimeDeps,
  effects: ExtensionSlashCommandRuntimeEffects,
): void | Promise<void> {
  return effects.postMessage(
    buildExtensionCommandResultPayload({
      conversationId,
      command,
      result,
      locale: deps.locale,
      resumeConversations:
        result.action === 'resumeConversation'
          ? buildExtensionCommandConversationSummaries(deps.conversations.list(), {
              getMessageCount: (conversationId) =>
                deps.conversations.getMessageCount(conversationId),
            })
          : undefined,
    }),
  );
}

function executeHostEffects(
  hostEffects: readonly ExtensionCommandHostEffect[],
  effects: ExtensionSlashCommandRuntimeEffects,
): void | Promise<void> {
  for (let index = 0; index < hostEffects.length; index += 1) {
    const effect = hostEffects[index];
    if (!effect) continue;

    const executed = effects.executeHostEffect(effect);
    if (isPromiseLike(executed)) {
      return executed.then(() => executeHostEffects(hostEffects.slice(index + 1), effects));
    }
  }
}

function waitForPostAndAfterEffects(
  posted: void | Promise<void>,
  after: void | Promise<void>,
): void | Promise<void> {
  if (isPromiseLike(posted) && isPromiseLike(after)) {
    return Promise.all([posted, after]).then(() => undefined);
  }
  if (isPromiseLike(posted)) {
    return posted;
  }
  return after;
}

function assertSynchronousStatusResult(
  result: CommandResult | Promise<CommandResult>,
): CommandResult {
  if (isPromiseLike(result)) {
    throw new Error('Status command returned an asynchronous result unexpectedly.');
  }
  return result;
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof value === 'object' && value !== null && 'then' in value;
}
