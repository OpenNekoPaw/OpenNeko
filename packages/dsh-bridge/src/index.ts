import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, posix, relative } from 'node:path';
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
  type ToolCallContent,
} from '@agentclientprotocol/sdk';
import { installModelSelection, type AgentHandle } from '@deepseek-ai/dsh-agent';
import type { AttachmentStore, ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import type {} from '@deepseek-ai/dsh-agent-presets';
import type {} from '@deepseek-ai/dsh-commands';
import type { Config as DshMcpClientConfig } from '@deepseek-ai/dsh-mcp-client';
import { Context, type FiberState } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/cordis-plugin-loader';
import { createUserMessage, errorChain, type ContentBlock } from '@deepseek-ai/dsh-llm';
import { supportedProtocols } from '@deepseek-ai/dsh-llm-pi-ai';
import { SessionId, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session';
import type {} from '@deepseek-ai/dsh-session-persistence';
import type {} from '@deepseek-ai/dsh-workspace';
import {
  isModelInvocable,
  isSkillName,
  isUserInvocable,
  renderSkillContent,
  type SkillCatalogSnapshot,
  type SkillDefinition,
} from '@deepseek-ai/dsh-skill';
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem';
import type {} from '@deepseek-ai/dsh-system-prompt';
import type {} from '@deepseek-ai/dsh-permission-presets';
import type {} from '@deepseek-ai/dsh-sandbox-policy';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval';
import Schema from '@deepseek-ai/schemastery';
import {
  DSH_ACP_MODEL_CONFIG_ID,
  DSH_ACP_EXTENSION_METHODS,
  decodeDshAcpSessionArchiveRequest,
  decodeDshAcpModelConfiguration,
  decodeDshAcpCommandExecuteRequest,
  decodeDshAcpInboxEnqueueRequest,
  decodeDshAcpImageAttachmentReadRequest,
  decodeDshAcpSkillInvokeRequest,
  decodeDshAcpSkillDetailRequest,
  decodeDshAcpMcpIdentityRequest,
  decodeDshAcpMcpServerInput,
  decodeDshAcpSkillMutationRequest,
  decodeDshAcpSkillObservationRequest,
  decodeDshAcpStagedSkillValidationRequest,
  decodeDshAcpSessionContextSetRequest,
  decodeDshAcpTurnConfiguration,
  decodeDshAcpPermissionPresetProjection,
  decodeDshAcpDomainToolRequest,
  decodeDshAcpDomainToolResponse,
  decodeDshAcpContextPressureProjection,
  encodeDshAcpModelConfiguration,
  projectDshAcpProviderCapabilities,
  type DshAcpExtensionProjection,
  type DshAcpExtensionMcp,
  type DshAcpExtensionSkill,
  type DshAcpMcpServerInput,
  type DshAcpContextPressureProjection,
  type DshAcpHostToolPort,
  type DshAcpInputCatalogProjection,
  type DshAcpSessionEventNotification,
} from '@neko/agent-contracts/dsh-acp';
import {
  AGENT_IMAGE_TRANSPORT_MAX_PAYLOADS,
  AGENT_IMAGE_TRANSPORT_MAX_PAYLOAD_BYTES,
  AGENT_IMAGE_TRANSPORT_MAX_TOTAL_BYTES,
} from '@neko/agent-contracts';
import { PromptAdmission } from './prompt-admission.js';
import { OPENNEKO_PRODUCT_SYSTEM_PROMPT } from './product-system-prompt.js';
import {
  SessionModelConfigurationOwner,
  type DshSessionConfiguration,
} from './session-model-configuration.js';

export const name = 'openneko-acp';
const CORDIS_ACTIVE_FIBER_STATE: FiberState = 2;
export const inject = [
  'agents',
  'agentPresets',
  'approval',
  'attachments',
  'commands',
  'permissionPresets',
  'loader',
  'llm',
  'sandboxPolicy',
  'sessions',
  'sessionPersistence',
  'sessionProjections',
  'skills',
  'systemPrompt',
  'tools',
  'workspaceRegistry',
];

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
  agentPreset: Schema.string().default('standard'),
});

interface OwnedSession {
  readonly handle: AgentHandle;
  readonly runtimeContext: DshSessionRuntimeContext;
  inflight: InflightPrompt | undefined;
  commandAbort: AbortController | undefined;
  outputTail: Promise<void>;
  contextPressure: DshAcpContextPressureProjection | undefined;
}

interface DshSessionProjectionReader {
  snapshot(session: AgentHandle['agent']['session']): {
    readonly asOfSeq: number;
    readonly values: Readonly<Record<string, unknown>>;
  };
}

type OpenNekoDisplayContentBlock =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'resource_link'; readonly name: string; readonly uri: string }
  | {
      readonly type: 'image';
      readonly name: string;
      readonly attachmentId: string;
      readonly mediaType: ImageAttachmentRef['mediaType'];
      readonly bytes: number;
      readonly width: number;
      readonly height: number;
    };

interface PreparedPrompt {
  readonly content: readonly ContentBlock[];
  readonly displayContent?: readonly OpenNekoDisplayContentBlock[];
}

interface DshSessionRuntimeContext {
  text: string;
  readonly modelConfiguration: SessionModelConfigurationOwner;
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

const COMMAND_CONNECTION_CLOSED_DIAGNOSTIC =
  'Command interrupted because the OpenNeko Agent runtime connection closed. Retry after the runtime is available.';

export function apply(ctx: Context, config: OpenNekoDshBridgeConfig): void {
  const owned = new Map<string, OwnedSession>();
  const promptAdmission = new PromptAdmission<PromptResponse>();
  const preset = config.agentPreset ?? 'standard';
  const virtualCwd = process.cwd();
  const extensionLifecycle = new DshExtensionLifecycle(ctx);
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
  const requireReadyOwned = async (sessionId: string): Promise<OwnedSession> => {
    return requireOwned(sessionId);
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
      const record = await requireReadyOwned(agent.id);
      if (record.handle.agent !== agent) {
        throw new Error(`OpenNeko Host Tool ${execution.callId} has a stale DSH Agent owner.`);
      }
      const turn = findToolCallTurn(agent.session.events, execution.callId);
      const sandboxMode = ctx.sandboxPolicy.resolve({ session: agent.session }).mode;
      const wireRequest = decodeDshAcpDomainToolRequest({
        sessionId: agent.id,
        turn,
        toolCallId: execution.callId,
        sandboxMode,
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
  const publishEvent = async (
    sessionId: string,
    event: SessionEvent,
    replay = false,
  ): Promise<void> => {
    if (replay && event.type === 'assistant/chunk') return;
    const standardNotifications = projectSessionEvent(sessionId, event, { replay });
    if (standardNotifications.length > 0) {
      for (const notification of standardNotifications) await notify(notification);
    } else {
      await connection.extNotification(
        'openneko/session/event',
        projectExtensionSessionEvent(sessionId, event, replay),
      );
    }
    await publishContextPressure(requireOwned(sessionId));
  };
  const publishContextPressure = async (record: OwnedSession): Promise<void> => {
    const sessionProjections = requireSessionProjectionReader(ctx);
    const snapshot = sessionProjections.snapshot(record.handle.agent.session);
    const notification = projectContextPressureNotification(record.handle.agent.id, snapshot);
    if (
      notification === undefined ||
      sameContextPressure(record.contextPressure, notification.pressure)
    ) {
      return;
    }
    await connection.extNotification('openneko/session/context-pressure', notification);
    record.contextPressure = notification.pressure;
  };

  ctx.on('agent/inbox/claimed', ({ agent, message, turn }) => {
    const record = owned.get(agent.id);
    const contextText = readOpenNekoRuntimeContext(message.source);
    if (record !== undefined && contextText !== undefined) record.runtimeContext.text = contextText;
    const inflight = record?.inflight;
    if (inflight !== undefined && inflight.turn === undefined) inflight.turn = turn;
  });
  ctx.on('agent/pre-step', async ({ agent, messages }, next) => {
    const record = owned.get(agent.id);
    if (record === undefined) return next();
    const configurations = messages.flatMap((message) => {
      const configuration = readOpenNekoTurnConfiguration(message.source);
      return configuration === undefined ? [] : [configuration];
    });
    if (configurations.length > 1) {
      throw new Error('One DSH step cannot claim multiple OpenNeko Turn configurations.');
    }
    const turnConfiguration = configurations[0];
    if (turnConfiguration !== undefined) {
      if (!ctx.permissionPresets.names.includes(turnConfiguration.permissionPresetId)) {
        throw new Error(
          `Queued Turn permission preset '${turnConfiguration.permissionPresetId}' is unavailable.`,
        );
      }
      const model = decodeDshAcpModelConfiguration(turnConfiguration.model);
      record.runtimeContext.modelConfiguration.apply({
        provider: model.providerId,
        model: model.modelId,
        maxTokens: model.maxTokens,
      });
      ctx.permissionPresets.set(record.handle.agent.session, turnConfiguration.permissionPresetId);
    }
    return next();
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

  const runPrompt = (
    sessionId: string,
    prepare: () => Promise<PreparedPrompt>,
  ): Promise<PromptResponse> =>
    promptAdmission.run(sessionId, async () => {
      requireOpen();
      const record = requireOwned(sessionId);
      if (record.commandAbort !== undefined) {
        throw RequestError.invalidParams(
          undefined,
          `A command is already in flight for this session: ${sessionId}`,
        );
      }
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
      let prepared: PreparedPrompt;
      try {
        prepared = await prepare();
      } catch (error) {
        if (record.inflight === inflight) record.inflight = undefined;
        throw error;
      }
      if (record.inflight !== inflight || inflight.cancelRequested) {
        settlePrompt(record);
        return { stopReason: await inflight.completion.promise };
      }
      try {
        record.handle.agent.followup(
          createUserMessage({
            content: [...prepared.content],
            source:
              prepared.displayContent === undefined
                ? { kind: 'user' as const }
                : {
                    kind: 'user' as const,
                    opennekoDisplayContent: prepared.displayContent,
                  },
          }),
        );
      } catch (error) {
        record.inflight = undefined;
        throw RequestError.internalError(undefined, `Prompt was not queued: ${errorChain(error)}`);
      }
      settlePrompt(record);
      return { stopReason: await inflight.completion.promise };
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
            promptCapabilities: {
              image: true,
              audio: false,
              embeddedContext: false,
            },
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
        validateLifecycleRequest(params);
        const sessionId = SessionId(randomUUID());
        const configuration = defaultSessionConfiguration(config);
        const runtimeContext = createSessionRuntimeContext(configuration);
        const handle = await ctx.agents.create({
          sessionId,
          meta: { cwd: params.cwd, agentPreset: preset },
          agentOptions: {},
          setup: setupSessionRuntimeContext(ctx, preset, runtimeContext),
        });
        if (closed) {
          await handle.dispose();
          throw RequestError.internalError(undefined, 'Connection closed during session/new.');
        }
        const record = createOwnedSession(handle, runtimeContext);
        owned.set(sessionId, record);
        return {
          sessionId,
          modes: projectModeState(ctx, record),
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
        const headers = [
          ...(await ctx.sessionPersistence.list()),
          ...[...owned.values()].map((record) => record.handle.agent.session.header),
        ];
        return listOpenNekoSessions(headers, preset);
      },
      async loadSession(params) {
        requireOpen();
        validateLifecycleRequest(params);
        const record = await resumeOwnedSession(
          ctx,
          owned,
          params.sessionId,
          params.cwd,
          config,
          preset,
        );
        for (const event of record.handle.agent.session.events)
          await publishEvent(params.sessionId, event, true);
        return {
          modes: projectModeState(ctx, record),
          configOptions: projectModelConfigOptions(
            record.runtimeContext.modelConfiguration.active(),
          ),
        };
      },
      async resumeSession(params) {
        requireOpen();
        validateLifecycleRequest({ ...params, mcpServers: params.mcpServers ?? [] });
        const record = await resumeOwnedSession(
          ctx,
          owned,
          params.sessionId,
          params.cwd,
          config,
          preset,
        );
        await publishContextPressure(record);
        return {
          modes: projectModeState(ctx, record),
          configOptions: projectModelConfigOptions(
            record.runtimeContext.modelConfiguration.active(),
          ),
        };
      },
      async closeSession(params) {
        requireOpen();
        const record = await requireReadyOwned(params.sessionId);
        promptAdmission.cancel(params.sessionId);
        owned.delete(params.sessionId);
        record.commandAbort?.abort(new Error('DSH Session closed.'));
        record.handle.agent.cancel({ kind: 'user' });
        await record.handle.agent.whenIdle();
        await record.outputTail;
        await ctx.sessions.flush(record.handle.agent.session);
        await record.handle.dispose();
        return {};
      },
      async setSessionMode(params) {
        requireOpen();
        const record = await requireReadyOwned(params.sessionId);
        if (!ctx.permissionPresets.names.includes(params.modeId)) {
          throw RequestError.invalidParams(undefined, `Unsupported Session mode: ${params.modeId}`);
        }
        ctx.permissionPresets.set(record.handle.agent.session, params.modeId);
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
        const current = await requireReadyOwned(params.sessionId);
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
        };
        current.runtimeContext.modelConfiguration.apply(configuration);
        return { configOptions: projectModelConfigOptions(configuration) };
      },
      async prompt(params) {
        requireOpen();
        return runPrompt(params.sessionId, async () => {
          const content = await admitAcpPrompt(params.prompt, ctx.attachments);
          return {
            content,
            displayContent: projectAcpDisplayContent(params.prompt, content),
          };
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
          case DSH_ACP_EXTENSION_METHODS.archiveSession: {
            const request = decodeDshAcpSessionArchiveRequest(params);
            await ctx.workspaceRegistry.archiveSession(SessionId(request.sessionId));
            return { sessionIds: [...ctx.workspaceRegistry.archivedSessionIds] };
          }
          case DSH_ACP_EXTENSION_METHODS.readArchivedSessions: {
            if (Object.keys(params).length !== 0) {
              throw RequestError.invalidParams(
                undefined,
                'Archived Session read does not accept parameters.',
              );
            }
            return { sessionIds: [...ctx.workspaceRegistry.archivedSessionIds] };
          }
          case DSH_ACP_EXTENSION_METHODS.setSessionContext: {
            const request = decodeDshAcpSessionContextSetRequest(params);
            const record = await requireReadyOwned(request.sessionId);
            if (record.handle.agent.status !== 'idle' || record.inflight !== undefined) {
              throw RequestError.invalidParams(
                undefined,
                `Session context cannot change while the Agent is running: ${request.sessionId}`,
              );
            }
            record.runtimeContext.text = request.text;
            return {};
          }
          case DSH_ACP_EXTENSION_METHODS.readProviderCapabilities: {
            if (Object.keys(params).length !== 0) {
              throw RequestError.invalidParams(
                undefined,
                'Provider capability read does not accept parameters.',
              );
            }
            return {
              ...projectDshAcpProviderCapabilities(
                ctx.llm.listConfigurableProviders(),
                supportedProtocols(),
              ),
            };
          }
          case DSH_ACP_EXTENSION_METHODS.readExtensions: {
            if (Object.keys(params).length !== 0) {
              throw RequestError.invalidParams(
                undefined,
                'Extension catalog read does not accept parameters.',
              );
            }
            const snapshot = await readSkillCatalog(ctx, {
              kind: 'global',
              cwd: virtualCwd,
            });
            return {
              ...projectDshExtensionCatalog(
                snapshot,
                'global',
                await extensionLifecycle.readDisabledSkills(),
                await extensionLifecycle.readMcp(),
              ),
            };
          }
          case DSH_ACP_EXTENSION_METHODS.readSkillDetail: {
            const request = decodeDshAcpSkillDetailRequest(params);
            if (!isSkillName(request.name)) {
              throw RequestError.invalidParams(
                undefined,
                `Invalid DSH Skill name: ${request.name}`,
              );
            }
            const snapshot = await readSkillCatalog(ctx, {
              kind: 'global',
              cwd: virtualCwd,
            });
            const summary = snapshot.skills.find(
              (skill) => skill.name === request.name && skill.source === request.source,
            );
            if (summary !== undefined) {
              const definition = await ctx.skills.get(request.name, { cwd: virtualCwd });
              if (definition === undefined || definition.source !== request.source) {
                throw RequestError.invalidParams(
                  undefined,
                  `DSH Skill '${request.name}' changed before its detail could be read.`,
                );
              }
              return projectDshSkillDetail(definition, request.source);
            }
            const disabled = await extensionLifecycle.readDisabledSkill(
              request.name,
              request.source,
            );
            if (disabled === undefined) {
              throw RequestError.invalidParams(
                undefined,
                `DSH Skill '${request.name}' from '${request.source}' is not available.`,
              );
            }
            return projectDshSkillDetail(disabled, request.source);
          }
          case DSH_ACP_EXTENSION_METHODS.setSkillEnabled: {
            const request = decodeDshAcpSkillMutationRequest(params);
            if (request.enabled === undefined) {
              throw RequestError.invalidParams(undefined, 'Skill enablement is required.');
            }
            await extensionLifecycle.setSkillEnabled({
              name: request.name,
              source: request.source,
              enabled: request.enabled,
            });
            return {};
          }
          case DSH_ACP_EXTENSION_METHODS.removeSkill: {
            await extensionLifecycle.removeSkill(decodeDshAcpSkillMutationRequest(params));
            return {};
          }
          case DSH_ACP_EXTENSION_METHODS.addMcp: {
            await extensionLifecycle.addMcp(decodeDshAcpMcpServerInput(params));
            return {};
          }
          case DSH_ACP_EXTENSION_METHODS.setMcpEnabled: {
            const request = decodeDshAcpMcpIdentityRequest(params);
            if (request.enabled === undefined) {
              throw RequestError.invalidParams(undefined, 'MCP enablement is required.');
            }
            await extensionLifecycle.setMcpEnabled(request.id, request.enabled);
            return {};
          }
          case DSH_ACP_EXTENSION_METHODS.removeMcp: {
            const request = decodeDshAcpMcpIdentityRequest(params);
            await extensionLifecycle.removeMcp(request.id);
            return {};
          }
          case DSH_ACP_EXTENSION_METHODS.validateStagedSkill: {
            const request = decodeDshAcpStagedSkillValidationRequest(params);
            return {
              ...(await validateStagedSkillPackage(
                request.stagingRoot,
                request.layout,
                request.entry,
              )),
            };
          }
          case DSH_ACP_EXTENSION_METHODS.observeSkill: {
            const request = decodeDshAcpSkillObservationRequest(params);
            if (!isSkillName(request.name)) {
              throw RequestError.invalidParams(
                undefined,
                `Invalid DSH Skill name: ${request.name}`,
              );
            }
            const record = await requireReadyOwned(request.sessionId);
            const snapshot = await readSkillCatalog(ctx, {
              kind: 'session',
              agent: record.handle.agent,
            });
            const skill = snapshot.skills.find((candidate) => candidate.name === request.name);
            return {
              complete: snapshot.complete,
              ...(skill === undefined
                ? {}
                : {
                    skill: {
                      name: skill.name,
                      source: skill.source,
                      provider: skill.provider,
                      userInvocable: isUserInvocable(skill),
                      modelInvocable: isModelInvocable(skill),
                    },
                  }),
            };
          }
          case DSH_ACP_EXTENSION_METHODS.readPermissionPresets: {
            const keys = Object.keys(params);
            if (keys.some((key) => key !== 'sessionId')) {
              throw RequestError.invalidParams(
                undefined,
                'Permission preset read accepts only an optional sessionId.',
              );
            }
            const sessionId = params.sessionId;
            if (sessionId !== undefined && typeof sessionId !== 'string') {
              throw RequestError.invalidParams(
                undefined,
                'Permission preset sessionId must be a string.',
              );
            }
            return {
              ...projectPermissionPresets(
                ctx,
                sessionId === undefined ? undefined : await requireReadyOwned(sessionId),
              ),
            };
          }
          case DSH_ACP_EXTENSION_METHODS.readInputCatalog: {
            const keys = Object.keys(params);
            const hasSessionId = keys.length === 1 && keys[0] === 'sessionId';
            const hasCwd = keys.length === 1 && keys[0] === 'cwd';
            if (!hasSessionId && !hasCwd) {
              throw RequestError.invalidParams(
                undefined,
                'Input catalog read requires exactly one sessionId or cwd.',
              );
            }
            if (hasCwd) {
              const cwd = requireAbsoluteCwd(params.cwd, 'Input catalog cwd');
              return { ...(await readPreTurnInputCatalog(ctx, preset, cwd, config)) };
            }
            const record = await requireReadyOwned(
              requireNonEmptyString(params.sessionId, 'sessionId'),
            );
            return { ...(await readAgentInputCatalog(ctx, record.handle.agent)) };
          }
          case DSH_ACP_EXTENSION_METHODS.executeCommand: {
            const request = decodeDshAcpCommandExecuteRequest(params);
            const record = await requireReadyOwned(request.sessionId);
            if (
              record.handle.agent.status !== 'idle' ||
              record.inflight !== undefined ||
              record.commandAbort !== undefined
            ) {
              throw RequestError.invalidParams(
                undefined,
                `Command cannot execute while the Session is busy: ${request.sessionId}`,
              );
            }
            const abort = new AbortController();
            record.commandAbort = abort;
            try {
              const execution = await ctx.commands.execute(
                record.handle.agent,
                request.line,
                [],
                abort.signal,
              );
              if (execution === undefined) {
                throw RequestError.invalidParams(
                  undefined,
                  `Unknown or malformed DSH command: ${request.line}`,
                );
              }
              await record.outputTail;
              await ctx.sessions.flush(record.handle.agent.session);
              return {
                commandId: execution.commandId,
                outcome: execution.result.kind,
                ...(execution.result.text === undefined ? {} : { text: execution.result.text }),
              };
            } finally {
              if (record.commandAbort === abort) record.commandAbort = undefined;
            }
          }
          case DSH_ACP_EXTENSION_METHODS.invokeSkill: {
            const request = decodeDshAcpSkillInvokeRequest(params);
            for (const invocation of request.invocations) {
              if (!isSkillName(invocation.skillName)) {
                throw RequestError.invalidParams(
                  undefined,
                  `Invalid DSH Skill name: ${invocation.skillName}`,
                );
              }
            }
            const response = await runPrompt(request.sessionId, async () => {
              const record = await requireReadyOwned(request.sessionId);
              const snapshot = await readSkillCatalog(ctx, {
                kind: 'session',
                agent: record.handle.agent,
              });
              if (!snapshot.complete) {
                throw RequestError.invalidParams(
                  undefined,
                  `DSH Skill catalog is incomplete for Session: ${request.sessionId}`,
                );
              }
              for (const invocation of request.invocations) {
                const skill = snapshot.skills.find(
                  (candidate) => candidate.name === invocation.skillName,
                );
                if (skill === undefined || !isUserInvocable(skill)) {
                  throw RequestError.invalidParams(
                    undefined,
                    `Unknown, stale, or non-user-invocable DSH Skill: ${invocation.skillName}`,
                  );
                }
              }
              const displayGestures = request.invocations
                .map((invocation) => `$${invocation.skillName}`)
                .join(' ');
              const promptSuffix = request.promptText.length === 0 ? '' : ` ${request.promptText}`;
              const canonicalDisplay = `${displayGestures}${promptSuffix}`;
              if (request.displayText !== canonicalDisplay) {
                throw RequestError.invalidParams(
                  undefined,
                  'DSH Skill display text does not match its canonical invocation.',
                );
              }
              const gesture = `${request.invocations
                .map((invocation) => `/${invocation.skillName}`)
                .join(' ')}${promptSuffix}`;
              return {
                content: [{ type: 'text', text: gesture }],
                displayContent: [{ type: 'text', text: canonicalDisplay }],
              };
            });
            return { stopReason: response.stopReason };
          }
          case DSH_ACP_EXTENSION_METHODS.enqueueInboxMessage: {
            const request = decodeDshAcpInboxEnqueueRequest(params);
            const record = await requireReadyOwned(request.sessionId);
            if (record.handle.agent.status !== 'running' || record.inflight === undefined) {
              throw RequestError.invalidParams(
                undefined,
                `Inbox enqueue requires a running Session: ${request.sessionId}`,
              );
            }
            if (!ctx.permissionPresets.names.includes(request.configuration.permissionPresetId)) {
              throw RequestError.invalidParams(
                undefined,
                `Unsupported queued Turn permission preset: ${request.configuration.permissionPresetId}`,
              );
            }
            const content = await admitAcpPrompt(request.prompt, ctx.attachments);
            const displayContent = bindInboxDisplayContent(request.displayContent, content);
            try {
              record.handle.agent.followup(
                createUserMessage({
                  content,
                  source: {
                    kind: 'user' as const,
                    opennekoDisplayContent: displayContent,
                    opennekoRuntimeContext: request.contextText,
                    opennekoTurnConfiguration: request.configuration,
                  },
                }),
              );
            } catch (error) {
              throw RequestError.internalError(
                undefined,
                `Inbox message was not queued: ${errorChain(error)}`,
              );
            }
            await ctx.sessions.flush(record.handle.agent.session);
            return projectInbox(record);
          }
          case DSH_ACP_EXTENSION_METHODS.readInbox: {
            const record = await requireReadyOwned(
              requireNonEmptyString(params.sessionId, 'sessionId'),
            );
            return projectInbox(record);
          }
          case DSH_ACP_EXTENSION_METHODS.readImageAttachment: {
            const request = decodeDshAcpImageAttachmentReadRequest(params);
            const record = await requireReadyOwned(request.sessionId);
            const ref = findDisplayedImageAttachment(record, request.attachmentId);
            if (ref.bytes > AGENT_IMAGE_TRANSPORT_MAX_PAYLOAD_BYTES) {
              throw RequestError.invalidParams(
                undefined,
                `Image attachment '${request.attachmentId}' exceeds the OpenNeko preview limit.`,
              );
            }
            const stored = await ctx.attachments.readImage(ref);
            return {
              attachment: projectImageAttachmentRef(stored.ref),
              data: Buffer.from(stored.data).toString('base64'),
            };
          }
          case DSH_ACP_EXTENSION_METHODS.replaceInboxMessage: {
            const record = await requireReadyOwned(
              requireNonEmptyString(params.sessionId, 'sessionId'),
            );
            const messageId = requireNonEmptyString(params.messageId, 'messageId');
            const current = findInboxMessage(record, messageId);
            const replacement = createUserMessage({
              content: decodeInboxContent(params.content),
              source: current.source,
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
          case DSH_ACP_EXTENSION_METHODS.sendInboxMessageNow: {
            const record = await requireReadyOwned(
              requireNonEmptyString(params.sessionId, 'sessionId'),
            );
            if (record.handle.agent.status !== 'running' || record.inflight === undefined) {
              throw RequestError.invalidParams(
                undefined,
                `Inbox send-now requires a running Session: ${record.handle.agent.id}`,
              );
            }
            const messageId = requireNonEmptyString(params.messageId, 'messageId');
            const index = record.handle.agent.inbox.nextTurn.findIndex(
              (candidate) => candidate.id === messageId,
            );
            if (index < 0) {
              findInboxMessage(record, messageId);
              throw RequestError.invalidParams(
                undefined,
                `Inbox message is not pending for a future Turn: ${messageId}`,
              );
            }
            if (index > 0) {
              const selected = record.handle.agent.inbox.nextTurn[index];
              if (selected === undefined) {
                throw RequestError.internalError(
                  undefined,
                  `Inbox send-now lost Message identity: ${messageId}`,
                );
              }
              record.handle.agent.inbox.splice('next-turn', index, 1, []);
              record.handle.agent.inbox.prepend('next-turn', selected);
            }
            record.handle.agent.cancel({ kind: 'user' }, { keepInbox: true });
            await ctx.sessions.flush(record.handle.agent.session);
            return projectInbox(record);
          }
          case DSH_ACP_EXTENSION_METHODS.removeInboxMessage: {
            const record = await requireReadyOwned(
              requireNonEmptyString(params.sessionId, 'sessionId'),
            );
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
      record.commandAbort?.abort(new Error(COMMAND_CONNECTION_CLOSED_DIAGNOSTIC));
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

type PersistedMcpServer = DshAcpMcpServerInput & {
  readonly id: string;
  readonly enabled: boolean;
};

export class DshExtensionLifecycle {
  private readonly dshHome: string;
  private readonly personalSkillRoot: string;
  private readonly disabledSkillRoot: string;
  private readonly mcpStatePath: string;
  private readonly mcpLoaderIds = new Map<string, string>();
  private readonly mcpErrors = new Map<string, string>();
  private mcpState: PersistedMcpServer[] | undefined;
  private initialization: Promise<void> | undefined;
  private mcpMutationTail: Promise<void> = Promise.resolve();

  constructor(private readonly ctx: Context) {
    const dshHome = process.env.DSH_HOME;
    if (dshHome === undefined || !isAbsolute(dshHome)) {
      throw new Error('OpenNeko extension lifecycle requires an absolute DSH_HOME.');
    }
    this.dshHome = dshHome;
    this.personalSkillRoot = join(dshHome, 'skills');
    this.disabledSkillRoot = join(dshHome, 'disabled-skills');
    this.mcpStatePath = join(dshHome, 'extensions', 'mcp.json');
  }

  async readDisabledSkills(): Promise<readonly DshAcpExtensionSkill[]> {
    try {
      const root = await realpath(this.disabledSkillRoot);
      const context = new Context();
      const lifecycle = new AbortController();
      const provider = new FileSystemSkillProvider(
        context,
        { signal: lifecycle.signal, invalidate: () => undefined },
        {
          providerName: 'openneko-disabled-personal',
          includeDefaultRoots: false,
          customSkillDirs: [root],
          watch: false,
        },
      );
      try {
        const observation = await provider.list({ cwd: root });
        const candidates = Array.isArray(observation) ? observation : observation.candidates;
        return candidates.map((skill) => ({
          name: skill.name,
          description: skill.description,
          ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
          source: 'user-dsh',
          provider: skill.provider,
          userInvocable: isUserInvocable(skill),
          modelInvocable: isModelInvocable(skill),
          enabled: false,
          manageable: true,
          removable: true,
        }));
      } finally {
        lifecycle.abort();
        await provider.dispose();
      }
    } catch (error) {
      if (hasNodeErrorCode(error, 'ENOENT')) return [];
      throw error;
    }
  }

  async readDisabledSkill(name: string, source: string): Promise<SkillDefinition | undefined> {
    if (source !== 'user-dsh') return undefined;
    let root: string;
    try {
      root = await realpath(this.disabledSkillRoot);
    } catch (error) {
      if (hasNodeErrorCode(error, 'ENOENT')) return undefined;
      throw error;
    }
    const context = new Context();
    const lifecycle = new AbortController();
    const provider = new FileSystemSkillProvider(
      context,
      { signal: lifecycle.signal, invalidate: () => undefined },
      {
        providerName: 'openneko-disabled-personal',
        includeDefaultRoots: false,
        customSkillDirs: [root],
        watch: false,
      },
    );
    try {
      const observation = await provider.list({ cwd: root });
      const candidates = Array.isArray(observation) ? observation : observation.candidates;
      const candidate = candidates.find((skill) => skill.name === name);
      if (candidate === undefined) return undefined;
      return provider.get(candidate, { cwd: root });
    } finally {
      lifecycle.abort();
      await provider.dispose();
    }
  }

  async setSkillEnabled(input: {
    readonly name: string;
    readonly source: string;
    readonly enabled: boolean;
  }): Promise<void> {
    this.requirePersonalSkill(input.name, input.source);
    const sourceRoot = input.enabled ? this.disabledSkillRoot : this.personalSkillRoot;
    const destinationRoot = input.enabled ? this.personalSkillRoot : this.disabledSkillRoot;
    const entry = await findSkillEntry(sourceRoot, input.name);
    if (entry === undefined) {
      throw RequestError.invalidParams(
        undefined,
        `Personal Skill '${input.name}' is not ${input.enabled ? 'disabled' : 'enabled'}.`,
      );
    }
    await mkdir(destinationRoot, { recursive: true });
    const destination = join(destinationRoot, entry.name);
    await requireMissingPath(
      destination,
      `Personal Skill '${input.name}' destination already exists.`,
    );
    await rename(entry.path, destination);
  }

  async removeSkill(input: { readonly name: string; readonly source: string }): Promise<void> {
    this.requirePersonalSkill(input.name, input.source);
    const active = await findSkillEntry(this.personalSkillRoot, input.name);
    const disabled = await findSkillEntry(this.disabledSkillRoot, input.name);
    if (active !== undefined && disabled !== undefined) {
      throw new Error(
        `Personal Skill '${input.name}' has conflicting enabled and disabled entries.`,
      );
    }
    const entry = active ?? disabled;
    if (entry === undefined) {
      throw RequestError.invalidParams(undefined, `Personal Skill '${input.name}' is unavailable.`);
    }
    await rm(entry.path, { recursive: entry.kind === 'directory', force: false });
  }

  async readMcp(): Promise<readonly DshAcpExtensionMcp[]> {
    await this.mcpMutationTail;
    await this.ensureMcpInitialized();
    return (this.mcpState ?? []).map((server) => {
      const loaderId = this.mcpLoaderIds.get(server.id);
      const entry = loaderId === undefined ? undefined : this.ctx.loader.resolve(loaderId);
      const error = this.mcpErrors.get(server.id);
      const ready =
        server.enabled && error === undefined && entry?.fiber?.state === CORDIS_ACTIVE_FIBER_STATE;
      return {
        id: server.id,
        name: server.serverName,
        description: server.description,
        transport: server.transport,
        enabled: server.enabled,
        status: server.enabled ? (ready ? 'ready' : 'error') : 'disabled',
        diagnosticCode: server.enabled
          ? error === undefined
            ? ready
              ? ''
              : 'MCP_NOT_READY'
            : error
          : '',
      };
    });
  }

  async addMcp(input: DshAcpMcpServerInput): Promise<void> {
    validateMcpServerInput(input);
    return this.enqueueMcpMutation(async () => {
      await this.ensureMcpInitialized();
      const id = `openneko-mcp-${input.serverName}`;
      if ((this.mcpState ?? []).some((server) => server.id === id)) {
        throw RequestError.invalidParams(
          undefined,
          `MCP server '${input.serverName}' already exists.`,
        );
      }
      const server = { ...input, id, enabled: true };
      const previous = this.mcpState ?? [];
      this.mcpState = [...previous, server];
      try {
        await this.writeMcpState();
      } catch (error) {
        this.mcpState = previous;
        throw error;
      }
      await this.reconcileMcp(server);
    });
  }

  async setMcpEnabled(id: string, enabled: boolean): Promise<void> {
    return this.enqueueMcpMutation(async () => {
      await this.ensureMcpInitialized();
      const current = this.requireMcp(id);
      if (current.enabled === enabled) return;
      const next = { ...current, enabled };
      const previous = this.mcpState ?? [];
      this.mcpState = previous.map((server) => (server.id === id ? next : server));
      try {
        await this.writeMcpState();
      } catch (error) {
        this.mcpState = previous;
        throw error;
      }
      await this.reconcileMcp(next);
    });
  }

  async removeMcp(id: string): Promise<void> {
    return this.enqueueMcpMutation(async () => {
      await this.ensureMcpInitialized();
      const current = this.requireMcp(id);
      const previous = this.mcpState ?? [];
      const loaderId = this.mcpLoaderIds.get(id);
      if (loaderId !== undefined) await this.ctx.loader.remove(loaderId);
      this.mcpLoaderIds.delete(id);
      this.mcpErrors.delete(id);
      this.mcpState = previous.filter((server) => server.id !== id);
      try {
        await this.writeMcpState();
      } catch (writeError) {
        this.mcpState = previous;
        try {
          await this.reconcileMcp(current);
          if (!this.mcpLoaderIds.has(current.id) || this.mcpErrors.has(current.id)) {
            throw new Error(`MCP server '${current.serverName}' Loader restoration failed.`);
          }
        } catch (restoreError) {
          throw new AggregateError(
            [writeError, restoreError],
            `MCP server '${current.serverName}' removal persistence and Loader restoration failed.`,
          );
        }
        throw writeError;
      }
    });
  }

  private enqueueMcpMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mcpMutationTail.then(operation);
    this.mcpMutationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private requirePersonalSkill(name: string, source: string): void {
    if (!isSkillName(name) || source !== 'user-dsh') {
      throw RequestError.invalidParams(
        undefined,
        'Only canonical personal DSH Skills can be enabled, disabled, or removed.',
      );
    }
  }

  private ensureMcpInitialized(): Promise<void> {
    return (this.initialization ??= this.initializeMcp());
  }

  private async initializeMcp(): Promise<void> {
    this.mcpState = await readMcpState(this.mcpStatePath);
    for (const server of this.mcpState) await this.reconcileMcp(server);
  }

  private async reconcileMcp(server: PersistedMcpServer): Promise<void> {
    const loaderId = this.mcpLoaderIds.get(server.id);
    try {
      if (loaderId === undefined) {
        const created = await this.ctx.loader.create({
          name: '@deepseek-ai/dsh-mcp-client',
          disabled: !server.enabled,
          config: toMcpPluginConfig(server),
        });
        this.mcpLoaderIds.set(server.id, created);
      } else {
        await this.ctx.loader.update(loaderId, {
          disabled: !server.enabled,
          config: toMcpPluginConfig(server),
        });
      }
      this.mcpErrors.delete(server.id);
    } catch (startError) {
      this.mcpErrors.set(server.id, 'MCP_START_FAILED');
      const failedLoaderId = this.mcpLoaderIds.get(server.id);
      if (failedLoaderId !== undefined) {
        try {
          await this.ctx.loader.remove(failedLoaderId);
        } catch (cleanupError) {
          throw new AggregateError(
            [startError, cleanupError],
            `MCP server '${server.serverName}' startup and Loader cleanup failed.`,
          );
        }
        this.mcpLoaderIds.delete(server.id);
      }
    }
  }

  private requireMcp(id: string): PersistedMcpServer {
    const server = (this.mcpState ?? []).find((candidate) => candidate.id === id);
    if (server === undefined)
      throw RequestError.invalidParams(undefined, `Unknown MCP server '${id}'.`);
    return server;
  }

  private async writeMcpState(): Promise<void> {
    await mkdir(join(this.dshHome, 'extensions'), { recursive: true });
    const temporary = `${this.mcpStatePath}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.mcpState ?? [], null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    try {
      await rename(temporary, this.mcpStatePath);
    } catch (writeError) {
      try {
        await rm(temporary, { force: true });
      } catch (cleanupError) {
        throw new AggregateError(
          [writeError, cleanupError],
          'OpenNeko MCP state write and temporary-file cleanup failed.',
        );
      }
      throw writeError;
    }
  }
}

async function readMcpState(path: string): Promise<PersistedMcpServer[]> {
  let source: string;
  try {
    source = await readFile(path, 'utf8');
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return [];
    throw error;
  }
  const parsed: unknown = JSON.parse(source);
  if (!Array.isArray(parsed)) throw new Error('OpenNeko MCP state must be an array.');
  const entries = parsed.map((value) => parsePersistedMcpServer(value));
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) {
    throw new Error('OpenNeko MCP state contains duplicate identities.');
  }
  return entries;
}

function parsePersistedMcpServer(value: unknown): PersistedMcpServer {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('OpenNeko MCP state entry is invalid.');
  }
  const record = value as Record<string, unknown>;
  const input = decodeDshAcpMcpServerInput(
    record.transport === 'stdio'
      ? {
          serverName: record.serverName,
          description: record.description,
          transport: record.transport,
          command: record.command,
          args: record.args,
        }
      : {
          serverName: record.serverName,
          description: record.description,
          transport: record.transport,
          url: record.url,
        },
  );
  const expectedKeys =
    input.transport === 'stdio'
      ? ['id', 'enabled', 'serverName', 'description', 'transport', 'command', 'args']
      : ['id', 'enabled', 'serverName', 'description', 'transport', 'url'];
  if (
    Object.keys(record).length !== expectedKeys.length ||
    expectedKeys.some((key) => !(key in record))
  ) {
    throw new Error('OpenNeko MCP state entry contains unsupported fields.');
  }
  if (typeof record.id !== 'string' || record.id !== `openneko-mcp-${input.serverName}`) {
    throw new Error('OpenNeko MCP state identity is invalid.');
  }
  if (typeof record.enabled !== 'boolean')
    throw new Error('OpenNeko MCP state enablement is invalid.');
  return { ...input, id: record.id, enabled: record.enabled };
}

function validateMcpServerInput(input: DshAcpMcpServerInput): void {
  if (!/^[A-Za-z0-9_-]{1,32}$/u.test(input.serverName)) {
    throw RequestError.invalidParams(undefined, 'MCP server name is invalid.');
  }
  if (input.transport === 'streamable-http') {
    const url = new URL(input.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw RequestError.invalidParams(undefined, 'MCP server URL must use HTTP or HTTPS.');
    }
  }
}

function toMcpPluginConfig(server: PersistedMcpServer): DshMcpClientConfig {
  return server.transport === 'stdio'
    ? {
        serverName: server.serverName,
        transport: server.transport,
        command: server.command,
        args: [...server.args],
        env: {},
        cwd: process.cwd(),
        toolCallTimeoutMs: 60_000,
        failOnStartupError: true,
      }
    : {
        serverName: server.serverName,
        transport: server.transport,
        url: server.url,
        headers: {},
        toolCallTimeoutMs: 60_000,
        failOnStartupError: true,
      };
}

async function findSkillEntry(
  root: string,
  name: string,
): Promise<
  { readonly name: string; readonly path: string; readonly kind: 'directory' | 'file' } | undefined
> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return undefined;
    throw error;
  }
  const candidates = entries.filter((entry) => entry.name === name || entry.name === `${name}.md`);
  if (candidates.length > 1)
    throw new Error(`Personal Skill '${name}' has duplicate filesystem entries.`);
  const candidate = candidates[0];
  if (candidate === undefined) return undefined;
  if (candidate.isSymbolicLink() || (!candidate.isDirectory() && !candidate.isFile())) {
    throw new Error(`Personal Skill '${name}' must be a real file or directory.`);
  }
  if (candidate.name === name && !candidate.isDirectory()) {
    throw new Error(`Personal Skill '${name}' directory layout is invalid.`);
  }
  if (candidate.name === `${name}.md` && !candidate.isFile()) {
    throw new Error(`Personal Skill '${name}' flat layout is invalid.`);
  }
  return {
    name: candidate.name,
    path: join(root, candidate.name),
    kind: candidate.isDirectory() ? 'directory' : 'file',
  };
}

async function requireMissingPath(path: string, message: string): Promise<void> {
  try {
    await lstat(path);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return;
    throw error;
  }
  throw new Error(message);
}

function hasNodeErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === code
  );
}

export function projectDshExtensionCatalog(
  snapshot: SkillCatalogSnapshot,
  catalogScope: 'global',
  disabledSkills: readonly DshAcpExtensionSkill[] = [],
  mcp: readonly DshAcpExtensionMcp[] = [],
): DshAcpExtensionProjection {
  return {
    catalogScope,
    skills: [
      ...snapshot.skills.map((skill) => ({
        name: skill.name,
        description: skill.description,
        ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
        source: skill.source,
        provider: skill.provider,
        userInvocable: isUserInvocable(skill),
        modelInvocable: isModelInvocable(skill),
        enabled: true,
        manageable: skill.source === 'user-dsh',
        removable: skill.source === 'user-dsh',
      })),
      ...disabledSkills,
    ],
    mcp,
    diagnostics: snapshot.complete ? [] : [{ code: 'skill_catalog_incomplete', count: 1 }],
  };
}

export function projectDshSkillDetail(definition: SkillDefinition, source: string) {
  const effectiveContent = renderSkillContent(definition);
  return {
    name: definition.name,
    description: definition.description,
    ...(definition.whenToUse === undefined ? {} : { whenToUse: definition.whenToUse }),
    source,
    provider: definition.provider,
    userInvocable: isUserInvocable(definition),
    modelInvocable: isModelInvocable(definition),
    content: definition.content,
    fingerprint: `sha256:${createHash('sha256').update(effectiveContent).digest('hex')}`,
  };
}

async function readSkillCatalog(
  ctx: Pick<Context, 'skills'>,
  view:
    | { readonly kind: 'global'; readonly cwd: string }
    | { readonly kind: 'session'; readonly agent: AgentHandle['agent'] },
): Promise<SkillCatalogSnapshot> {
  return view.kind === 'global'
    ? ctx.skills.snapshot({ cwd: view.cwd })
    : ctx.skills.snapshot({
        cwd: view.agent.session.header.cwd,
        scope: view.agent,
      });
}

async function readAgentInputCatalog(
  ctx: Pick<Context, 'commands' | 'skills'>,
  agent: AgentHandle['agent'],
): Promise<DshAcpInputCatalogProjection> {
  const skills = await readSkillCatalog(ctx, { kind: 'session', agent });
  return {
    commands: ctx.commands.list(agent).map((command) => ({
      name: command.name,
      description: command.description,
      ...(command.input === undefined ? {} : { inputHint: command.input.hint }),
    })),
    skills: skills.skills.filter(isUserInvocable).map((skill) => ({
      name: skill.name,
      description: skill.description,
      ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
      source: skill.source,
      provider: skill.provider,
    })),
    skillsComplete: skills.complete,
  };
}

async function readPreTurnInputCatalog(
  ctx: Context,
  preset: string,
  cwd: string,
  config: OpenNekoDshBridgeConfig,
): Promise<DshAcpInputCatalogProjection> {
  const completed = new Error('OpenNeko pre-turn input catalog probe completed.');
  let catalog: DshAcpInputCatalogProjection | undefined;
  const configuration = defaultSessionConfiguration(config);
  try {
    const handle = await ctx.agents.create({
      sessionId: SessionId(randomUUID()),
      meta: { cwd, agentPreset: preset },
      agentOptions: {},
      setup: async (agentCtx) => {
        await setupSessionRuntimeContext(
          ctx,
          preset,
          createSessionRuntimeContext(configuration),
        )(agentCtx);
        const agent = agentCtx.agent;
        if (agent === undefined) {
          throw new Error('DSH pre-turn input catalog setup has no unpublished Agent.');
        }
        catalog = await readAgentInputCatalog(ctx, agent);
        throw completed;
      },
    });
    await handle.dispose();
    throw new Error('DSH pre-turn input catalog probe published an Agent unexpectedly.');
  } catch (error) {
    if (error === completed && catalog !== undefined) return catalog;
    throw error;
  }
}

export async function validateStagedSkillPackage(
  stagingRoot: string,
  layout: 'directory' | 'flat',
  entry: string,
): Promise<{ readonly name: string }> {
  if (!isAbsolute(stagingRoot)) {
    throw RequestError.invalidParams(undefined, 'Staged Skill root must be absolute.');
  }
  const rootStats = await lstat(stagingRoot);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw RequestError.invalidParams(undefined, 'Staged Skill root must be a real directory.');
  }
  const canonicalRoot = await realpath(stagingRoot);
  if (
    entry.includes('\\') ||
    entry.startsWith('/') ||
    posix.normalize(entry) !== entry ||
    (layout === 'directory' && !entry.endsWith('/SKILL.md')) ||
    (layout === 'flat' && (entry.includes('/') || !entry.endsWith('.md')))
  ) {
    throw RequestError.invalidParams(undefined, 'Staged Skill entry is invalid for its layout.');
  }
  const expectedMain = await realpath(join(canonicalRoot, ...entry.split('/')));
  const contained = relative(canonicalRoot, expectedMain);
  if (contained.length === 0 || contained.startsWith('..') || isAbsolute(contained)) {
    throw RequestError.invalidParams(undefined, 'Staged Skill entry escapes its root.');
  }
  const context = new Context();
  const lifecycle = new AbortController();
  const provider = new FileSystemSkillProvider(
    context,
    { signal: lifecycle.signal, invalidate: () => undefined },
    {
      providerName: `openneko-authoring-${randomUUID()}`,
      includeDefaultRoots: false,
      customSkillDirs: [canonicalRoot],
      watch: false,
    },
  );
  try {
    const observation = await provider.list({ cwd: canonicalRoot });
    const candidates = Array.isArray(observation) ? observation : observation.candidates;
    if (!Array.isArray(observation) && !observation.complete) {
      throw RequestError.invalidParams(
        undefined,
        'Staged root contains a DSH Skill entry that could not be validated.',
      );
    }
    const matches = [];
    for (const candidate of candidates) {
      if (candidate.path !== undefined && (await realpath(candidate.path)) === expectedMain) {
        matches.push(candidate);
      }
    }
    if (matches.length !== 1 || candidates.length !== 1) {
      throw RequestError.invalidParams(
        undefined,
        'Staged root must contain exactly one DSH Skill at the canonical candidate entry.',
      );
    }
    const candidate = matches[0];
    if (candidate === undefined) {
      throw new Error('Validated staged Skill candidate disappeared.');
    }
    const definition = await provider.get(candidate, { cwd: canonicalRoot });
    if (definition === undefined || definition.name !== candidate.name) {
      throw RequestError.invalidParams(
        undefined,
        'Staged DSH Skill definition is incomplete or has a mismatched identity.',
      );
    }
    const expectedResourceBase =
      layout === 'directory' ? join(canonicalRoot, posix.dirname(entry)) : canonicalRoot;
    if (
      definition.resourceBase?.kind !== 'directory' ||
      (await realpath(definition.resourceBase.path)) !== (await realpath(expectedResourceBase))
    ) {
      throw RequestError.invalidParams(undefined, 'Staged DSH Skill resource base is invalid.');
    }
    return { name: definition.name };
  } finally {
    lifecycle.abort();
    await provider.dispose();
  }
}

export function listOpenNekoSessions(
  headers: readonly SessionHeader[],
  preset: string,
): ListSessionsResponse {
  const sessions: ListSessionsResponse['sessions'] = [];
  const diagnostics: { code: string; message: string; sessionId: string }[] = [];
  const seen = new Map<string, SessionHeader>();
  const conflicts = new Set<string>();
  for (const header of headers) {
    if (conflicts.has(header.id)) continue;
    const existing = seen.get(header.id);
    if (existing !== undefined) {
      if (existing.cwd !== header.cwd || existing.agentPreset !== header.agentPreset) {
        seen.delete(header.id);
        conflicts.add(header.id);
      }
      continue;
    }
    seen.set(header.id, header);
  }
  for (const sessionId of conflicts) {
    diagnostics.push({
      code: 'SESSION_HEADER_CONFLICT',
      message: `OpenNeko DSH session ${sessionId} has conflicting catalog headers.`,
      sessionId,
    });
  }
  for (const header of seen.values()) {
    if (header.agentPreset !== preset) continue;
    if (header.cwd === undefined) {
      diagnostics.push({
        code: 'SESSION_CWD_MISSING',
        message: `OpenNeko DSH session ${header.id} has no working directory.`,
        sessionId: header.id,
      });
      continue;
    }
    if (!isAbsolute(header.cwd)) {
      diagnostics.push({
        code: 'SESSION_CWD_INVALID',
        message: `OpenNeko DSH session ${header.id} has a non-absolute working directory.`,
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
  options: { readonly replay?: boolean } = {},
): readonly SessionNotification[] {
  if (options.replay === true && event.type === 'assistant/chunk') return [];
  return projectSessionEventNotifications(sessionId, event).map((notification) => ({
    ...notification,
    _meta: {
      ...(notification._meta === undefined || notification._meta === null
        ? {}
        : notification._meta),
      opennekoReplay: options.replay === true,
    },
  }));
}

function projectSessionEventNotifications(
  sessionId: string,
  event: SessionEvent,
): readonly SessionNotification[] {
  switch (event.type) {
    case 'user/message':
      if (event.data.source.kind !== 'user') return [];
      return projectMessage(
        sessionId,
        'user_message_chunk',
        readOpenNekoDisplayContent(event.data.source) ?? event.data.content,
        event.data.id,
      ).map((notification, frameIndex, notifications) =>
        withOpenNekoMeta(notification, event.seq, undefined, undefined, {
          frameIndex,
          frameCount: notifications.length,
        }),
      );
    case 'assistant/chunk':
      return projectAssistantChunk(sessionId, event);
    case 'assistant/message':
      return projectAssistantMessage(sessionId, event);
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
      const content = projectToolResultContent(result.content);
      return [
        withOpenNekoMeta(
          {
            sessionId,
            update: {
              sessionUpdate: 'tool_call_update',
              toolCallId: result.toolCallId,
              status: result.isError ? 'failed' : 'completed',
              ...(content.length === 0 ? {} : { content }),
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

function projectToolResultContent(content: readonly ContentBlock[]): ToolCallContent[] {
  const projected: ToolCallContent[] = [];
  for (const block of content) {
    if (block.type === 'text') {
      projected.push({ type: 'content', content: { type: 'text', text: block.text } });
      continue;
    }
    if (block.type === 'image') {
      projected.push({
        type: 'content',
        content: {
          type: 'resource_link',
          name: block.attachment.name ?? 'image',
          uri: serializeDshAttachmentUri({
            type: 'image',
            name: block.attachment.name ?? 'image',
            ...projectImageAttachmentRef(block.attachment),
          }),
          mimeType: block.attachment.mediaType,
        },
      });
    }
  }
  return projected;
}

export function projectExtensionSessionEvent(
  sessionId: string,
  event: SessionEvent,
  replay: boolean,
): DshAcpSessionEventNotification & Record<string, unknown> {
  return {
    sessionId,
    sequence: event.seq,
    time: event.time,
    type: event.type,
    data: event.data,
    replay,
  };
}

export function projectContextPressureNotification(
  sessionId: string,
  snapshot: {
    readonly asOfSeq: number;
    readonly values: Readonly<Record<string, unknown>>;
  },
) {
  const candidate = snapshot.values.contextPressure;
  if (candidate === undefined || snapshot.asOfSeq < 0) return undefined;
  return {
    sessionId,
    sourceSequence: snapshot.asOfSeq,
    pressure: decodeDshAcpContextPressureProjection(candidate),
  };
}

function projectMessage(
  sessionId: string,
  sessionUpdate: 'user_message_chunk' | 'agent_message_chunk',
  content: readonly {
    readonly type: string;
    readonly text?: string;
    readonly name?: string;
    readonly uri?: string;
    readonly attachmentId?: string;
    readonly mediaType?: ImageAttachmentRef['mediaType'];
    readonly bytes?: number;
    readonly width?: number;
    readonly height?: number;
  }[],
  messageId?: string,
): readonly SessionNotification[] {
  return content.flatMap((block): readonly SessionNotification[] => {
    if (block.type === 'text' && block.text !== undefined && block.text.length > 0) {
      return [
        {
          sessionId,
          update: {
            sessionUpdate,
            ...(messageId === undefined ? {} : { messageId }),
            content: { type: 'text', text: block.text },
          },
        },
      ];
    }
    if (
      sessionUpdate === 'user_message_chunk' &&
      block.type === 'resource_link' &&
      block.name !== undefined &&
      block.uri !== undefined
    ) {
      return [
        {
          sessionId,
          update: {
            sessionUpdate,
            ...(messageId === undefined ? {} : { messageId }),
            content: { type: 'resource_link', name: block.name, uri: block.uri },
          },
        },
      ];
    }
    if (
      sessionUpdate === 'user_message_chunk' &&
      block.type === 'image' &&
      block.name !== undefined &&
      block.attachmentId !== undefined &&
      block.mediaType !== undefined &&
      block.bytes !== undefined &&
      block.width !== undefined &&
      block.height !== undefined
    ) {
      return [
        {
          sessionId,
          update: {
            sessionUpdate,
            ...(messageId === undefined ? {} : { messageId }),
            content: {
              type: 'resource_link',
              name: block.name,
              uri: serializeDshAttachmentUri({
                type: 'image',
                name: block.name,
                attachmentId: block.attachmentId,
                mediaType: block.mediaType,
                bytes: block.bytes,
                width: block.width,
                height: block.height,
              }),
            },
          },
        },
      ];
    }
    return [];
  });
}

function readOpenNekoDisplayContent(
  source: unknown,
): readonly OpenNekoDisplayContentBlock[] | undefined {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) return undefined;
  const value = (source as Record<string, unknown>).opennekoDisplayContent;
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('OpenNeko display content must be a non-empty array.');
  }
  return value.map((block, index) => {
    if (block === null || typeof block !== 'object' || Array.isArray(block)) {
      throw new Error(`OpenNeko display content block ${index} is invalid.`);
    }
    const record = block as Record<string, unknown>;
    if (
      record.type === 'text' &&
      Object.keys(record).every((key) => key === 'type' || key === 'text') &&
      typeof record.text === 'string' &&
      record.text.length > 0
    ) {
      return { type: 'text' as const, text: record.text };
    }
    if (
      record.type === 'resource_link' &&
      Object.keys(record).every((key) => key === 'type' || key === 'name' || key === 'uri') &&
      typeof record.name === 'string' &&
      record.name.length > 0 &&
      typeof record.uri === 'string' &&
      record.uri.length > 0
    ) {
      return { type: 'resource_link' as const, name: record.name, uri: record.uri };
    }
    if (
      record.type === 'image' &&
      Object.keys(record).every(
        (key) =>
          key === 'type' ||
          key === 'name' ||
          key === 'attachmentId' ||
          key === 'mediaType' ||
          key === 'bytes' ||
          key === 'width' ||
          key === 'height',
      ) &&
      typeof record.name === 'string' &&
      record.name.length > 0 &&
      typeof record.attachmentId === 'string' &&
      record.attachmentId.length > 0 &&
      isImageMediaType(record.mediaType) &&
      isPositiveSafeInteger(record.bytes) &&
      isPositiveSafeInteger(record.width) &&
      isPositiveSafeInteger(record.height)
    ) {
      return {
        type: 'image' as const,
        name: record.name,
        attachmentId: record.attachmentId,
        mediaType: record.mediaType,
        bytes: record.bytes,
        width: record.width,
        height: record.height,
      };
    }
    throw new Error(`OpenNeko display content block ${index} is unsupported.`);
  });
}

function readOpenNekoRuntimeContext(source: unknown): string | undefined {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) return undefined;
  const value = (source as Record<string, unknown>).opennekoRuntimeContext;
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error('OpenNeko runtime context must be a string.');
  return value;
}

function readOpenNekoTurnConfiguration(source: unknown) {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) return undefined;
  const value = (source as Record<string, unknown>).opennekoTurnConfiguration;
  return value === undefined ? undefined : decodeDshAcpTurnConfiguration(value);
}

function projectAcpDisplayContent(
  prompt: readonly AcpContentBlock[],
  admitted: readonly ContentBlock[],
): readonly OpenNekoDisplayContentBlock[] | undefined {
  let admittedIndex = 0;
  const displayContent = prompt.flatMap((block): readonly OpenNekoDisplayContentBlock[] => {
    if (block.type === 'text' && block.text.length > 0) {
      admittedIndex += 1;
      return [{ type: 'text', text: block.text }];
    }
    if (block.type === 'resource_link') {
      return [{ type: 'resource_link', name: block.name, uri: block.uri }];
    }
    if (block.type === 'image') {
      const admittedBlock = admitted[admittedIndex];
      admittedIndex += 1;
      if (admittedBlock?.type !== 'image') {
        throw new Error('DSH admitted image order does not match the ACP Prompt.');
      }
      const name = readAcpImageDisplayName(block);
      return name === undefined
        ? []
        : [
            {
              type: 'image',
              name,
              ...projectImageAttachmentRef(admittedBlock.attachment),
            },
          ];
    }
    return [];
  });
  return displayContent.length === 0 ? undefined : displayContent;
}

function bindInboxDisplayContent(
  displayContent: readonly import('@neko/agent-contracts/dsh-acp').DshAcpContentBlock[],
  admitted: readonly ContentBlock[],
): readonly OpenNekoDisplayContentBlock[] {
  const attachmentRefs = admitted.flatMap((block) =>
    block.type === 'image' ? [block.attachment] : [],
  );
  let imageIndex = 0;
  return displayContent.map((block) => {
    if (block.type === 'text') return { type: 'text' as const, text: block.text };
    if (block.type === 'resource-link') {
      return { type: 'resource_link' as const, name: block.name, uri: block.uri };
    }
    const attachment = attachmentRefs[imageIndex];
    imageIndex += 1;
    if (attachment === undefined) {
      throw RequestError.internalError(
        undefined,
        `Inbox display image '${block.name}' has no admitted attachment.`,
      );
    }
    return { type: 'image' as const, name: block.name, ...projectImageAttachmentRef(attachment) };
  });
}

function readAcpImageDisplayName(
  block: Extract<AcpContentBlock, { readonly type: 'image' }>,
): string | undefined {
  const value = block._meta?.opennekoDisplayName;
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('ACP image display name must be a non-empty string.');
  }
  return value;
}

function serializeDshAttachmentUri(
  attachment: Extract<OpenNekoDisplayContentBlock, { readonly type: 'image' }>,
): string {
  return `openneko-dsh-attachment:${encodeURIComponent(
    JSON.stringify(projectImageAttachmentRef(attachment)),
  )}`;
}

function projectImageAttachmentRef(ref: {
  readonly attachmentId: ImageAttachmentRef['attachmentId'] | string;
  readonly mediaType: ImageAttachmentRef['mediaType'];
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
}) {
  return {
    attachmentId: String(ref.attachmentId),
    mediaType: ref.mediaType,
    bytes: ref.bytes,
    width: ref.width,
    height: ref.height,
  };
}

function findDisplayedImageAttachment(
  record: OwnedSession,
  attachmentId: string,
): ImageAttachmentRef {
  for (const event of record.handle.agent.session.events) {
    if (event.type === 'user/message' && event.data.source.kind === 'user') {
      const display = readOpenNekoDisplayContent(event.data.source)?.find(
        (block) => block.type === 'image' && block.attachmentId === attachmentId,
      );
      if (display === undefined || display.type !== 'image') continue;
      const image = findImageAttachment(event.data.content, attachmentId);
      if (image === undefined) {
        throw RequestError.internalError(
          undefined,
          `Displayed image attachment '${attachmentId}' has no native DSH image block.`,
        );
      }
      const projected = projectImageAttachmentRef(image);
      if (
        projected.mediaType !== display.mediaType ||
        projected.bytes !== display.bytes ||
        projected.width !== display.width ||
        projected.height !== display.height
      ) {
        throw RequestError.internalError(
          undefined,
          `Displayed image attachment '${attachmentId}' metadata does not match its DSH image block.`,
        );
      }
      return image;
    }
    if (event.type === 'tool/result') {
      const result = event.data.message.content[0];
      if (result?.type !== 'tool-result') continue;
      const image = result.content.find(
        (block) => block.type === 'image' && String(block.attachment.attachmentId) === attachmentId,
      );
      if (image?.type === 'image') return image.attachment;
    }
  }
  throw RequestError.invalidParams(
    undefined,
    `Image attachment '${attachmentId}' is not displayed by this Session.`,
  );
}

function findImageAttachment(
  content: readonly ContentBlock[],
  attachmentId: string,
): ImageAttachmentRef | undefined {
  for (const block of content) {
    if (block.type === 'image' && String(block.attachment.attachmentId) === attachmentId) {
      return block.attachment;
    }
    if (block.type === 'tool-result') {
      const nested = findImageAttachment(block.content, attachmentId);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

function isImageMediaType(value: unknown): value is ImageAttachmentRef['mediaType'] {
  return (
    value === 'image/png' ||
    value === 'image/jpeg' ||
    value === 'image/webp' ||
    value === 'image/gif'
  );
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function projectAssistantChunk(
  sessionId: string,
  event: SessionEvent<'assistant/chunk'>,
): readonly SessionNotification[] {
  const chunk = event.data.chunk;
  if (chunk.type !== 'text-delta' && chunk.type !== 'reasoning-delta') return [];
  if (chunk.text.length === 0) return [];
  return [
    withOpenNekoMeta(
      {
        sessionId,
        update: {
          sessionUpdate:
            chunk.type === 'text-delta' ? 'agent_message_chunk' : 'agent_thought_chunk',
          messageId: transientAssistantMessageId(event.data.turn, event.data.step, chunk.type),
          content: { type: 'text', text: chunk.text },
        },
      },
      event.seq,
      event.data.turn,
      {
        step: event.data.step,
        blockIndex: chunk.index,
        messagePhase: 'delta',
      },
    ),
  ];
}

function projectAssistantMessage(
  sessionId: string,
  event: SessionEvent<'assistant/message'>,
): readonly SessionNotification[] {
  const reasoning = event.data.message.content
    .filter((block) => block.type === 'reasoning')
    .map((block) => block.text)
    .join('');
  const text = event.data.message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
  return [
    withOpenNekoMeta(
      {
        sessionId,
        update: {
          sessionUpdate: 'agent_thought_chunk',
          messageId: event.data.message.id,
          content: { type: 'text', text: reasoning },
        },
      },
      event.seq,
      event.data.turn,
      { step: event.data.step, messagePhase: 'final', frameIndex: 0, frameCount: 2 },
    ),
    withOpenNekoMeta(
      {
        sessionId,
        update: {
          sessionUpdate: 'agent_message_chunk',
          messageId: event.data.message.id,
          content: { type: 'text', text },
        },
      },
      event.seq,
      event.data.turn,
      { step: event.data.step, messagePhase: 'final', frameIndex: 1, frameCount: 2 },
    ),
  ];
}

function transientAssistantMessageId(
  turn: number,
  step: number,
  type: 'text-delta' | 'reasoning-delta',
): string {
  return `dsh:${turn}:${step}:${type === 'text-delta' ? 'text' : 'reasoning'}`;
}

function withOpenNekoMeta(
  notification: SessionNotification,
  sequence: number,
  turn?: number,
  assistant?: {
    readonly step: number;
    readonly blockIndex?: number;
    readonly messagePhase: 'delta' | 'final';
    readonly frameIndex?: number;
    readonly frameCount?: number;
  },
  frame?: { readonly frameIndex: number; readonly frameCount: number },
): SessionNotification {
  return {
    ...notification,
    _meta: {
      ...(notification._meta === undefined || notification._meta === null
        ? {}
        : notification._meta),
      opennekoSequence: sequence,
      ...(turn === undefined ? {} : { opennekoTurn: turn }),
      ...(assistant === undefined
        ? {}
        : {
            opennekoStep: assistant.step,
            opennekoMessagePhase: assistant.messagePhase,
            ...(assistant.blockIndex === undefined
              ? {}
              : { opennekoBlockIndex: assistant.blockIndex }),
            ...(assistant.frameIndex === undefined
              ? {}
              : { opennekoFrameIndex: assistant.frameIndex }),
            ...(assistant.frameCount === undefined
              ? {}
              : { opennekoFrameCount: assistant.frameCount }),
          }),
      ...(frame === undefined || frame.frameCount === 1
        ? {}
        : {
            opennekoFrameIndex: frame.frameIndex,
            opennekoFrameCount: frame.frameCount,
          }),
    },
  };
}

function validateLifecycleRequest(params: {
  readonly cwd: string;
  readonly additionalDirectories?: readonly string[];
  readonly mcpServers: readonly unknown[];
}): void {
  if (!isAbsolute(params.cwd)) {
    throw RequestError.invalidParams(undefined, 'cwd must be absolute.');
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
  const runtimeContext = createSessionRuntimeContext(configuration);
  const handle = await ctx.agents.resume({
    resumeSessionId: sessionId,
    agentOptions: {},
    setup: setupSessionRuntimeContext(ctx, preset, runtimeContext),
  });
  const record = createOwnedSession(handle, runtimeContext);
  owned.set(rawSessionId, record);
  return record;
}

function createOwnedSession(
  handle: AgentHandle,
  runtimeContext: DshSessionRuntimeContext,
): OwnedSession {
  return {
    handle,
    runtimeContext,
    inflight: undefined,
    commandAbort: undefined,
    outputTail: Promise.resolve(),
    contextPressure: undefined,
  };
}

function sameContextPressure(
  left: DshAcpContextPressureProjection | undefined,
  right: DshAcpContextPressureProjection,
): boolean {
  return (
    left !== undefined &&
    left.pressureTokens === right.pressureTokens &&
    left.projectedTokens === right.projectedTokens &&
    left.contextWindow === right.contextWindow
  );
}

function requireSessionProjectionReader(ctx: Context): DshSessionProjectionReader {
  const candidate: unknown = Reflect.get(ctx, 'sessionProjections');
  if (typeof candidate !== 'object' || candidate === null) {
    throw new Error('DSH sessionProjections service is unavailable.');
  }
  const snapshot: unknown = Reflect.get(candidate, 'snapshot');
  if (typeof snapshot !== 'function') {
    throw new Error('DSH sessionProjections snapshot operation is unavailable.');
  }
  return Object.freeze({
    snapshot(session: AgentHandle['agent']['session']) {
      const value: unknown = Reflect.apply(snapshot, candidate, [session]);
      if (typeof value !== 'object' || value === null) {
        throw new Error('DSH Session projection snapshot is invalid.');
      }
      const asOfSeq = requireNonNegativeSafeInteger(
        Reflect.get(value, 'asOfSeq'),
        'DSH Session projection snapshot sequence',
      );
      const values = requireReadonlyRecord(
        Reflect.get(value, 'values'),
        'DSH Session projection snapshot values',
      );
      return { asOfSeq, values };
    },
  });
}

function requireNonNegativeSafeInteger(input: unknown, field: string): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 0) {
    throw new Error(`${field} is invalid.`);
  }
  return input;
}

function requireReadonlyRecord(input: unknown, field: string): Readonly<Record<string, unknown>> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error(`${field} are invalid.`);
  }
  const record: Record<string, unknown> = {};
  for (const key of Object.keys(input)) record[key] = Reflect.get(input, key);
  return Object.freeze(record);
}

function createSessionRuntimeContext(
  configuration: DshSessionConfiguration,
): DshSessionRuntimeContext {
  return { text: '', modelConfiguration: new SessionModelConfigurationOwner(configuration) };
}

function setupSessionRuntimeContext(
  ctx: Context,
  preset: string,
  runtimeContext: DshSessionRuntimeContext,
) {
  return async (agentCtx: Context): Promise<void> => {
    await ctx.agentPresets.mount(agentCtx, preset);
    agentCtx.tools.restrict({ deny: ['read_image'] });
    agentCtx.effect(
      () => installModelSelection(agentCtx, runtimeContext.modelConfiguration.modelSelection),
      'openneko:model-selection',
    );
    agentCtx.on('system-prompt/assemble', async (_assembly, _context, next) => {
      runtimeContext.modelConfiguration.captureMaxTokens();
      return next();
    });
    agentCtx.on('agent/request', async (_payload, next) => {
      const request = await next();
      const maxTokens = runtimeContext.modelConfiguration.maxTokensForAssembledRequest();
      return maxTokens === undefined ? request : { ...request, maxTokens };
    });
    agentCtx.systemPrompt.context({
      name: 'openneko:product-protocol',
      order: -100,
      text: OPENNEKO_PRODUCT_SYSTEM_PROMPT,
    });
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
  };
}

function projectModeState(ctx: Context, record: OwnedSession): SessionModeState {
  const projection = projectPermissionPresets(ctx, record);
  return {
    currentModeId: projection.currentValue,
    availableModes: projection.options.map((option) => ({
      id: option.value,
      name: option.name,
      ...(option.description === undefined ? {} : { description: option.description }),
    })),
  };
}

function projectPermissionPresets(
  ctx: Context,
  record?: OwnedSession,
): ReturnType<typeof decodeDshAcpPermissionPresetProjection> {
  const currentValue =
    record === undefined
      ? ctx.permissionPresets.defaultPreset
      : ctx.permissionPresets.current(record.handle.agent.session.events);
  const names = ctx.permissionPresets.names;
  const values =
    currentValue === 'custom' && !names.includes(currentValue) ? [...names, currentValue] : names;
  return decodeDshAcpPermissionPresetProjection({
    currentValue,
    options: values.map((value) => ctx.permissionPresets.optionOf(value)),
  });
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

function projectApprovalOutcome(
  outcome:
    { readonly outcome: 'cancelled' } | { readonly outcome: 'selected'; readonly optionId: string },
): ApprovalOutcome {
  if (outcome.outcome === 'cancelled') return 'cancelled';
  if (outcome.optionId === 'allow-once') return 'allowed-once';
  if (outcome.optionId === 'reject-once') return 'rejected';
  return 'unavailable';
}

export async function admitAcpPrompt(
  prompt: readonly AcpContentBlock[],
  attachments?: Pick<AttachmentStore, 'saveImages'>,
): Promise<ContentBlock[]> {
  let text = '';
  const content: Array<ContentBlock | number> = [];
  const images: Parameters<AttachmentStore['saveImages']>[0][number][] = [];
  let imageBytes = 0;
  let resourceCount = 0;
  for (const block of prompt) {
    if (block.type === 'text') {
      text += block.text;
      content.push({ type: 'text', text: block.text });
      continue;
    }
    if (block.type === 'resource_link') {
      resourceCount += 1;
      continue;
    }
    if (block.type === 'image') {
      if (attachments === undefined) {
        throw RequestError.invalidParams(
          undefined,
          'DSH image attachments are unavailable in the active profile.',
        );
      }
      const mediaType = requireImageMediaType(block.mimeType);
      content.push(images.length);
      if (images.length >= AGENT_IMAGE_TRANSPORT_MAX_PAYLOADS) {
        throw RequestError.invalidParams(
          undefined,
          `DSH Prompt images exceed the limit of ${AGENT_IMAGE_TRANSPORT_MAX_PAYLOADS}.`,
        );
      }
      const data = decodeBase64Image(block.data);
      if (data.byteLength > AGENT_IMAGE_TRANSPORT_MAX_PAYLOAD_BYTES) {
        throw RequestError.invalidParams(
          undefined,
          `DSH Prompt image exceeds ${AGENT_IMAGE_TRANSPORT_MAX_PAYLOAD_BYTES} bytes.`,
        );
      }
      imageBytes += data.byteLength;
      if (imageBytes > AGENT_IMAGE_TRANSPORT_MAX_TOTAL_BYTES) {
        throw RequestError.invalidParams(
          undefined,
          `DSH Prompt images exceed ${AGENT_IMAGE_TRANSPORT_MAX_TOTAL_BYTES} total bytes.`,
        );
      }
      images.push({
        data,
        mediaType,
      });
      continue;
    }
    throw RequestError.invalidParams(undefined, `Unsupported prompt content: ${block.type}`);
  }
  if (text.trim().length === 0 && images.length === 0 && resourceCount === 0) {
    throw RequestError.invalidParams(undefined, 'Prompt must contain non-empty text.');
  }
  if (content.length === 0 && resourceCount > 0) {
    content.push({
      type: 'text',
      text: 'Use the user-selected resource context for this request.',
    });
  }
  if (images.length === 0) return content.map(requireAdmittedContentBlock);
  if (attachments === undefined) {
    throw RequestError.internalError(undefined, 'DSH attachment admission is unavailable.');
  }
  const imageRefs = await attachments.saveImages(images);
  if (imageRefs.length !== images.length) {
    throw RequestError.internalError(
      undefined,
      'DSH attachment admission returned an incomplete image batch.',
    );
  }
  return content.map((block) => {
    if (typeof block !== 'number') return block;
    const attachment = imageRefs[block];
    if (attachment === undefined) {
      throw RequestError.internalError(
        undefined,
        'DSH attachment admission returned an invalid image order.',
      );
    }
    return { type: 'image', attachment };
  });
}

function requireAdmittedContentBlock(block: ContentBlock | number): ContentBlock {
  if (typeof block !== 'number') return block;
  throw RequestError.internalError(undefined, 'Image prompt content was not admitted.');
}

function requireImageMediaType(
  value: string,
): 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' {
  if (
    value === 'image/png' ||
    value === 'image/jpeg' ||
    value === 'image/webp' ||
    value === 'image/gif'
  ) {
    return value;
  }
  throw RequestError.invalidParams(undefined, `Unsupported image MIME type: ${value}`);
}

function decodeBase64Image(value: string): Uint8Array {
  const maximumEncodedLength = Math.ceil(AGENT_IMAGE_TRANSPORT_MAX_PAYLOAD_BYTES / 3) * 4;
  if (value.length > maximumEncodedLength) {
    throw RequestError.invalidParams(
      undefined,
      `DSH Prompt image exceeds ${AGENT_IMAGE_TRANSPORT_MAX_PAYLOAD_BYTES} bytes.`,
    );
  }
  if (value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)) {
    throw RequestError.invalidParams(undefined, 'Image data must be canonical base64.');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length === 0) throw RequestError.invalidParams(undefined, 'Image data is empty.');
  if (bytes.toString('base64') !== value) {
    throw RequestError.invalidParams(undefined, 'Image data must be canonical base64.');
  }
  return new Uint8Array(bytes);
}

function projectInbox(record: OwnedSession): Record<string, unknown> {
  return {
    nextTurn: record.handle.agent.inbox.nextTurn.map((message) =>
      projectInboxMessage(record, message),
    ),
    nextStep: record.handle.agent.inbox.nextStep.map((message) =>
      projectInboxMessage(record, message),
    ),
  };
}

function projectInboxMessage(
  record: OwnedSession,
  message: {
    readonly id: string;
    readonly source: unknown;
    readonly content: readonly { readonly type: string; readonly text?: string }[];
  },
): Record<string, unknown> {
  const displayContent = readOpenNekoDisplayContent(message.source);
  const content =
    displayContent === undefined
      ? message.content.map((block) => {
          if (block.type !== 'text' || block.text === undefined) {
            throw RequestError.internalError(
              undefined,
              `Inbox message ${message.id} contains unsupported content: ${block.type}`,
            );
          }
          return { type: 'text', text: block.text };
        })
      : displayContent.map((block) =>
          block.type === 'text'
            ? { type: 'text', text: block.text }
            : block.type === 'resource_link'
              ? { type: 'resource-link', name: block.name, uri: block.uri }
              : { type: 'image', name: block.name },
        );
  return {
    messageId: message.id,
    createdAt: inboxMessageCreatedAt(record, message.id),
    content,
  };
}

function inboxMessageCreatedAt(record: OwnedSession, messageId: string): number {
  const events = record.handle.agent.session.events;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type !== 'agent/inbox/spliced') continue;
    if (event.data.inserted.some((message) => message.id === messageId)) return event.time;
  }
  throw RequestError.internalError(
    undefined,
    `Inbox message ${messageId} has no durable insertion event.`,
  );
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

function requireAbsoluteCwd(input: unknown, field: string): string {
  const value = requireNonEmptyString(input, field);
  if (!isAbsolute(value)) {
    throw RequestError.invalidParams(undefined, `${field} must be absolute.`);
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
