import {
  Agent,
  compact,
  estimateContextTokens,
  formatSkillsForSystemPrompt,
  prepareCompaction,
  type AgentEvent,
  type AgentMessage,
} from '@earendil-works/pi-agent-core';
import {
  createAssistantMessageEventStream,
  type Api,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type ImageContent,
  type Model,
  type Models,
  type SimpleStreamOptions,
} from '@earendil-works/pi-ai';
import { Type } from 'typebox';

import {
  bridgePiCapabilityTools,
  type PiCapabilityTool,
  type PiToolPermissionPolicy,
  type PiToolRunIdentity,
} from './capability-tool-bridge';
import { PiEventProjector, type PiProductEventSink } from './event-projector';
import type { AgentModelPolicy, AgentModelParameters } from './model-policy';
import { composeAgentModelPayloadProjector } from './model-payload';
import {
  type ConversationExecutionLease,
  NodePiConversationAuthority,
  PiConversationAuthorityError,
} from './node-conversation-authority';
import type {
  PiSkillHostSnapshot,
  SkillContentReadResult,
  SkillLocator,
  SkillResourceLocator,
} from './skill-host';

export interface OpenPiConversationRuntimeOptions {
  readonly authority: NodePiConversationAuthority;
  readonly lease: ConversationExecutionLease;
  readonly conversationId: string;
  readonly branchId: string;
  readonly models: Models;
  readonly initialModelPolicy: AgentModelPolicy;
  readonly baseSystemPrompt: string;
}

export interface ExecutePiConversationTurnInput {
  readonly turnId: string;
  readonly runId: string;
  readonly prompt: string;
  readonly images?: readonly ImageContent[];
  readonly modelPolicy: AgentModelPolicy;
  readonly skillSnapshot: PiSkillHostSnapshot;
  readonly capabilityTools: readonly PiCapabilityTool[];
  readonly permissionPolicy: PiToolPermissionPolicy;
  readonly workspaceTrusted: boolean;
  readonly events: PiProductEventSink;
  readonly systemPrompt?: string;
}

export interface ExecutePiConversationSkillInput extends Omit<
  ExecutePiConversationTurnInput,
  'prompt'
> {
  readonly skillName: string;
  readonly additionalInstructions?: string;
}

export interface PiCompactionPolicy {
  readonly reserveTokens: number;
  readonly keepRecentTokens: number;
  readonly retainedProductReferences?: readonly string[];
}

export interface PiConversationCompactionResult {
  readonly performed: boolean;
  readonly originalTokens: number;
  readonly compressedTokens: number;
  readonly ratio: number;
}

interface ActiveTurn {
  readonly identity: PiToolRunIdentity;
  readonly projector: PiEventProjector;
  readonly skills: PiSkillHostSnapshot;
}

interface LeaseRenewal {
  stop(): void;
  error(): unknown;
}

export class PiConversationRuntime {
  private activeTurn: ActiveTurn | undefined;
  private disposed = false;
  private lease: ConversationExecutionLease;
  private readonly leaseRenewal: LeaseRenewal;

  private constructor(
    private readonly options: OpenPiConversationRuntimeOptions,
    private readonly agent: Agent,
  ) {
    this.lease = options.lease;
    this.leaseRenewal = startLeaseRenewal(
      options.authority,
      () => this.lease,
      (next) => {
        this.lease = next;
      },
      () => this.agent.abort(),
    );
  }

  static async open(options: OpenPiConversationRuntimeOptions): Promise<PiConversationRuntime> {
    assertLeaseOwner(options);
    const session = await options.authority.openBranch(options.conversationId, options.branchId);
    const context = await session.buildContext();
    const main = options.initialModelPolicy['agent.main'];
    const agent = new Agent({
      initialState: {
        model: copyPiModel(main.model),
        messages: [...context.messages],
        systemPrompt: options.baseSystemPrompt,
        thinkingLevel: main.parameters.thinkingLevel ?? 'off',
      },
      sessionId: (await session.getMetadata()).id,
      thinkingBudgets: main.parameters.thinkingBudgets,
      streamFn: createPolicyStream(options.models, main.parameters),
    });
    return new PiConversationRuntime(options, agent);
  }

  get isBusy(): boolean {
    return this.activeTurn !== undefined;
  }

  get messages(): readonly AgentMessage[] {
    return Object.freeze([...this.agent.state.messages]);
  }

  get contextTokenCount(): number {
    return estimateContextTokens(this.agent.state.messages).tokens;
  }

  async execute(input: ExecutePiConversationTurnInput): Promise<void> {
    await this.runPrompt(input, input.prompt, input.images);
  }

  async executeSkill(input: ExecutePiConversationSkillInput): Promise<void> {
    const prompt = input.skillSnapshot.invoke(input.skillName, input.additionalInstructions);
    await this.runPrompt(input, prompt);
  }

  cancel(identity: Pick<PiToolRunIdentity, 'turnId' | 'runId'>): void {
    this.requireActiveIdentity(identity);
    this.agent.abort();
  }

  steer(identity: Pick<PiToolRunIdentity, 'turnId' | 'runId'>, message: AgentMessage): void {
    this.requireActiveIdentity(identity);
    this.agent.steer(message);
  }

  followUp(identity: Pick<PiToolRunIdentity, 'turnId' | 'runId'>, message: AgentMessage): void {
    this.requireActiveIdentity(identity);
    this.agent.followUp(message);
  }

  async observeTask(
    identity: Pick<PiToolRunIdentity, 'turnId' | 'runId'>,
    taskRef: string,
    observation: unknown,
  ): Promise<void> {
    const active = this.requireActiveIdentity(identity);
    await active.projector.taskObserved(taskRef, observation);
  }

  async clearContext(): Promise<void> {
    this.assertReady();
    this.lease = this.options.authority.renewLease(this.lease);
    await this.options.authority.rollbackBranch(
      this.lease,
      this.options.conversationId,
      this.options.branchId,
      null,
    );
    this.agent.state.messages = [];
  }

  async compactContext(policy: PiCompactionPolicy): Promise<PiConversationCompactionResult> {
    this.assertReady();
    validateCompactionPolicy(policy);
    this.lease = this.options.authority.renewLease(this.lease);
    const session = await this.options.authority.openBranch(
      this.options.conversationId,
      this.options.branchId,
    );
    const preparation = prepareCompaction(await session.getBranch(), {
      enabled: true,
      reserveTokens: policy.reserveTokens,
      keepRecentTokens: policy.keepRecentTokens,
    });
    if (!preparation.ok) throw preparation.error;
    if (preparation.value === undefined) {
      const tokens = this.contextTokenCount;
      return Object.freeze({
        performed: false,
        originalTokens: tokens,
        compressedTokens: tokens,
        ratio: 1,
      });
    }
    if (preparation.value.isSplitTurn && (policy.retainedProductReferences?.length ?? 0) > 0) {
      throw new Error(
        'Pi compaction cannot preserve required product references while splitting a turn.',
      );
    }
    const result = await compact(
      preparation.value,
      this.options.models,
      copyPiModel(this.agent.state.model),
      compactionInstructions(policy.retainedProductReferences),
      undefined,
      this.agent.state.thinkingLevel,
    );
    if (!result.ok) throw result.error;
    this.lease = this.options.authority.renewLease(this.lease);
    await this.options.authority.appendCompaction({
      lease: this.lease,
      conversationId: this.options.conversationId,
      branchId: this.options.branchId,
      summary: result.value.summary,
      firstKeptEntryId: result.value.firstKeptEntryId,
      tokensBefore: result.value.tokensBefore,
      details: result.value.details,
    });
    const context = await this.options.authority.buildContext(
      this.options.conversationId,
      this.options.branchId,
    );
    this.agent.state.messages = [...context.messages];
    const compressedTokens = estimateContextTokens(context.messages).tokens;
    return Object.freeze({
      performed: true,
      originalTokens: result.value.tokensBefore,
      compressedTokens,
      ratio: result.value.tokensBefore === 0 ? 1 : compressedTokens / result.value.tokensBefore,
    });
  }

  updateConversationTitle(title: string): void {
    this.assertReady();
    this.lease = this.options.authority.renewLease(this.lease);
    this.options.authority.updateConversationTitle(this.lease, this.options.conversationId, title);
  }

  async readSkillText(
    identity: Pick<PiToolRunIdentity, 'turnId' | 'runId'>,
    locator: SkillLocator | SkillResourceLocator,
  ): Promise<string> {
    const active = this.requireActiveIdentity(identity);
    return active.skills.readText(locator);
  }

  dispose(): void {
    if (this.activeTurn !== undefined) {
      throw new Error('Cannot dispose a Pi conversation runtime with an active turn.');
    }
    this.disposed = true;
    this.leaseRenewal.stop();
    try {
      this.options.authority.releaseLease(this.lease);
    } catch (error) {
      if (!(error instanceof PiConversationAuthorityError) || error.code !== 'lease-stale') {
        throw error;
      }
    } finally {
      this.agent.reset();
    }
  }

  private async runPrompt(
    input: ExecutePiConversationTurnInput | ExecutePiConversationSkillInput,
    prompt: string,
    images?: readonly ImageContent[],
  ): Promise<void> {
    this.assertReady();
    validateTurnIdentity(input.turnId, input.runId);
    this.lease = this.options.authority.renewLease(this.lease);
    const identity = Object.freeze({
      workspaceId: this.options.authority.workspaceId,
      conversationId: this.options.conversationId,
      branchId: this.options.branchId,
      turnId: input.turnId,
      runId: input.runId,
    });
    const toolBridge = bridgePiCapabilityTools({
      tools: [...input.capabilityTools, createSkillReadTool(input.skillSnapshot)],
      identity,
      workspaceTrusted: input.workspaceTrusted,
      modelPolicy: input.modelPolicy,
      models: this.options.models,
      permissionPolicy: input.permissionPolicy,
    });
    const projector = new PiEventProjector(
      identity,
      input.events,
      Date.now,
      toolBridge.resolveDomainToolName,
    );
    this.options.authority.startTurnDurability(this.options.conversationId, input.turnId);
    const main = input.modelPolicy['agent.main'];
    this.agent.state.model = copyPiModel(main.model);
    this.agent.state.thinkingLevel = main.parameters.thinkingLevel ?? 'off';
    this.agent.thinkingBudgets = main.parameters.thinkingBudgets;
    this.agent.state.tools = [...toolBridge.tools];
    this.agent.state.systemPrompt = composeSystemPrompt(
      input.systemPrompt ?? this.options.baseSystemPrompt,
      input.skillSnapshot,
    );
    this.agent.streamFn = createPolicyStream(this.options.models, main.parameters);
    this.agent.beforeToolCall = toolBridge.beforeToolCall;
    this.activeTurn = { identity, projector, skills: input.skillSnapshot };
    const turnMessages: AgentMessage[] = [];
    const unsubscribe = this.agent.subscribe(async (event) => {
      if (event.type === 'message_end') turnMessages.push(structuredClone(event.message));
      await projector.project(event);
      if (event.type === 'agent_start') {
        await projector.persistenceChanged('volatile');
      }
      if (event.type === 'agent_end') {
        await projector.persistenceChanged('persisting');
        try {
          await this.options.authority.checkpointTurn({
            lease: this.lease,
            conversationId: this.options.conversationId,
            branchId: this.options.branchId,
            turnId: input.turnId,
            terminalState: terminalState(event),
            messages: turnMessages,
          });
          await projector.persistenceChanged('durable');
        } catch (error) {
          await projector.persistenceChanged(
            'persistence-delayed',
            'Pi turn checkpoint failed; the completed turn is not durable.',
          );
          throw error;
        }
      }
    });
    try {
      await this.agent.prompt(prompt, images === undefined ? undefined : [...images]);
      const renewalError = this.leaseRenewal.error();
      if (renewalError !== undefined) throw renewalError;
    } finally {
      unsubscribe();
      this.activeTurn = undefined;
    }
  }

  private assertReady(): void {
    if (this.disposed) throw new Error('Pi conversation runtime is disposed.');
    const renewalError = this.leaseRenewal.error();
    if (renewalError !== undefined) throw renewalError;
    if (this.activeTurn !== undefined || this.agent.state.isStreaming) {
      throw new Error('Pi conversation runtime already has an active turn.');
    }
  }

  private requireActiveIdentity(identity: Pick<PiToolRunIdentity, 'turnId' | 'runId'>): ActiveTurn {
    const active = this.activeTurn;
    if (
      active === undefined ||
      active.identity.turnId !== identity.turnId ||
      active.identity.runId !== identity.runId
    ) {
      throw new Error(
        `Pi conversation operation identity ${identity.turnId}/${identity.runId} does not own the active turn.`,
      );
    }
    return active;
  }
}

function startLeaseRenewal(
  authority: NodePiConversationAuthority,
  current: () => ConversationExecutionLease,
  update: (lease: ConversationExecutionLease) => void,
  onFailure: () => void,
): LeaseRenewal {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failure: unknown;
  let stopped = false;
  const schedule = (): void => {
    if (stopped) return;
    timer = setTimeout(() => {
      try {
        update(authority.renewLease(current()));
        schedule();
      } catch (error) {
        failure = error;
        onFailure();
      }
    }, authority.leaseRenewalDelay(current()));
    timer.unref?.();
  };
  schedule();
  return {
    stop: () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    },
    error: () => failure,
  };
}

function createPolicyStream(models: Models, parameters: Readonly<AgentModelParameters>) {
  return (
    model: Model<Api>,
    context: Parameters<Models['streamSimple']>[1],
    options?: SimpleStreamOptions,
  ) => {
    const onPayload = composeAgentModelPayloadProjector(parameters, options?.onPayload);
    const timeoutController =
      parameters.timeoutMs === undefined ? undefined : new AbortController();
    const signal = composeProviderRequestSignal(options?.signal, timeoutController?.signal);
    const source = models.streamSimple(model, context, {
      ...(parameters.temperature === undefined ? {} : { temperature: parameters.temperature }),
      ...(parameters.maxTokens === undefined ? {} : { maxTokens: parameters.maxTokens }),
      ...(parameters.transport === undefined ? {} : { transport: parameters.transport }),
      ...(parameters.cacheRetention === undefined
        ? {}
        : { cacheRetention: parameters.cacheRetention }),
      ...(parameters.timeoutMs === undefined ? {} : { timeoutMs: parameters.timeoutMs }),
      ...(parameters.maxRetries === undefined ? {} : { maxRetries: parameters.maxRetries }),
      ...(parameters.maxRetryDelayMs === undefined
        ? {}
        : { maxRetryDelayMs: parameters.maxRetryDelayMs }),
      ...(parameters.headers === undefined ? {} : { headers: { ...parameters.headers } }),
      ...(parameters.metadata === undefined ? {} : { metadata: { ...parameters.metadata } }),
      ...(options?.reasoning === undefined ? {} : { reasoning: options.reasoning }),
      ...(signal === undefined ? {} : { signal }),
      ...(options?.sessionId === undefined ? {} : { sessionId: options.sessionId }),
      ...(onPayload === undefined ? {} : { onPayload }),
    });
    return parameters.timeoutMs === undefined || timeoutController === undefined
      ? source
      : enforceProviderStreamIdleTimeout(source, model, parameters.timeoutMs, timeoutController);
  };
}

function composeProviderRequestSignal(
  caller: AbortSignal | undefined,
  timeout: AbortSignal | undefined,
): AbortSignal | undefined {
  if (caller === undefined) return timeout;
  if (timeout === undefined) return caller;
  return AbortSignal.any([caller, timeout]);
}

function enforceProviderStreamIdleTimeout(
  source: AssistantMessageEventStream,
  model: Model<Api>,
  timeoutMs: number,
  controller: AbortController,
): AssistantMessageEventStream {
  const output = createAssistantMessageEventStream();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  let terminal = false;
  const clearTimer = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const armTimer = (): void => {
    clearTimer();
    timer = setTimeout(() => {
      if (terminal) return;
      timedOut = true;
      terminal = true;
      const message = providerTimeoutMessage(model, timeoutMs);
      controller.abort(new Error(message.errorMessage));
      output.push({ type: 'error', reason: 'error', error: message });
      output.end();
    }, timeoutMs);
    timer.unref?.();
  };

  armTimer();
  void (async () => {
    try {
      for await (const event of source) {
        if (timedOut) continue;
        terminal = event.type === 'done' || event.type === 'error';
        output.push(event);
        if (terminal) {
          clearTimer();
        } else {
          armTimer();
        }
      }
      if (!timedOut) output.end();
    } catch (error) {
      if (timedOut) return;
      terminal = true;
      const message = providerStreamFailureMessage(model, error);
      output.push({ type: 'error', reason: 'error', error: message });
      output.end();
    } finally {
      clearTimer();
    }
  })();
  return output;
}

function providerStreamFailureMessage(model: Model<Api>, error: unknown): AssistantMessage {
  const detail = error instanceof Error ? error.message : String(error);
  return {
    ...providerTimeoutMessage(model, 0),
    errorMessage: `Pi provider request ${model.provider}/${model.id} failed: ${detail}`,
  };
}

function providerTimeoutMessage(model: Model<Api>, timeoutMs: number): AssistantMessage {
  return {
    role: 'assistant',
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'error',
    errorMessage: `Pi provider request ${model.provider}/${model.id} was idle for ${timeoutMs}ms.`,
    timestamp: Date.now(),
  };
}

function composeSystemPrompt(base: string, skills: PiSkillHostSnapshot): string {
  const catalog = formatSkillsForSystemPrompt([...skills.skills]);
  if (catalog.length === 0) return base;
  return `${base}\n\n${catalog}\n\nSkill locations under /__neko_skills/ are opaque, process-local locators. Pass a matching Skill locator, or a contained relative resource locator under the same virtual directory, only to the read_skill tool. Never pass these locators to workspace file, content, cache, path-resolution, shell, or Webview tools.`;
}

function createSkillReadTool(
  skills: PiSkillHostSnapshot,
): PiCapabilityTool<SkillContentReadResult['receipt']> {
  const tool: PiCapabilityTool<SkillContentReadResult['receipt']> = {
    name: 'read_skill',
    label: 'Read Skill',
    description:
      'Read one trusted, enabled Skill file or its contained relative resource from an opaque /__neko_skills/ locator.',
    isReadOnly: true,
    requiresConfirmation: false,
    parameters: Type.Object(
      { locator: Type.String({ minLength: 1 }) },
      { additionalProperties: false },
    ),
    execute: async ({ args }) => {
      if (
        typeof args !== 'object' ||
        args === null ||
        !('locator' in args) ||
        typeof args.locator !== 'string'
      ) {
        throw new Error('read_skill requires a string locator.');
      }
      const result = await skills.readModelSelectedContent(args.locator);
      return {
        content: [{ type: 'text' as const, text: result.content }],
        details: result.receipt,
      };
    },
  };
  return Object.freeze(tool);
}

function terminalState(
  event: Extract<AgentEvent, { type: 'agent_end' }>,
): 'completed' | 'cancelled' | 'failed' {
  for (let index = event.messages.length - 1; index >= 0; index -= 1) {
    const message = event.messages[index];
    if (
      typeof message === 'object' &&
      message !== null &&
      'role' in message &&
      message.role === 'assistant' &&
      'stopReason' in message
    ) {
      if (message.stopReason === 'aborted') return 'cancelled';
      if (message.stopReason === 'error') return 'failed';
      return 'completed';
    }
  }
  return 'completed';
}

function copyPiModel(model: Readonly<Model<Api>>): Model<Api> {
  return structuredClone(model);
}

function assertLeaseOwner(options: OpenPiConversationRuntimeOptions): void {
  if (options.lease.conversationId !== options.conversationId) {
    throw new Error(
      `Pi conversation runtime lease owner mismatch: ${options.lease.conversationId} != ${options.conversationId}.`,
    );
  }
}

function validateTurnIdentity(turnId: string, runId: string): void {
  if (turnId.trim().length === 0 || runId.trim().length === 0) {
    throw new Error('Pi conversation turnId and runId must be non-empty.');
  }
}

function validateCompactionPolicy(policy: PiCompactionPolicy): void {
  for (const [name, value] of [
    ['reserveTokens', policy.reserveTokens],
    ['keepRecentTokens', policy.keepRecentTokens],
  ] as const) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`Pi compaction ${name} must be a positive integer.`);
    }
  }
  for (const reference of policy.retainedProductReferences ?? []) {
    if (reference.trim().length === 0) {
      throw new Error('Pi compaction product references must be non-empty.');
    }
  }
}

function compactionInstructions(references: readonly string[] | undefined): string | undefined {
  if (references === undefined || references.length === 0) return undefined;
  return `Preserve these OpenNeko product references exactly:\n${references
    .map((reference) => `- ${reference}`)
    .join('\n')}`;
}
