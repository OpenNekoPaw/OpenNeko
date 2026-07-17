import type {
  AgentTool,
  AgentToolResult,
  AgentToolUpdateCallback,
  BeforeToolCallContext,
  BeforeToolCallResult,
  ToolExecutionMode,
} from '@earendil-works/pi-agent-core';
import type { Models, TSchema } from '@earendil-works/pi-ai';
import type {
  ToolPurposeModelCompletionInput,
  ToolPurposeModelImage,
  ToolPurposeModelRuntime,
} from '@neko/shared';

import type { AgentModelPolicy, AgentModelPurpose, ResolvedAgentModelUse } from './model-policy';
import { completePiPurposeModel } from './purpose-model-runtime';

export interface PiToolRunIdentity {
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly branchId: string;
  readonly turnId: string;
  readonly runId: string;
}

export interface PiCapabilityToolRequirements {
  readonly workspaceTrust?: boolean;
  readonly writableProject?: boolean;
  readonly host?: 'any' | 'vscode';
}

export interface PiCapabilityToolContext {
  readonly identity: PiToolRunIdentity & { readonly toolCallId: string };
  readonly workspaceTrusted: boolean;
  readonly modelUse?: ResolvedAgentModelUse;
  readonly purposeModel?: ToolPurposeModelRuntime;
}

export interface PiCapabilityTool<TDetails = unknown> {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly parameters: TSchema;
  readonly requirements?: PiCapabilityToolRequirements;
  readonly modelPurpose?: Exclude<AgentModelPurpose, 'agent.main'>;
  readonly modelPurposeRequirement?: 'required' | 'optional';
  readonly executionMode?: ToolExecutionMode;
  readonly isReadOnly?: boolean;
  readonly requiresConfirmation?: boolean;
  execute(input: {
    readonly args: unknown;
    readonly context: PiCapabilityToolContext;
    readonly signal?: AbortSignal;
    readonly onUpdate?: AgentToolUpdateCallback<TDetails>;
  }): Promise<AgentToolResult<TDetails>>;
}

export type PiToolPermissionDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly reason: string };

export type PiToolPermissionMode = 'plan' | 'ask' | 'auto';
export type PiToolPermissionAction = 'allow' | 'confirm' | 'deny';

export function resolvePiToolPermissionAction(
  mode: PiToolPermissionMode,
  requiresConfirmation: boolean | undefined,
  isReadOnly: boolean | undefined,
): PiToolPermissionAction {
  if (mode === 'plan') return 'deny';
  if (requiresConfirmation === true) return 'confirm';
  if (isReadOnly === true) return 'allow';
  if (mode === 'auto' && requiresConfirmation !== true) return 'allow';
  return 'confirm';
}

export interface PiToolPermissionPolicy {
  preflight(input: {
    readonly tool: PiCapabilityTool;
    readonly args: unknown;
    readonly identity: PiToolRunIdentity & { readonly toolCallId: string };
    readonly workspaceTrusted: boolean;
    readonly signal?: AbortSignal;
  }): PiToolPermissionDecision | Promise<PiToolPermissionDecision>;
}

export interface BridgePiCapabilityToolsInput {
  readonly tools: readonly PiCapabilityTool[];
  readonly identity: PiToolRunIdentity;
  readonly workspaceTrusted: boolean;
  readonly modelPolicy: AgentModelPolicy;
  readonly models: Models;
  readonly permissionPolicy: PiToolPermissionPolicy;
}

export interface PiCapabilityToolBridge {
  readonly tools: readonly AgentTool<TSchema, unknown>[];
  resolveDomainToolName(wireName: string): string;
  beforeToolCall(
    context: BeforeToolCallContext,
    signal?: AbortSignal,
  ): Promise<BeforeToolCallResult | undefined>;
}

export type PiCapabilityToolBridgeErrorCode =
  'duplicate-tool' | 'invalid-tool' | 'tool-not-registered' | 'identity-mismatch';

export class PiCapabilityToolBridgeError extends Error {
  readonly code: PiCapabilityToolBridgeErrorCode;

  constructor(code: PiCapabilityToolBridgeErrorCode, message: string) {
    super(message);
    this.name = 'PiCapabilityToolBridgeError';
    this.code = code;
  }
}

export function bridgePiCapabilityTools(
  input: BridgePiCapabilityToolsInput,
): PiCapabilityToolBridge {
  validateIdentity(input.identity);
  const definitionsByWireName = new Map<string, PiCapabilityTool>();
  const registeredDomainNames = new Set<string>();
  const tools: AgentTool<TSchema, unknown>[] = [];
  for (const definition of input.tools) {
    validateTool(definition);
    if (registeredDomainNames.has(definition.name)) {
      throw new PiCapabilityToolBridgeError(
        'duplicate-tool',
        `Duplicate Pi Capability tool ${definition.name}.`,
      );
    }
    registeredDomainNames.add(definition.name);
    if (
      definition.modelPurpose !== undefined &&
      input.modelPolicy[definition.modelPurpose] === undefined &&
      definition.modelPurposeRequirement !== 'optional'
    ) {
      continue;
    }
    const wireName = projectToolWireName(definition.name);
    const conflictingDefinition = definitionsByWireName.get(wireName);
    if (conflictingDefinition !== undefined) {
      throw new PiCapabilityToolBridgeError(
        'duplicate-tool',
        `Pi Capability tools ${conflictingDefinition.name} and ${definition.name} project to the same wire name ${wireName}.`,
      );
    }
    definitionsByWireName.set(wireName, definition);
    const modelUse =
      definition.modelPurpose === undefined
        ? undefined
        : input.modelPolicy[definition.modelPurpose];
    const purposeModel =
      modelUse === undefined ? undefined : createToolPurposeModelRuntime(input.models, modelUse);
    tools.push({
      name: wireName,
      label: definition.label,
      description: definition.description,
      parameters: definition.parameters,
      ...(definition.executionMode === undefined
        ? {}
        : { executionMode: definition.executionMode }),
      execute: async (toolCallId, args, signal, onUpdate) =>
        definition.execute({
          args,
          context: {
            identity: Object.freeze({ ...input.identity, toolCallId }),
            workspaceTrusted: input.workspaceTrusted,
            ...(modelUse === undefined ? {} : { modelUse }),
            ...(purposeModel === undefined ? {} : { purposeModel }),
          },
          ...(signal === undefined ? {} : { signal }),
          ...(onUpdate === undefined ? {} : { onUpdate }),
        }),
    });
  }

  return Object.freeze({
    tools: Object.freeze(tools),
    resolveDomainToolName: (wireName: string): string => {
      const definition = definitionsByWireName.get(wireName);
      if (definition === undefined) {
        throw new PiCapabilityToolBridgeError(
          'tool-not-registered',
          `Pi referenced unregistered Capability tool ${wireName}.`,
        );
      }
      return definition.name;
    },
    beforeToolCall: async (
      context: BeforeToolCallContext,
      signal?: AbortSignal,
    ): Promise<BeforeToolCallResult | undefined> => {
      if (signal?.aborted)
        return { block: true, reason: 'Tool permission preflight was cancelled.' };
      const definition = definitionsByWireName.get(context.toolCall.name);
      if (definition === undefined) {
        throw new PiCapabilityToolBridgeError(
          'tool-not-registered',
          `Pi requested unregistered Capability tool ${context.toolCall.name}.`,
        );
      }
      const identity = Object.freeze({
        ...input.identity,
        toolCallId: context.toolCall.id,
      });
      const requirementsFailure = checkRequirements(
        definition.requirements,
        input.workspaceTrusted,
      );
      if (requirementsFailure !== undefined) {
        return { block: true, reason: requirementsFailure };
      }
      const decision = await input.permissionPolicy.preflight({
        tool: definition,
        args: context.args,
        identity,
        workspaceTrusted: input.workspaceTrusted,
        ...(signal === undefined ? {} : { signal }),
      });
      return decision.allowed ? undefined : { block: true, reason: decision.reason };
    },
  });
}

const OPENAI_COMPATIBLE_TOOL_NAME = /^[a-zA-Z0-9_-]+$/;
const OPENAI_COMPATIBLE_TOOL_NAME_MAX_LENGTH = 64;

function projectToolWireName(domainName: string): string {
  if (
    domainName.length <= OPENAI_COMPATIBLE_TOOL_NAME_MAX_LENGTH &&
    OPENAI_COMPATIBLE_TOOL_NAME.test(domainName)
  ) {
    return domainName;
  }
  const suffix = `_${stableToolNameHash(domainName)}`;
  const readable = domainName.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'tool';
  return `${readable.slice(0, OPENAI_COMPATIBLE_TOOL_NAME_MAX_LENGTH - suffix.length)}${suffix}`;
}

function stableToolNameHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function createToolPurposeModelRuntime(
  models: Models,
  modelUse: ResolvedAgentModelUse,
): ToolPurposeModelRuntime | undefined {
  if (modelUse.purpose !== 'image.understand') {
    return undefined;
  }
  if (modelUse.execution !== 'pi') {
    throw new Error('Purpose image.understand requires a Pi-executed model binding.');
  }
  return Object.freeze({
    purpose: modelUse.purpose,
    providerId: modelUse.model.provider,
    modelId: modelUse.model.id,
    complete: async (request: ToolPurposeModelCompletionInput) => {
      const images = request.images ?? [];
      const messageContent =
        images.length === 0
          ? request.prompt
          : [
              { type: 'text' as const, text: request.prompt },
              ...images.map((image: ToolPurposeModelImage) => ({
                type: 'image' as const,
                data: image.data,
                mimeType: image.mimeType,
              })),
            ];
      const completion = await completePiPurposeModel({
        models,
        modelUse,
        context: {
          systemPrompt: request.systemPrompt,
          messages: [{ role: 'user', content: messageContent, timestamp: Date.now() }],
        },
        ...(request.maxTokens === undefined ? {} : { maxTokens: request.maxTokens }),
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      });
      return Object.freeze({
        text: completion.text,
        usage: completion.usage,
      });
    },
  });
}

function validateTool(tool: PiCapabilityTool): void {
  if (tool.name.trim().length === 0 || tool.label.trim().length === 0) {
    throw new PiCapabilityToolBridgeError(
      'invalid-tool',
      'Pi Capability tools require non-empty name and label fields.',
    );
  }
  if (
    typeof tool.parameters !== 'object' ||
    tool.parameters === null ||
    !('type' in tool.parameters) ||
    tool.parameters['type'] !== 'object'
  ) {
    throw new PiCapabilityToolBridgeError(
      'invalid-tool',
      `Pi Capability tool ${tool.name} requires a strict object parameter schema.`,
    );
  }
  if (tool.modelPurposeRequirement !== undefined && tool.modelPurpose === undefined) {
    throw new PiCapabilityToolBridgeError(
      'invalid-tool',
      `Pi Capability tool ${tool.name} cannot declare a purpose requirement without a model purpose.`,
    );
  }
}

function validateIdentity(identity: PiToolRunIdentity): void {
  for (const [field, value] of Object.entries(identity)) {
    if (value.trim().length === 0) {
      throw new PiCapabilityToolBridgeError(
        'identity-mismatch',
        `Pi Capability tool identity ${field} must be non-empty.`,
      );
    }
  }
}

function checkRequirements(
  requirements: PiCapabilityToolRequirements | undefined,
  workspaceTrusted: boolean,
): string | undefined {
  if (requirements?.workspaceTrust === true && !workspaceTrusted) {
    return 'Tool requires a trusted workspace.';
  }
  return undefined;
}
