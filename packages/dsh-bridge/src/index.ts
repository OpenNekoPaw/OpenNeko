import { randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import {
  AgentSideConnection,
  PROTOCOL_VERSION,
  RequestError,
  ndJsonStream,
  type Agent as AcpAgent,
  type AgentSideConnection as AcpConnection,
  type ContentBlock as AcpContentBlock,
  type ListSessionsResponse,
  type PromptResponse,
  type SessionConfigOption,
  type SessionModeState,
  type SessionNotification,
  type Stream,
} from '@agentclientprotocol/sdk';
import type { AgentHandle } from '@deepseek-ai/dsh-agent';
import type { Context } from '@deepseek-ai/cordis';
import { createUserMessage, errorChain } from '@deepseek-ai/dsh-llm';
import { SessionId, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session';
import type {} from '@deepseek-ai/dsh-session-persistence';
import type {} from '@deepseek-ai/dsh-system-prompt';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import { setApprovalPolicy, type ApprovalOutcome } from '@deepseek-ai/dsh-user-approval';
import Schema from '@deepseek-ai/schemastery';
import {
  DSH_ACP_MODEL_CONFIG_ID,
  DSH_ACP_EXTENSION_METHODS,
  decodeDshAcpModelConfiguration,
  decodeDshAcpSessionContextSetRequest,
  decodeDshAcpDomainToolRequest,
  decodeDshAcpDomainToolResponse,
  encodeDshAcpModelConfiguration,
  type DshAcpHostToolPort,
} from '@neko/agent-contracts/dsh-acp';
import { PromptAdmission } from './prompt-admission.js';

export const name = 'openneko-acp';
export const inject = ['agents', 'approval', 'sessions', 'sessionPersistence', 'systemPrompt'];

declare module '@deepseek-ai/cordis' {
  interface Context {
    opennekoHostTools: DshAcpHostToolPort<ToolRunContext>;
  }
}

export interface OpenNekoDshBridgeConfig {
  readonly provider?: string;
  readonly model?: string;
  readonly maxTokens?: number;
  readonly agentPreset?: string;
  readonly stream?: Stream;
}

export const Config = Schema.object({
  provider: Schema.string(),
  model: Schema.string(),
  maxTokens: Schema.number(),
  agentPreset: Schema.string().default('openneko'),
});

interface OwnedSession {
  readonly handle: AgentHandle;
  readonly configuration: DshSessionConfiguration;
  readonly runtimeContext: DshSessionRuntimeContext;
  inflight: InflightPrompt | undefined;
  outputTail: Promise<void>;
}

interface DshSessionRuntimeContext {
  text: string;
}

interface DshSessionConfiguration {
  readonly provider?: string;
  readonly model?: string;
  readonly maxTokens?: number;
  readonly mode: 'ask' | 'auto';
}

interface InflightPrompt {
  readonly completion: Deferred<'end_turn' | 'max_tokens' | 'cancelled'>;
  turn: number | undefined;
  cancelRequested: boolean;
  settlementStarted: boolean;
  failure: Error | undefined;
  endReason: SessionEvent<'turn/end'>['data']['reason'] | undefined;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
}

export function apply(ctx: Context, config: OpenNekoDshBridgeConfig): void {
  const owned = new Map<string, OwnedSession>();
  const promptAdmission = new PromptAdmission<PromptResponse>();
  const preset = config.agentPreset ?? 'openneko';
  const virtualCwd = process.cwd();
  let connection: AcpConnection;
  let closed = false;

  const requireOpen = (): void => {
    if (closed) throw RequestError.internalError(undefined, 'OpenNeko ACP bridge is closed.');
  };
  const requireOwned = (sessionId: string): OwnedSession => {
    const record = owned.get(sessionId);
    if (record === undefined) {
      throw RequestError.invalidParams(undefined, `Unknown or inactive session: ${sessionId}`);
    }
    return record;
  };
  const notify = (notification: SessionNotification): Promise<void> =>
    connection.sessionUpdate(notification);
  const hostTools: DshAcpHostToolPort<ToolRunContext> = {
    async execute(request, execution) {
      requireOpen();
      const agent = execution.agent;
      if (agent === undefined) {
        throw new Error(`OpenNeko Host Tool ${execution.callId} has no DSH Agent owner.`);
      }
      const record = requireOwned(agent.id);
      if (record.handle.agent !== agent) {
        throw new Error(`OpenNeko Host Tool ${execution.callId} has a stale DSH Agent owner.`);
      }
      const turn = findToolCallTurn(agent.session.events, execution.callId);
      const wireRequest = decodeDshAcpDomainToolRequest({
        sessionId: agent.id,
        turn,
        toolCallId: execution.callId,
        tool: request.tool,
        operation: request.operation,
        input: request.input,
      });
      if (execution.signal.aborted) {
        throw new Error(`OpenNeko Host Tool ${execution.callId} was cancelled before dispatch.`);
      }
      let cancelSent = false;
      let cancelFailure: unknown;
      const sendCancel = (): void => {
        if (cancelSent) return;
        cancelSent = true;
        void connection
          .extMethod(DSH_ACP_EXTENSION_METHODS.cancelDomainTool, {
            sessionId: agent.id,
            turn,
            toolCallId: execution.callId,
          })
          .catch((error: unknown) => {
            cancelFailure = error;
          });
      };
      execution.signal.addEventListener('abort', sendCancel, { once: true });
      try {
        const response = await connection.extMethod(DSH_ACP_EXTENSION_METHODS.executeDomainTool, {
          ...wireRequest,
        });
        if (execution.signal.aborted) {
          const cancelDiagnostic =
            cancelFailure === undefined
              ? ''
              : `; cancel extension failed: ${cancelFailure instanceof Error ? cancelFailure.message : String(cancelFailure)}`;
          throw new Error(
            `OpenNeko Host Tool ${execution.callId} was cancelled before its result was accepted${cancelDiagnostic}.`,
          );
        }
        return decodeDshAcpDomainToolResponse(response);
      } finally {
        execution.signal.removeEventListener('abort', sendCancel);
      }
    },
  };
  ctx.provide('opennekoHostTools', hostTools);
  const publishEvent = async (sessionId: string, event: SessionEvent): Promise<void> => {
    const standardNotifications = projectSessionEvent(sessionId, event);
    if (standardNotifications.length > 0) {
      for (const notification of standardNotifications) await notify(notification);
      return;
    }
    await connection.extNotification('openneko/session/event', {
      sessionId,
      sequence: event.seq,
      type: event.type,
      data: event.data,
    });
  };

  ctx.on('agent/inbox/claimed', ({ agent, turn }) => {
    const inflight = owned.get(agent.id)?.inflight;
    if (inflight !== undefined && inflight.turn === undefined) inflight.turn = turn;
  });
  ctx.on('agent/error', ({ agent, turn, error }) => {
    const record = owned.get(agent.id);
    if (record?.inflight === undefined) return;
    if (record.inflight.turn === undefined || record.inflight.turn === turn) {
      record.inflight.failure = new Error(errorChain(error));
      settlePrompt(record);
    }
  });
  ctx.on('session/event', (session, event) => {
    const record = owned.get(session.id);
    if (record === undefined || record.handle.agent.session !== session) return;
    record.outputTail = record.outputTail
      .then(async () => {
        await publishEvent(session.id, event);
      })
      .catch((error: unknown) => {
        if (record.inflight !== undefined) record.inflight.failure = toError(error);
      });
    if (
      event.type === 'turn/end' &&
      record.inflight !== undefined &&
      record.inflight.turn === event.data.turn
    ) {
      record.inflight.endReason = event.data.reason;
      settlePrompt(record);
    }
  });
  ctx.on('approval/request', async (request, next) => {
    const record = owned.get(request.agent.id);
    if (record === undefined || record.handle.agent !== request.agent) return next();
    if (record.configuration.mode === 'auto') return 'allowed-once';
    if (request.callId === undefined) return 'unavailable';
    const turn = findToolCallTurn(request.agent.session.events, request.callId);
    const response = await connection.requestPermission({
      sessionId: request.agent.id,
      _meta: { opennekoTurn: turn },
      toolCall: {
        toolCallId: request.callId,
        title: request.reason ?? request.toolName,
        status: 'pending',
      },
      options: [
        { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' },
      ],
    });
    return projectApprovalOutcome(response.outcome);
  });

  const makeAgent = (nextConnection: AcpConnection): AcpAgent => {
    connection = nextConnection;
    return {
      async initialize() {
        return {
          protocolVersion: PROTOCOL_VERSION,
          agentInfo: { name: '@neko/dsh-bridge', version: 'development' },
          agentCapabilities: {
            loadSession: true,
            promptCapabilities: { image: false, audio: false, embeddedContext: false },
            sessionCapabilities: { list: {}, resume: {}, close: {} },
          },
          authMethods: [],
        };
      },
      authenticate() {
        return Promise.resolve();
      },
      async newSession(params) {
        requireOpen();
        validateLifecycleRequest(params, virtualCwd);
        const sessionId = SessionId(randomUUID());
        const configuration = defaultSessionConfiguration(config);
        const runtimeContext = createSessionRuntimeContext();
        const handle = await ctx.agents.create({
          sessionId,
          meta: { cwd: params.cwd, agentPreset: preset },
          agentOptions: agentOptions(configuration),
          setup: setupSessionRuntimeContext(runtimeContext),
        });
        if (closed) {
          await handle.dispose();
          throw RequestError.internalError(undefined, 'Connection closed during session/new.');
        }
        owned.set(sessionId, createOwnedSession(handle, configuration, runtimeContext));
        return {
          sessionId,
          modes: projectModeState(configuration.mode),
          configOptions: projectModelConfigOptions(configuration),
        };
      },
      async listSessions(params) {
        requireOpen();
        if (params.cursor !== undefined && params.cursor !== null) {
          throw RequestError.invalidParams(undefined, 'Session list cursors are not supported.');
        }
        if (params.cwd !== virtualCwd) {
          throw RequestError.invalidParams(
            undefined,
            'cwd does not match the configured virtual workspace.',
          );
        }
        const headers = await ctx.sessionPersistence.list();
        return listOpenNekoSessions(headers, preset, virtualCwd);
      },
      async loadSession(params) {
        requireOpen();
        validateLifecycleRequest(params, virtualCwd);
        const record = await resumeOwnedSession(
          ctx,
          owned,
          params.sessionId,
          params.cwd,
          config,
          preset,
        );
        for (const event of record.handle.agent.session.events)
          await publishEvent(params.sessionId, event);
        return {
          modes: projectModeState(record.configuration.mode),
          configOptions: projectModelConfigOptions(record.configuration),
        };
      },
      async resumeSession(params) {
        requireOpen();
        validateLifecycleRequest({ ...params, mcpServers: params.mcpServers ?? [] }, virtualCwd);
        const record = await resumeOwnedSession(
          ctx,
          owned,
          params.sessionId,
          params.cwd,
          config,
          preset,
        );
        return {
          modes: projectModeState(record.configuration.mode),
          configOptions: projectModelConfigOptions(record.configuration),
        };
      },
      async closeSession(params) {
        requireOpen();
        const record = requireOwned(params.sessionId);
        promptAdmission.cancel(params.sessionId);
        owned.delete(params.sessionId);
        record.handle.agent.cancel({ kind: 'user' });
        await record.handle.agent.whenIdle();
        await record.outputTail;
        await ctx.sessions.flush(record.handle.agent.session);
        await record.handle.dispose();
        return {};
      },
      async setSessionMode(params) {
        requireOpen();
        const record = requireOwned(params.sessionId);
        if (params.modeId !== 'ask' && params.modeId !== 'auto') {
          throw RequestError.invalidParams(undefined, `Unsupported Session mode: ${params.modeId}`);
        }
        const configuration: DshSessionConfiguration = {
          ...record.configuration,
          mode: params.modeId,
        };
        setApprovalPolicy(record.handle.agent.session, 'ask');
        owned.set(params.sessionId, { ...record, configuration });
        return {};
      },
      async setSessionConfigOption(params) {
        requireOpen();
        if (params.configId !== DSH_ACP_MODEL_CONFIG_ID || typeof params.value !== 'string') {
          throw RequestError.invalidParams(
            undefined,
            `Unsupported Session configuration option: ${params.configId}`,
          );
        }
        const selected = decodeDshAcpModelConfiguration(params.value);
        const current = requireOwned(params.sessionId);
        if (current.handle.agent.status !== 'idle' || current.inflight !== undefined) {
          throw RequestError.invalidParams(
            undefined,
            `Session configuration cannot change while the Agent is running: ${params.sessionId}`,
          );
        }
        const configuration: DshSessionConfiguration = {
          provider: selected.providerId,
          model: selected.modelId,
          maxTokens: selected.maxTokens,
          mode: current.configuration.mode,
        };
        if (isSameModelConfiguration(current.configuration, configuration)) {
          return { configOptions: projectModelConfigOptions(current.configuration) };
        }
        await replaceOwnedAgent(ctx, owned, params.sessionId, current, configuration);
        return { configOptions: projectModelConfigOptions(configuration) };
      },
      async prompt(params) {
        requireOpen();
        requireOwned(params.sessionId);
        const content = admitPrompt(params.prompt);
        return promptAdmission.run(params.sessionId, async () => {
          requireOpen();
          const record = requireOwned(params.sessionId);
          if (record.inflight !== undefined) {
            throw RequestError.invalidParams(
              undefined,
              'A prompt is already in flight for this session.',
            );
          }
          const inflight: InflightPrompt = {
            completion: deferred(),
            turn: undefined,
            cancelRequested: false,
            settlementStarted: false,
            failure: undefined,
            endReason: undefined,
          };
          record.inflight = inflight;
          try {
            record.handle.agent.followup(createUserMessage({ content, source: { kind: 'user' } }));
          } catch (error) {
            record.inflight = undefined;
            throw RequestError.internalError(
              undefined,
              `Prompt was not queued: ${errorChain(error)}`,
            );
          }
          settlePrompt(record);
          return { stopReason: await inflight.completion.promise };
        });
      },
      cancel(params) {
        const admission = promptAdmission.cancel(params.sessionId);
        if (admission === 'queued') return Promise.resolve();
        const record = owned.get(params.sessionId);
        if (record === undefined) return Promise.resolve();
        if (record.inflight !== undefined) record.inflight.cancelRequested = true;
        record.handle.agent.cancel({ kind: 'user' });
        settlePrompt(record);
        return Promise.resolve();
      },
      async extMethod(method, params) {
        requireOpen();
        switch (method) {
          case DSH_ACP_EXTENSION_METHODS.setSessionContext: {
            const request = decodeDshAcpSessionContextSetRequest(params);
            const record = requireOwned(request.sessionId);
            if (record.handle.agent.status !== 'idle' || record.inflight !== undefined) {
              throw RequestError.invalidParams(
                undefined,
                `Session context cannot change while the Agent is running: ${request.sessionId}`,
              );
            }
            record.runtimeContext.text = request.text;
            return {};
          }
          case 'openneko/session/inbox/read': {
            const record = requireOwned(requireNonEmptyString(params.sessionId, 'sessionId'));
            return projectInbox(record);
          }
          case 'openneko/session/inbox/replace': {
            const record = requireOwned(requireNonEmptyString(params.sessionId, 'sessionId'));
            const messageId = requireNonEmptyString(params.messageId, 'messageId');
            const current = findInboxMessage(record, messageId);
            const replacement = createUserMessage({
              content: decodeInboxContent(params.content),
              source: { kind: 'user' },
            });
            if (!record.handle.agent.inbox.replace(current.id, replacement)) {
              throw RequestError.invalidParams(
                undefined,
                `Inbox message is no longer pending: ${messageId}`,
              );
            }
            await ctx.sessions.flush(record.handle.agent.session);
            return projectInbox(record);
          }
          case 'openneko/session/inbox/remove': {
            const record = requireOwned(requireNonEmptyString(params.sessionId, 'sessionId'));
            const messageId = requireNonEmptyString(params.messageId, 'messageId');
            const current = findInboxMessage(record, messageId);
            if (!record.handle.agent.inbox.remove(current.id)) {
              throw RequestError.invalidParams(
                undefined,
                `Inbox message is no longer pending: ${messageId}`,
              );
            }
            await ctx.sessions.flush(record.handle.agent.session);
            return projectInbox(record);
          }
          default:
            throw RequestError.methodNotFound(method);
        }
      },
    };
  };

  connection = new AgentSideConnection(makeAgent, config.stream ?? createStdioStream());

  let teardown: Promise<void> | undefined;
  const quiesce = (): Promise<void> => {
    if (teardown !== undefined) return teardown;
    closed = true;
    promptAdmission.close();
    const records = [...owned.values()];
    owned.clear();
    for (const record of records) {
      if (record.inflight !== undefined) record.inflight.cancelRequested = true;
      record.handle.agent.cancel({ kind: 'user' });
      settlePrompt(record);
    }
    teardown = Promise.all(
      records.map(async (record) => {
        await record.handle.agent.whenIdle();
        await record.outputTail;
        await ctx.sessions.flush(record.handle.agent.session);
        await record.handle.dispose();
      }),
    ).then(() => undefined);
    return teardown;
  };
  void connection.closed.then(quiesce, quiesce);
  ctx.effect(() => quiesce, 'openneko-acp.connection');

  function settlePrompt(record: OwnedSession): void {
    const inflight = record.inflight;
    if (inflight === undefined || inflight.settlementStarted) return;
    inflight.settlementStarted = true;
    void (async () => {
      await record.handle.agent.whenIdle();
      await record.outputTail;
      if (record.inflight !== inflight) return;
      record.inflight = undefined;
      if (inflight.cancelRequested) {
        inflight.completion.resolve('cancelled');
      } else if (inflight.failure !== undefined) {
        inflight.completion.reject(
          RequestError.internalError(undefined, `Turn failed: ${inflight.failure.message}`),
        );
      } else {
        inflight.completion.resolve(stopReason(inflight.endReason));
      }
    })().catch((error: unknown) => {
      if (record.inflight === inflight) record.inflight = undefined;
      inflight.completion.reject(
        RequestError.internalError(undefined, `Prompt settlement failed: ${errorChain(error)}`),
      );
    });
  }
}

export function listOpenNekoSessions(
  headers: readonly SessionHeader[],
  preset: string,
  virtualCwd: string,
): ListSessionsResponse {
  const sessions: ListSessionsResponse['sessions'] = [];
  const diagnostics: { code: string; message: string; sessionId: string }[] = [];
  for (const header of headers) {
    if (header.agentPreset !== preset) continue;
    if (header.cwd === undefined) {
      diagnostics.push({
        code: 'SESSION_CWD_MISSING',
        message: `OpenNeko DSH session ${header.id} has no working directory.`,
        sessionId: header.id,
      });
      continue;
    }
    if (header.cwd !== virtualCwd) {
      diagnostics.push({
        code: 'SESSION_CWD_MISMATCH',
        message: `OpenNeko DSH session ${header.id} is outside the configured virtual workspace.`,
        sessionId: header.id,
      });
      continue;
    }
    sessions.push({ sessionId: header.id, cwd: header.cwd });
  }
  return {
    sessions,
    ...(diagnostics.length === 0 ? {} : { _meta: { opennekoDiagnostics: diagnostics } }),
  };
}

export function projectSessionEvent(
  sessionId: string,
  event: SessionEvent,
): readonly SessionNotification[] {
  switch (event.type) {
    case 'user/message':
      return projectMessage(sessionId, 'user_message_chunk', event.data.content).map(
        (notification) => withOpenNekoMeta(notification, event.seq),
      );
    case 'assistant/message':
      return projectMessage(sessionId, 'agent_message_chunk', event.data.message.content).map(
        (notification) => withOpenNekoMeta(notification, event.seq),
      );
    case 'tool/call':
      return [
        withOpenNekoMeta(
          {
            sessionId,
            update: {
              sessionUpdate: 'tool_call',
              toolCallId: event.data.callId,
              title: event.data.name,
              status: 'pending',
              rawInput: parseToolInput(event.data.arguments),
            },
          },
          event.seq,
          event.data.turn,
        ),
      ];
    case 'tool/result':
      const result = event.data.message.content[0];
      return [
        withOpenNekoMeta(
          {
            sessionId,
            update: {
              sessionUpdate: 'tool_call_update',
              toolCallId: result.toolCallId,
              status: result.isError ? 'failed' : 'completed',
              rawOutput: result.content,
            },
          },
          event.seq,
          event.data.turn,
        ),
      ];
    default:
      return [];
  }
}

function projectMessage(
  sessionId: string,
  sessionUpdate: 'user_message_chunk' | 'agent_message_chunk',
  content: readonly { readonly type: string; readonly text?: string }[],
): readonly SessionNotification[] {
  return content.flatMap((block) =>
    block.type === 'text' && block.text !== undefined && block.text.length > 0
      ? [{ sessionId, update: { sessionUpdate, content: { type: 'text', text: block.text } } }]
      : [],
  );
}

function withOpenNekoMeta(
  notification: SessionNotification,
  sequence: number,
  turn?: number,
): SessionNotification {
  return {
    ...notification,
    _meta: {
      ...(notification._meta === undefined || notification._meta === null
        ? {}
        : notification._meta),
      opennekoSequence: sequence,
      ...(turn === undefined ? {} : { opennekoTurn: turn }),
    },
  };
}

function validateLifecycleRequest(
  params: {
    readonly cwd: string;
    readonly additionalDirectories?: readonly string[];
    readonly mcpServers: readonly unknown[];
  },
  virtualCwd: string,
): void {
  if (!isAbsolute(params.cwd)) {
    throw RequestError.invalidParams(undefined, 'cwd must be absolute.');
  }
  if (params.cwd !== virtualCwd) {
    throw RequestError.invalidParams(
      undefined,
      'cwd does not match the configured virtual workspace.',
    );
  }
  if ((params.additionalDirectories?.length ?? 0) > 0) {
    throw RequestError.invalidParams(undefined, 'additionalDirectories are not supported.');
  }
  if (params.mcpServers.length > 0) {
    throw RequestError.invalidParams(undefined, 'ACP-supplied MCP servers are not supported.');
  }
}

async function resumeOwnedSession(
  ctx: Context,
  owned: Map<string, OwnedSession>,
  rawSessionId: string,
  cwd: string,
  config: OpenNekoDshBridgeConfig,
  preset: string,
): Promise<OwnedSession> {
  if (owned.has(rawSessionId)) {
    throw RequestError.invalidParams(undefined, `Session is already active: ${rawSessionId}`);
  }
  const sessionId = SessionId(rawSessionId);
  const inspection = await ctx.sessionPersistence.inspect(sessionId);
  if (inspection.meta.agentPreset !== preset) {
    throw RequestError.invalidParams(
      undefined,
      `Session is not owned by this profile: ${rawSessionId}`,
    );
  }
  if (inspection.meta.cwd !== cwd) {
    throw RequestError.invalidParams(undefined, `Session cwd does not match: ${rawSessionId}`);
  }
  const configuration = defaultSessionConfiguration(config);
  const runtimeContext = createSessionRuntimeContext();
  const handle = await ctx.agents.resume({
    resumeSessionId: sessionId,
    agentOptions: agentOptions(configuration),
    setup: setupSessionRuntimeContext(runtimeContext),
  });
  const record = createOwnedSession(handle, configuration, runtimeContext);
  owned.set(rawSessionId, record);
  return record;
}

async function replaceOwnedAgent(
  ctx: Context,
  owned: Map<string, OwnedSession>,
  rawSessionId: string,
  current: OwnedSession,
  configuration: DshSessionConfiguration,
): Promise<OwnedSession> {
  const sessionId = SessionId(rawSessionId);
  owned.delete(rawSessionId);
  await current.outputTail;
  await ctx.sessions.flush(current.handle.agent.session);
  await current.handle.dispose();
  const handle = await ctx.agents.resume({
    resumeSessionId: sessionId,
    agentOptions: agentOptions(configuration),
    setup: setupSessionRuntimeContext(current.runtimeContext),
  });
  const next = createOwnedSession(handle, configuration, current.runtimeContext);
  owned.set(rawSessionId, next);
  return next;
}

function createOwnedSession(
  handle: AgentHandle,
  configuration: DshSessionConfiguration,
  runtimeContext: DshSessionRuntimeContext,
): OwnedSession {
  return {
    handle,
    configuration,
    runtimeContext,
    inflight: undefined,
    outputTail: Promise.resolve(),
  };
}

function createSessionRuntimeContext(): DshSessionRuntimeContext {
  return { text: '' };
}

function setupSessionRuntimeContext(runtimeContext: DshSessionRuntimeContext) {
  return (agentCtx: Context): void => {
    agentCtx.systemPrompt.context({
      name: 'openneko:product-context',
      order: 0,
      text: () => runtimeContext.text,
    });
  };
}

function findToolCallTurn(events: readonly SessionEvent[], callId: string): number {
  const calls = events.filter(
    (event): event is SessionEvent<'tool/call'> =>
      event.type === 'tool/call' && event.data.callId === callId,
  );
  if (calls.length !== 1) {
    throw new Error(
      `OpenNeko Host Tool ${callId} requires exactly one canonical DSH tool/call event; received ${calls.length}.`,
    );
  }
  const call = calls.at(0);
  if (call === undefined)
    throw new Error(`OpenNeko Host Tool ${callId} has no DSH tool/call event.`);
  return call.data.turn;
}

function defaultSessionConfiguration(config: OpenNekoDshBridgeConfig): DshSessionConfiguration {
  return {
    ...(config.provider === undefined ? {} : { provider: config.provider }),
    ...(config.model === undefined ? {} : { model: config.model }),
    ...(config.maxTokens === undefined ? {} : { maxTokens: config.maxTokens }),
    mode: 'ask',
  };
}

function agentOptions(configuration: DshSessionConfiguration): {
  provider?: string;
  model?: string;
  maxTokens?: number;
} {
  return {
    ...(configuration.provider === undefined ? {} : { provider: configuration.provider }),
    ...(configuration.model === undefined ? {} : { model: configuration.model }),
    ...(configuration.maxTokens === undefined ? {} : { maxTokens: configuration.maxTokens }),
  };
}

function projectModeState(mode: DshSessionConfiguration['mode']): SessionModeState {
  return {
    currentModeId: mode,
    availableModes: [
      { id: 'ask', name: 'Ask', description: 'Request approval before protected operations.' },
      {
        id: 'auto',
        name: 'Auto',
        description: 'Allow protected operations once for this Session.',
      },
    ],
  };
}

function projectModelConfigOptions(configuration: DshSessionConfiguration): SessionConfigOption[] {
  if (
    configuration.provider === undefined ||
    configuration.model === undefined ||
    configuration.maxTokens === undefined
  ) {
    return [];
  }
  const value = encodeDshAcpModelConfiguration({
    providerId: configuration.provider,
    modelId: configuration.model,
    maxTokens: configuration.maxTokens,
  });
  return [
    {
      type: 'select',
      id: DSH_ACP_MODEL_CONFIG_ID,
      name: 'Model',
      category: 'model',
      currentValue: value,
      options: [{ value, name: `${configuration.provider} / ${configuration.model}` }],
    },
  ];
}

function isSameModelConfiguration(
  current: DshSessionConfiguration,
  next: DshSessionConfiguration,
): boolean {
  return (
    current.provider === next.provider &&
    current.model === next.model &&
    current.maxTokens === next.maxTokens
  );
}

function projectApprovalOutcome(
  outcome:
    { readonly outcome: 'cancelled' } | { readonly outcome: 'selected'; readonly optionId: string },
): ApprovalOutcome {
  if (outcome.outcome === 'cancelled') return 'cancelled';
  if (outcome.optionId === 'allow-once') return 'allowed-once';
  if (outcome.optionId === 'reject-once') return 'rejected';
  return 'unavailable';
}

function admitPrompt(prompt: readonly AcpContentBlock[]): { type: 'text'; text: string }[] {
  let text = '';
  for (const block of prompt) {
    if (block.type === 'text') text += block.text;
    else if (block.type === 'resource_link') {
      text += `\n[resource_link name=${JSON.stringify(block.name)} uri=${JSON.stringify(block.uri)}]\n`;
    } else {
      throw RequestError.invalidParams(undefined, `Unsupported prompt content: ${block.type}`);
    }
  }
  if (text.trim().length === 0) {
    throw RequestError.invalidParams(undefined, 'Prompt must contain non-empty text.');
  }
  return [{ type: 'text', text }];
}

function projectInbox(record: OwnedSession): Record<string, unknown> {
  return {
    nextTurn: record.handle.agent.inbox.nextTurn.map(projectInboxMessage),
    nextStep: record.handle.agent.inbox.nextStep.map(projectInboxMessage),
  };
}

function projectInboxMessage(message: {
  readonly id: string;
  readonly content: readonly { readonly type: string; readonly text?: string }[];
}): Record<string, unknown> {
  const content = message.content.map((block) => {
    if (block.type !== 'text' || block.text === undefined) {
      throw RequestError.internalError(
        undefined,
        `Inbox message ${message.id} contains unsupported content: ${block.type}`,
      );
    }
    return { type: 'text', text: block.text };
  });
  return { messageId: message.id, content };
}

function findInboxMessage(record: OwnedSession, messageId: string) {
  const message = [
    ...record.handle.agent.inbox.nextTurn,
    ...record.handle.agent.inbox.nextStep,
  ].find((candidate) => candidate.id === messageId);
  if (message === undefined) {
    throw RequestError.invalidParams(undefined, `Unknown inbox message: ${messageId}`);
  }
  return message;
}

function decodeInboxContent(input: unknown): { type: 'text'; text: string }[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw RequestError.invalidParams(undefined, 'Inbox content must be a non-empty array.');
  }
  return input.map((block, index) => {
    if (!isRecord(block)) {
      throw RequestError.invalidParams(undefined, `Inbox content[${index}] must be an object.`);
    }
    const type = block.type;
    if (type !== 'text') {
      throw RequestError.invalidParams(
        undefined,
        `Inbox content[${index}] has unsupported type: ${String(type)}`,
      );
    }
    return {
      type: 'text' as const,
      text: requireString(block.text, `content[${index}].text`),
    };
  });
}

function requireNonEmptyString(input: unknown, field: string): string {
  const value = requireString(input, field);
  if (value.length === 0) {
    throw RequestError.invalidParams(undefined, `${field} must not be empty.`);
  }
  return value;
}

function requireString(input: unknown, field: string): string {
  if (typeof input !== 'string') {
    throw RequestError.invalidParams(undefined, `${field} must be a string.`);
  }
  return input;
}

function parseToolInput(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return input !== null && typeof input === 'object' && !Array.isArray(input);
}

function stopReason(
  reason: SessionEvent<'turn/end'>['data']['reason'] | undefined,
): 'end_turn' | 'max_tokens' | 'cancelled' {
  if (reason?.kind === 'max-tokens') return 'max_tokens';
  if (reason?.kind === 'interrupted') return 'cancelled';
  return 'end_turn';
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function createStdioStream(): Stream {
  const output = new WritableStream<Uint8Array>({
    write(chunk) {
      return new Promise<void>((resolve, reject) => {
        process.stdout.write(chunk, (error) => (error === null ? resolve() : reject(error)));
      });
    },
  });
  const input = new ReadableStream<Uint8Array>({
    start(controller) {
      const onData = (chunk: Buffer): void => controller.enqueue(chunk);
      const onEnd = (): void => controller.close();
      const onError = (error: Error): void => controller.error(error);
      process.stdin.on('data', onData);
      process.stdin.once('end', onEnd);
      process.stdin.once('error', onError);
    },
  });
  return ndJsonStream(output, input);
}
