/** VS Code/Webview boundary for canonical Pi Agent turns. */

import * as vscode from 'vscode';

import type { AssistantRuntimeSettingsSnapshot } from '@neko/platform';
import type { AgentPhase, AgentQueuedMessageSource, ModelRef } from '@neko-agent/types';
import type {
  AgentFlatPurposeModelRefs,
  AgentLlmRuntimeOptions,
  AgentMessageExecutionOverrides,
} from '@neko/agent/runtime';
import { buildGlobalErrorMessage } from '@neko-agent/types';

import type { IAgentManager } from '../../ai/agentManager';
import type { ExecuteVSCodePiTurnInput } from '../../ai/vscodePiRuntimeManager';
import { getLogger } from '../../base';
import type { AccountAiCatalogCache } from '../../services/accountAiCatalogCache';
import type { ProviderManager } from '../providerManager';
import type { AgentStreamProcessor, StreamProcessingResult } from './agentStreamProcessor';

const logger = getLogger('AgentTurnBridge');

export interface AgentTurnBridgeDeps {
  providers: ProviderManager;
  agentManager?: IAgentManager;
  getSystemPrompt: (conversationId: string, executionMode: 'auto' | 'ask' | 'plan') => string;
  accountAiCatalog?: AccountAiCatalogCache;
  streamProcessor: AgentStreamProcessor;
  onPhaseChange: (event: {
    conversationId: string;
    phase: AgentPhase;
    toolName?: string;
    timestamp: number;
  }) => void;
  generateMessageId: () => string;
}

export type AgentTurnDurabilityOutcome =
  | { readonly status: 'durable'; readonly state: 'durable' }
  | {
      readonly status: 'failed';
      readonly state: 'volatile' | 'persisting' | 'persistence-delayed';
    }
  | { readonly status: 'skipped'; readonly reason: 'model-not-completed' | 'queued' };

export type AgentTurnModelOutcome =
  | { readonly status: 'completed' | 'cancelled'; readonly streamCount: number }
  | { readonly status: 'failed'; readonly streamCount: number; readonly error?: unknown }
  | { readonly status: 'precondition-unmet'; readonly streamCount: 0 }
  | { readonly status: 'queued'; readonly streamCount: 0 };

export interface AgentTurnLifecycleResult {
  readonly model: AgentTurnModelOutcome;
  readonly terminalConversationDurability: AgentTurnDurabilityOutcome;
}

export interface AgentTurnBridgeExecutionResult {
  readonly status: 'completed' | 'failed' | 'precondition-unmet' | 'queued';
  readonly stream?: StreamProcessingResult;
  readonly error?: unknown;
  readonly pendingCount?: number;
  readonly lifecycle: AgentTurnLifecycleResult;
}

export interface ExecuteAgentTurnForWebviewInput {
  webview: vscode.Webview;
  conversationId: string;
  message: string;
  pendingMessageSource?: AgentQueuedMessageSource;
  chatModel?: ModelRef<'llm'>;
  llmRuntimeOptions?: AgentLlmRuntimeOptions;
  purposeModels?: AgentFlatPurposeModelRefs;
  imageAttachments?: readonly { type: 'base64'; media_type: string; data: string }[];
  executionOverrides?: AgentMessageExecutionOverrides;
  locale?: string;
  settings: AssistantRuntimeSettingsSnapshot;
}

export class AgentTurnBridge {
  private readonly activeConversations = new Set<string>();
  private readonly pendingTurns = new Map<string, Map<string, ExecuteAgentTurnForWebviewInput>>();

  constructor(private readonly deps: AgentTurnBridgeDeps) {}

  async execute(input: ExecuteAgentTurnForWebviewInput): Promise<AgentTurnBridgeExecutionResult> {
    const manager = this.deps.agentManager;
    if (!manager) {
      throw new Error('VS Code Agent turn requires the canonical Pi runtime manager.');
    }
    if (this.activeConversations.has(input.conversationId)) {
      const pendingCount = this.enqueue(manager, input);
      await input.webview.postMessage({
        type: 'messageQueued',
        conversationId: input.conversationId,
        content: input.message,
        pendingCount,
      });
      return {
        status: 'queued',
        pendingCount,
        lifecycle: {
          model: { status: 'queued', streamCount: 0 },
          terminalConversationDurability: { status: 'skipped', reason: 'queued' },
        },
      };
    }

    this.activeConversations.add(input.conversationId);
    try {
      await this.refreshAccountCatalogForTurn(input.chatModel?.providerId);
      const selection = this.resolveModelSelection(input.chatModel);
      const executionMode = input.executionOverrides?.executionMode ?? input.settings.executionMode;
      const messageId = this.deps.generateMessageId();
      const stream = this.deps.streamProcessor.createPiStream(
        input.webview,
        input.conversationId,
        messageId,
        (phase, toolName) =>
          this.deps.onPhaseChange({
            conversationId: input.conversationId,
            phase,
            ...(toolName === undefined ? {} : { toolName }),
            timestamp: Date.now(),
          }),
      );
      try {
        const runtimeOptions = resolvePiTurnRuntimeOptions(input);
        const turnInput = {
          conversationId: input.conversationId,
          prompt: input.message,
          systemPrompt: this.deps.getSystemPrompt(input.conversationId, executionMode),
          provider: selection.provider,
          model: selection.model,
          providerSource: this.deps.providers.getProviderSource(selection.provider.id),
          purposeModels: this.resolvePurposeModels(input.purposeModels),
          executionMode,
          temperature: runtimeOptions.temperature,
          topP: runtimeOptions.topP,
          maxTokens: runtimeOptions.maxTokens,
          thinkingBudget: runtimeOptions.thinkingBudget,
          thinkingLevel: runtimeOptions.thinkingLevel,
          ...(input.imageAttachments === undefined ? {} : { images: input.imageAttachments }),
          locale: normalizeLocale(input.locale),
          events: stream.events,
        };
        const skillInvocation = parseExplicitSkillInvocation(input.message);
        const turn = skillInvocation
          ? await manager.executePiSkillTurn({
              ...turnInput,
              skillName: skillInvocation.skillName,
              ...(skillInvocation.additionalInstructions === undefined
                ? {}
                : { additionalInstructions: skillInvocation.additionalInstructions }),
            })
          : await manager.executePiTurn(turnInput);
        const streamResult = stream.result();
        const completed =
          turn.status === 'completed' && streamResult.terminalStatus === 'completed';
        const model: AgentTurnModelOutcome = completed
          ? { status: 'completed', streamCount: 1 }
          : turn.status === 'cancelled' || streamResult.terminalStatus === 'cancelled'
            ? { status: 'cancelled', streamCount: 1 }
            : { status: 'failed', streamCount: 1 };
        return {
          status: completed ? 'completed' : 'failed',
          stream: streamResult,
          lifecycle: {
            model,
            terminalConversationDurability:
              turn.durability === 'durable'
                ? { status: 'durable', state: 'durable' }
                : turn.status === 'completed'
                  ? { status: 'failed', state: turn.durability }
                  : { status: 'skipped', reason: 'model-not-completed' },
          },
        };
      } finally {
        stream.dispose();
      }
    } finally {
      this.activeConversations.delete(input.conversationId);
      this.dispatchNext(input.conversationId);
    }
  }

  private resolveModelSelection(modelRef: ModelRef | undefined): {
    readonly provider: NonNullable<ReturnType<ProviderManager['getProviderConfig']>>;
    readonly model: NonNullable<ReturnType<ProviderManager['getModel']>>;
  } {
    if (!modelRef?.providerId || !modelRef.modelId) {
      throw new Error('Pi Agent turn requires an explicit providerId and modelId.');
    }
    const provider = this.deps.providers.getProviderConfig(modelRef.providerId);
    if (!provider || provider.enabled === false) {
      throw new Error(`Configured Pi provider ${modelRef.providerId} is unavailable.`);
    }
    const model = this.deps.providers.getModel(modelRef.modelId);
    if (!model || model.enabled === false || model.providerId !== provider.id) {
      throw new Error(
        `Configured Pi model ${modelRef.providerId}/${modelRef.modelId} is unavailable.`,
      );
    }
    return { provider, model };
  }

  private resolvePurposeModels(
    purposeModels: AgentFlatPurposeModelRefs | undefined,
  ): ExecuteVSCodePiTurnInput['purposeModels'] {
    if (!purposeModels) return undefined;
    const resolved: NonNullable<ExecuteVSCodePiTurnInput['purposeModels']> = {};
    for (const purpose of [
      'image.generate',
      'image.edit',
      'image.understand',
      'video.generate',
      'video.understand',
      'audio.generate',
      'audio.tts',
      'audio.music.generate',
      'audio.understand',
    ] as const) {
      const modelRef = purposeModels[purpose];
      if (!modelRef) continue;
      const selection = this.resolveModelSelection(modelRef);
      resolved[purpose] = {
        ...selection,
        providerSource: this.deps.providers.getProviderSource(selection.provider.id),
      };
    }
    return resolved;
  }

  clearPendingTurns(conversationId: string): void {
    this.pendingTurns.delete(conversationId);
  }

  private enqueue(manager: IAgentManager, input: ExecuteAgentTurnForWebviewInput): number {
    const item = manager.enqueuePendingMessage(input.conversationId, {
      content: input.message,
      source: input.pendingMessageSource ?? 'composer',
    });
    if (input.pendingMessageSource === 'task-result-continuation') {
      manager.promotePendingMessage(input.conversationId, item.id);
    }
    const pending = this.pendingTurns.get(input.conversationId) ?? new Map();
    pending.set(item.id, input);
    this.pendingTurns.set(input.conversationId, pending);
    return manager.getPendingMessageQueue(input.conversationId).length;
  }

  private dispatchNext(conversationId: string): void {
    const manager = this.deps.agentManager;
    if (!manager || !this.pendingTurns.has(conversationId)) return;
    let item = manager.dequeuePendingMessage(conversationId);
    while (item) {
      const pending = this.pendingTurns.get(conversationId);
      const queuedInput = pending?.get(item.id);
      pending?.delete(item.id);
      if (pending?.size === 0) this.pendingTurns.delete(conversationId);
      if (queuedInput) {
        const next = { ...queuedInput, message: item.content };
        void this.execute(next).catch((error) => {
          logger.error('Queued Pi Agent turn failed:', error);
          void next.webview.postMessage(
            buildGlobalErrorMessage(
              error instanceof Error ? error.message : 'Queued Agent turn failed.',
            ),
          );
        });
        return;
      }
      logger.warn(`Discarded queued Pi turn ${conversationId}/${item.id} without execution input.`);
      item = manager.dequeuePendingMessage(conversationId);
    }
    this.pendingTurns.delete(conversationId);
  }

  private async refreshAccountCatalogForTurn(providerId?: string): Promise<void> {
    if (!this.deps.accountAiCatalog) return;
    const cached = this.deps.accountAiCatalog.getCachedSnapshot();
    if (cached && (!providerId || cached.provider.id === providerId)) return;
    const knownAccountProviderId = this.deps.accountAiCatalog.peekSnapshot()?.provider.id;
    try {
      const result = await this.deps.accountAiCatalog.getSnapshot();
      if (
        providerId === knownAccountProviderId &&
        result.snapshot?.provider.id !== knownAccountProviderId
      ) {
        throw new Error(`Account AI catalog for provider ${providerId} is unavailable.`);
      }
    } catch (error) {
      this.deps.accountAiCatalog.invalidateForAuthFailure(error);
      if (providerId === knownAccountProviderId) {
        throw new Error(`Account AI catalog refresh failed for provider ${providerId}.`, {
          cause: error,
        });
      }
    }
  }
}

function parseExplicitSkillInvocation(
  message: string,
): { readonly skillName: string; readonly additionalInstructions?: string } | undefined {
  const match = /^\$([a-z0-9][a-z0-9._-]*)(?:\s+([\s\S]*))?$/iu.exec(message.trim());
  if (!match?.[1]) return undefined;
  const instructions = match[2]?.trim();
  return {
    skillName: match[1],
    ...(instructions ? { additionalInstructions: instructions } : {}),
  };
}

function normalizeLocale(locale: string | undefined): 'en' | 'zh' {
  return locale?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function resolvePiTurnRuntimeOptions(input: ExecuteAgentTurnForWebviewInput): {
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxTokens?: number;
  readonly thinkingBudget?: number;
  readonly thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
} {
  const options = input.llmRuntimeOptions;
  const projected = options?.projected === true;
  const providerProjection = projectKnownPiProviderOptions(
    options?.providerOptions,
    options?.thinkingBudget,
  );
  return {
    temperature: projected
      ? options.temperature
      : (options?.temperature ?? input.settings.temperature),
    topP: options?.topP,
    maxTokens: projected ? options.maxTokens : (options?.maxTokens ?? input.settings.maxTokens),
    thinkingBudget: projected
      ? options.thinkingBudget
      : (options?.thinkingBudget ?? input.settings.thinkingBudget),
    thinkingLevel: providerProjection.thinkingLevel,
  };
}

function projectKnownPiProviderOptions(
  providerOptions: Record<string, unknown> | undefined,
  thinkingBudget: number | undefined,
): {
  readonly thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
} {
  if (!providerOptions || Object.keys(providerOptions).length === 0) return {};
  const keys = Object.keys(providerOptions);
  const anthropic = providerOptions.anthropic;
  if (keys.length === 1 && isRecord(anthropic)) {
    const anthropicKeys = Object.keys(anthropic);
    const thinking = anthropic.thinking;
    if (
      anthropicKeys.length === 1 &&
      isRecord(thinking) &&
      thinking.type === 'enabled' &&
      thinking.budgetTokens === thinkingBudget
    ) {
      return { thinkingLevel: 'medium' };
    }
    if (
      anthropicKeys.length === 1 &&
      isPiThinkingLevel(anthropic.effort) &&
      anthropic.effort !== 'off'
    ) {
      return { thinkingLevel: anthropic.effort };
    }
  }
  const openai = providerOptions.openai;
  if (keys.length === 1 && isRecord(openai)) {
    const openaiKeys = Object.keys(openai);
    if (openaiKeys.length === 1 && isPiThinkingLevel(openai.reasoningEffort)) {
      return { thinkingLevel: openai.reasoningEffort };
    }
  }
  throw new Error('Provider-specific LLM options have no exact Pi model-policy projection.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPiThinkingLevel(
  value: unknown,
): value is 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' {
  return (
    value === 'off' ||
    value === 'minimal' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'xhigh' ||
    value === 'max'
  );
}
