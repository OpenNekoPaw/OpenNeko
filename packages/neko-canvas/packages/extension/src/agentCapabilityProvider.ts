/**
 * NekoCanvas Agent Capability Provider
 *
 * Provides canvas editing, storyboard, and generation tools to neko-agent
 * via the AgentCapabilityProvider protocol.
 *
 * This replaces the `createNekoCanvasTools()` factory function that was previously
 * maintained inside neko-agent's extension code.
 */

import * as vscode from 'vscode';
import { buildFountainScriptIndex } from '@neko/content';
import type {
  AgentCapabilityProvider,
  AgentCapabilityContext,
  AgentArtifactFacetsContribution,
  Tool,
  ToolParameters,
  PromptFragment,
  NekoCanvasAPI,
  CanvasNodeType,
  ICapabilityMediaService,
  ICapabilityConfigManager,
  StoryScenePlan,
  JsonPointerPath,
  CanvasStoryboardExecutionSummaryRequest,
  CanvasAgentContentFormat,
  CanvasAgentMutationMode,
  CanvasConnection,
  CanvasPlaybackReorderUnitsRequest,
  ReferenceDescriptor,
  StoryboardMediaRef,
  CanvasMarkdownCapabilityId,
  CanvasMarkdownCapabilityInput,
  CanvasMarkdownCapabilityResult,
  CanvasMarkdownCapabilityTarget,
  CanvasMarkdownResourceRef,
  AgentCapabilityInvocationInput,
  AgentCapabilityInvocationResult,
  AgentCapabilityLifecycleDescriptor,
  CanvasAuthoringCatalog,
  CanvasAuthoringCatalogRequest,
  CanvasAuthoringCatalogSection,
  CanvasAuthoringDiagnostic,
  CanvasAuthoringFieldProfileDescriptor,
  CanvasAuthoringOperationDescriptor,
  CanvasAuthoringRef,
  CanvasAuthoringResultEnvelope,
  CanvasAuthoringResultStatus,
  CanvasAgentApplyContentResult,
  CanvasConnectionEndpoint,
  CanvasCreateCompositeResult,
  CanvasCreateConnectionRequest,
  CanvasCreateConnectionResult,
  CanvasDeriveNodeResult,
  CanvasUpdateBlockRequest,
  CanvasUpdateBlockResult,
  ToolExecuteOptions,
} from '@neko/shared';
import {
  TOOL_NAMES_CANVAS,
  BUILT_IN_CANVAS_NODE_PRESETS,
  CANVAS_AUTHORING_CATALOG_SECTIONS,
  CANVAS_AUTHORING_CATALOG_VERSION,
  CANVAS_AUTHORING_FIELD_PROFILE_ALIGNMENT_STATES,
  CANVAS_AGENT_CHILD_PRESETS,
  CANVAS_AGENT_CONTAINER_PRESETS,
  CANVAS_AGENT_CREATE_NODE_TYPES,
  CANVAS_AGENT_DERIVE_TARGET_PRESETS,
  CANVAS_AGENT_NODE_PRESETS,
  CANVAS_CONNECTION_TYPES,
  CANVAS_STORYBOARD_ADVANCED_PARAMETER_IDS,
  CANVAS_STORYBOARD_ACTION_INTENT_IDS,
  CANVAS_STORYBOARD_NEXT_CREATIVE_STATE_TARGETS,
  CANVAS_STORYBOARD_PROMPT_BLOCK_KINDS,
  STORYBOARD_MEDIA_ROLES,
  MEDIA_PRODUCTION_ANIMATION_PLAN_PROFILE_ID,
  MEDIA_PRODUCTION_SHOT_IMAGE_PREP_PROFILE_ID,
  MEDIA_PRODUCTION_SHOT_IMAGE_PREP_REVIEW_PROFILE_ID,
  STORYBOARD_FROM_COMIC_SOURCE_PROFILE_ID,
  applyCanvasTimelineSyncToCanvas,
  applyStoryboardPayloadToCanvas,
  buildStoryboardImportTimelineSyncPayload,
  createStoryboardPayload,
  extractCanvasNodeGenerationLineage,
  getDefaultCanvasNodePresetName,
  getNodeParentId,
  isCanvasAuthoringCatalogSection,
  isCanvasConnectionType,
  isCanvasNodeType,
  traverseNarrativeFlow,
  isCanvasMarkdownCapabilityResult,
  validateCanvasAuthoringCatalogRequest,
  validateCanvasAuthoringFieldProfileDescriptor,
  withToolExecutionRunMetadata,
  createCreativeAiDiagnostic,
  type ExternalCreativeAiInvocation,
} from '@neko/shared';
import { resolveCharacterBindingsForNames } from '@neko/shared/vscode/extension';
import { getRootLogger } from './utils/logger';
import { toCanvasStableMediaResourceRef } from './canvasMediaResourceAdapter';
import {
  executeCanvasCreativeAi,
  type CanvasCreativeAiRuntimeContext,
} from './canvasCreativeAiExecutor';
import type { CanvasCreativeAiHostInvocationResult } from './creativeAiCanvasAdapter';

/**
 * Create the NekoCanvas capability provider.
 *
 * @param api The NekoCanvasAPI exports from the extension activation
 */
export interface NekoCanvasCapabilityProvider extends AgentCapabilityProvider {
  executeCanvasCreativeAiInvocation(
    invocation: ExternalCreativeAiInvocation,
  ): Promise<CanvasCreativeAiHostInvocationResult>;
}

export function createNekoCanvasCapabilityProvider(
  api: NekoCanvasAPI,
): NekoCanvasCapabilityProvider {
  return new NekoCanvasCapabilityProviderImpl(api);
}

/**
 * Auto-resolve model from ConfigManager when workspace config has no model set.
 * Writes to workspace config so neko-canvas can read it on next generation.
 */
async function ensureProjectModel(
  configManager: ICapabilityConfigManager | undefined,
  type: 'image' | 'video' | 'audio',
): Promise<void> {
  if (!configManager) return;
  const key = `neko.project.models.${type}`;
  const wsConfig = vscode.workspace.getConfiguration();
  const current = wsConfig.get<string>(key, '');
  if (current) return;
  const model = configManager.getEnabledModels().find((m) => m.type === type);
  if (model?.name) {
    await wsConfig.update(key, model.name, vscode.ConfigurationTarget.Workspace);
    getRootLogger().info(`Auto-resolved ${type} model from ConfigManager: ${model.name}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseToolValue(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }

  if (
    trimmed === 'true' ||
    trimmed === 'false' ||
    trimmed === 'null' ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[') ||
    /^-?\d+(\.\d+)?$/.test(trimmed)
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }

  return value;
}

function normalizeJsonPointerPath(value: unknown): JsonPointerPath | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  if (value === '' || value.startsWith('/')) {
    return value as JsonPointerPath;
  }
  throw new Error(`Invalid JSON Pointer path "${value}"`);
}

function readOptionalCanvasNodeType(
  value: unknown,
  label = 'node type',
): CanvasNodeType | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (isCanvasNodeType(value)) {
    return value;
  }
  throw new Error(`Unsupported Canvas ${label} "${String(value)}"`);
}

function readRequiredString(value: unknown, label: string): string {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  throw new Error(`Canvas ${label} is required`);
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readOptionalCanvasConnectionType(value: unknown): CanvasConnection['type'] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (isCanvasConnectionType(value)) {
    return value;
  }
  throw new Error(`Unsupported Canvas connection type "${String(value)}"`);
}

function readOptionalConnectionPriority(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new Error('Canvas connection priority must be a finite number');
}

function readOptionalConnectionExtension(
  value: unknown,
): CanvasConnection['extension'] | undefined {
  if (value === undefined) return undefined;
  if (isRecord(value)) return value as CanvasConnection['extension'];
  throw new Error('Canvas connection extension must be an object');
}

function readOptionalConnectionEndpoint(
  value: unknown,
  nodeId: string,
  endpointLabel: 'source' | 'target',
): CanvasConnectionEndpoint {
  if (value === undefined) {
    return { nodeId, scope: 'node' };
  }
  if (!isRecord(value)) {
    throw new Error(`Canvas ${endpointLabel} endpoint must be an object`);
  }
  const endpointNodeId = readOptionalString(value.nodeId) ?? nodeId;
  if (endpointNodeId !== nodeId) {
    throw new Error(
      `Canvas ${endpointLabel} endpoint nodeId "${endpointNodeId}" must match "${nodeId}"`,
    );
  }
  const scope = readOptionalConnectionEndpointScope(value.scope);
  const portId = readOptionalString(value.portId);
  const blockId = readOptionalString(value.blockId);
  const fieldPath = normalizeJsonPointerPath(value.fieldPath);
  const endpoint: CanvasConnectionEndpoint = {
    nodeId,
    ...(scope ? { scope } : { scope: 'node' }),
    ...(portId ? { portId } : {}),
    ...(blockId ? { blockId } : {}),
    ...(fieldPath ? { fieldPath } : {}),
  };
  if (endpoint.scope === 'port' && !endpoint.portId) {
    throw new Error(`Canvas ${endpointLabel} port endpoint requires portId`);
  }
  if (endpoint.scope === 'block' && !endpoint.blockId) {
    throw new Error(`Canvas ${endpointLabel} block endpoint requires blockId`);
  }
  if (endpoint.scope === 'field' && !endpoint.fieldPath) {
    throw new Error(`Canvas ${endpointLabel} field endpoint requires fieldPath`);
  }
  return endpoint;
}

function readOptionalConnectionEndpointScope(
  value: unknown,
): CanvasConnectionEndpoint['scope'] | undefined {
  if (value === undefined) return undefined;
  if (value === 'node' || value === 'port' || value === 'block' || value === 'field') {
    return value;
  }
  throw new Error(`Unsupported Canvas connection endpoint scope "${String(value)}"`);
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

type CanvasAuthoringResultCarrier<T> =
  T extends Record<string, unknown>
    ? T & { readonly authoringResult: CanvasAuthoringResultEnvelope }
    : { readonly value: T; readonly authoringResult: CanvasAuthoringResultEnvelope };

function withCanvasAuthoringResult<T>(
  data: T,
  authoringResult: CanvasAuthoringResultEnvelope,
): CanvasAuthoringResultCarrier<T> {
  if (isRecord(data)) {
    return { ...data, authoringResult } as CanvasAuthoringResultCarrier<T>;
  }
  return { value: data, authoringResult } as CanvasAuthoringResultCarrier<T>;
}

function createCanvasAuthoringResultEnvelope(input: {
  readonly status?: CanvasAuthoringResultStatus;
  readonly refs?: readonly CanvasAuthoringRef[];
  readonly diagnostics?: readonly CanvasAuthoringDiagnostic[];
  readonly changedFields?: readonly string[];
  readonly blockedReason?: string;
  readonly nextActions?: CanvasAuthoringResultEnvelope['nextActions'];
  readonly target?: CanvasAuthoringResultEnvelope['target'];
  readonly provenance?: CanvasAuthoringResultEnvelope['provenance'];
  readonly summary?: string;
}): CanvasAuthoringResultEnvelope {
  return {
    version: CANVAS_AUTHORING_CATALOG_VERSION,
    status: input.status ?? 'success',
    refs: input.refs ?? [],
    diagnostics: input.diagnostics ?? [],
    ...(input.changedFields?.length ? { changedFields: input.changedFields } : {}),
    ...(input.blockedReason ? { blockedReason: input.blockedReason } : {}),
    ...(input.nextActions?.length ? { nextActions: input.nextActions } : {}),
    ...(input.target ? { target: input.target } : {}),
    ...(input.provenance ? { provenance: input.provenance } : {}),
    ...(input.summary ? { summary: input.summary } : {}),
  };
}

function createBlockedCanvasAuthoringResultEnvelope(
  operationId: string,
  err: unknown,
  options: {
    readonly requiredQuery?: string;
    readonly target?: CanvasAuthoringResultEnvelope['target'];
    readonly provenance?: CanvasAuthoringResultEnvelope['provenance'];
  } = {},
): CanvasAuthoringResultEnvelope {
  const message = readErrorMessage(err);
  const suggestedActions = [
    {
      id: 'query-authoring-catalog',
      label: 'Query Canvas authoring catalog',
      toolName: TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
    },
    {
      id: 'query-active-context',
      label: 'Query active Canvas context',
      toolName: TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
    },
  ];
  return createCanvasAuthoringResultEnvelope({
    status: 'blocked',
    blockedReason: message,
    target: options.target,
    provenance: options.provenance,
    nextActions: suggestedActions,
    diagnostics: [
      {
        severity: 'error',
        code: 'canvas-authoring-operation-blocked',
        message,
        target: operationId,
        retryable: true,
        ...(options.requiredQuery ? { requiredQuery: options.requiredQuery } : {}),
        suggestedActions,
      },
    ],
  });
}

function readErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function nodeRef(nodeId: string, label?: string): CanvasAuthoringRef {
  return { kind: 'node', id: nodeId, ...(label ? { label } : {}) };
}

function connectionRef(connectionId: string): CanvasAuthoringRef {
  return { kind: 'connection', id: connectionId };
}

function blockRef(nodeId: string, blockId: string): CanvasAuthoringRef {
  return { kind: 'block', id: blockId, nodeId };
}

function uniqueAuthoringRefs(refs: readonly CanvasAuthoringRef[]): readonly CanvasAuthoringRef[] {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createNodeMutationAuthoringResult(
  nodeId: string,
  summary: string,
): CanvasAuthoringResultEnvelope {
  return createCanvasAuthoringResultEnvelope({
    refs: [nodeRef(nodeId)],
    summary,
  });
}

function createUpdateNodeAuthoringResult(
  nodeId: string,
  data: unknown,
): CanvasAuthoringResultEnvelope {
  return createCanvasAuthoringResultEnvelope({
    refs: [nodeRef(nodeId)],
    changedFields: isRecord(data) ? Object.keys(data) : undefined,
    target: { nodeId },
    summary: 'Updated Canvas node data.',
  });
}

function createDeriveNodeAuthoringResult(
  result: CanvasDeriveNodeResult,
): CanvasAuthoringResultEnvelope {
  return createCanvasAuthoringResultEnvelope({
    refs: uniqueAuthoringRefs([
      nodeRef(result.nodeId),
      ...(result.connectionId ? [connectionRef(result.connectionId)] : []),
    ]),
    summary: 'Derived a Canvas node from an existing node.',
  });
}

function createCompositeAuthoringResult(
  result: CanvasCreateCompositeResult,
): CanvasAuthoringResultEnvelope {
  return createCanvasAuthoringResultEnvelope({
    refs: uniqueAuthoringRefs([
      nodeRef(result.containerId, 'container'),
      ...result.childIds.map((childId) => nodeRef(childId, 'child')),
      ...(result.connectionIds?.map(connectionRef) ?? []),
    ]),
    summary: 'Created a Canvas composite.',
  });
}

function createConnectionAuthoringResult(
  result: CanvasCreateConnectionResult,
): CanvasAuthoringResultEnvelope {
  return createCanvasAuthoringResultEnvelope({
    refs: uniqueAuthoringRefs([
      connectionRef(result.connectionId),
      ...(result.connection
        ? [
            nodeRef(result.connection.sourceId, 'source'),
            nodeRef(result.connection.targetId, 'target'),
          ]
        : []),
    ]),
    summary: 'Created a Canvas connection.',
  });
}

function createUpdateBlockAuthoringResult(
  request: CanvasUpdateBlockRequest,
  result: CanvasUpdateBlockResult,
): CanvasAuthoringResultEnvelope {
  const changedFields = [
    ...(request.path ? [request.path] : []),
    ...(request.blockId ? [`block:${request.blockId}`] : []),
  ];
  return createCanvasAuthoringResultEnvelope({
    status: result.changed ? 'success' : 'noop',
    refs: uniqueAuthoringRefs([
      nodeRef(result.nodeId),
      ...(request.blockId ? [blockRef(result.nodeId, request.blockId)] : []),
    ]),
    changedFields,
    target: { nodeId: result.nodeId, ...(request.path ? { fieldPath: request.path } : {}) },
    summary: result.changed ? 'Updated a Canvas block.' : 'Canvas block update made no changes.',
  });
}

function createApplyAgentContentAuthoringResult(
  result: CanvasAgentApplyContentResult,
): CanvasAuthoringResultEnvelope {
  return createCanvasAuthoringResultEnvelope({
    status: result.changed ? 'success' : 'noop',
    refs: uniqueAuthoringRefs([
      ...(result.nodeId ? [nodeRef(result.nodeId)] : []),
      ...(result.containerId ? [nodeRef(result.containerId, 'container')] : []),
      ...(result.createdNodeIds?.map((nodeId) => nodeRef(nodeId, 'created')) ?? []),
    ]),
    changedFields: result.target?.fieldPath ? [result.target.fieldPath] : undefined,
    target: result.target,
    summary: result.reason ?? `Applied Canvas Agent content in ${result.mode} mode.`,
  });
}

function createGenerationAuthoringResult(
  operationId: string,
  nodeIds: readonly string[],
): CanvasAuthoringResultEnvelope {
  return createCanvasAuthoringResultEnvelope({
    refs: nodeIds.map((nodeId) => nodeRef(nodeId)),
    nextActions: [
      {
        id: 'query-generation-result',
        label: 'Query updated Canvas node state',
        toolName: TOOL_NAMES_CANVAS.CANVAS_GET_NODE,
      },
    ],
    summary: `${operationId} accepted by Canvas generation scheduler.`,
  });
}

function readPlaybackReorderApprovalContext(
  value: unknown,
): CanvasPlaybackReorderUnitsRequest['approvalContext'] {
  if (
    value === 'explicit-user-instruction' ||
    value === 'agent-confirmed' ||
    value === 'agent-inferred'
  ) {
    return value;
  }
  return 'agent-inferred';
}

function buildCanvasMarkdownCapabilityInput(
  capabilityId: CanvasMarkdownCapabilityId,
  args: Record<string, unknown>,
): CanvasMarkdownCapabilityInput {
  if (capabilityId === 'canvas.attachResource') {
    return {
      capabilityId,
      target: (isRecord(args.target) ? args.target : {}) as CanvasMarkdownCapabilityTarget,
      resource: (isRecord(args.resource) ? args.resource : {}) as CanvasMarkdownResourceRef,
      ...(typeof args.role === 'string' ? { role: args.role } : {}),
      ...(isRecord(args.provenance) ? { provenance: args.provenance } : {}),
    };
  }

  return {
    capabilityId,
    markdown: typeof args.markdown === 'string' ? args.markdown : '',
    ...(isRecord(args.canonicalStoryboard)
      ? { canonicalStoryboard: args.canonicalStoryboard }
      : {}),
    ...(typeof args.title === 'string' ? { title: args.title } : {}),
    ...(typeof args.sourceFormat === 'string' ? { sourceFormat: args.sourceFormat } : {}),
    ...(Array.isArray(args.resources) ? { resources: args.resources } : {}),
    ...(isRecord(args.target) ? { target: args.target } : {}),
    ...(isRecord(args.provenance) ? { provenance: args.provenance } : {}),
    ...(typeof args.intentHint === 'string' ? { intentHint: args.intentHint } : {}),
    ...(typeof args.profileHint === 'string' ? { profileHint: args.profileHint } : {}),
    ...(typeof args.tableTitle === 'string' ? { tableTitle: args.tableTitle } : {}),
    ...(typeof args.mode === 'string' ? { mode: args.mode } : {}),
    ...(isRecord(args.approval) ? { approval: args.approval } : {}),
  } as CanvasMarkdownCapabilityInput;
}

function applyCanvasMarkdownToolApprovalContext(
  input: CanvasMarkdownCapabilityInput,
  options: CanvasToolExecuteOptions,
): CanvasMarkdownCapabilityInput {
  if (input.capabilityId !== 'canvas.createStoryboardFromMarkdown') return input;
  if (input.mode !== 'create-nodes') return input;
  if (input.approval) return input;

  const toolCallId = readOptionalString(options?.metadata?.['parentToolCallId']);
  if (!toolCallId) return input;

  return {
    ...input,
    approval: {
      source: 'tool-confirmation',
      toolCallId,
      approvedAt: Date.now(),
    },
  };
}

function requiresVisibleStoryboardReviewSource(
  definition: CanvasMarkdownToolDefinition,
  input: CanvasMarkdownCapabilityInput,
): boolean {
  if (input.capabilityId === 'canvas.attachResource') return false;
  if (definition.capabilityId === 'canvas.validateMarkdownStoryboard') return false;
  if (definition.capabilityId === 'canvas.createStoryboardFromMarkdown') return false;
  return input.profileHint?.toLowerCase() === 'storyboard';
}

function hasVisibleAssistantMarkdownBlockSource(input: CanvasMarkdownCapabilityInput): boolean {
  if (!('provenance' in input)) return false;
  const provenance = input.provenance;
  return (
    provenance?.source === 'webview' &&
    provenance.label === CANVAS_VISIBLE_ASSISTANT_MARKDOWN_PROVENANCE_LABEL
  );
}

function createMarkdownCapabilityTool(
  api: NekoCanvasAPI,
  definition: CanvasMarkdownToolDefinition,
): Tool {
  return {
    name: definition.name,
    description: definition.description,
    category: 'project',
    isReadOnly: definition.isReadOnly,
    isConcurrencySafe: definition.isReadOnly,
    requiresConfirmation: definition.requiresConfirmation,
    safetyKind: definition.requiresConfirmation ? 'confirmation-gated' : 'read-only-query',
    parameters: {
      type: 'object',
      properties:
        definition.capabilityId === 'canvas.attachResource'
          ? {
              target: {
                type: 'object',
                description: 'Canvas target for the resource attachment.',
              },
              resource: {
                type: 'object',
                description: CANVAS_MARKDOWN_RESOURCE_CONTRACT_DESCRIPTION,
              },
              role: { type: 'string', description: 'Optional resource role.' },
              provenance: { type: 'object', description: 'Optional Agent provenance.' },
            }
          : {
              markdown: {
                type: 'string',
                description: 'Original Markdown content. Do not pass rendered HTML.',
              },
              title: { type: 'string', description: 'Optional title.' },
              sourceFormat: {
                type: 'string',
                enum: ['markdown', 'markdown-table', 'gfm-table', 'resource-reference-markdown'],
                description: 'Optional source format hint.',
              },
              resources: {
                type: 'array',
                items: { type: 'object' },
                description: `Stable resource refs keyed by Markdown tokens. ${CANVAS_MARKDOWN_RESOURCE_CONTRACT_DESCRIPTION}`,
              },
              target: { type: 'object', description: 'Optional Canvas insertion target.' },
              provenance: { type: 'object', description: 'Optional Agent provenance.' },
              intentHint: {
                type: 'string',
                enum: ['auto', 'note', 'table', 'creative-table'],
                description:
                  'Optional advisory ingest intent. Canvas remains the parsing authority.',
              },
              profileHint: { type: 'string', description: 'Optional Canvas-owned profile hint.' },
              canonicalStoryboard: {
                type: 'object',
                description:
                  'Preferred typed canonical Storyboard artifact. Preserve nested scenes/shots, revision, prompts, source trace, and stable media refs unchanged.',
              },
              tableTitle: { type: 'string', description: 'Optional table title.' },
              mode: {
                type: 'string',
                enum: ['review-first', 'create-nodes'],
                description:
                  'Storyboard creation mode. Use create-nodes for canvas.createStoryboardFromMarkdown production scene/shot creation.',
              },
              approval: {
                type: 'object',
                description:
                  'Optional lifecycle approval context for production apply mutations. Host-confirmed tool calls inject a tool-confirmation approval automatically; explicit creation workflows may pass creation-apply.',
              },
            },
      required:
        definition.capabilityId === 'canvas.attachResource'
          ? ['target', 'resource']
          : definition.capabilityId === 'canvas.createStoryboardFromMarkdown'
            ? []
            : ['markdown'],
    } satisfies ToolParameters,
    domain: { id: 'canvas', source: 'capability', operationDomain: 'markdown-authoring' },
    async execute(args, options) {
      try {
        const input = applyCanvasMarkdownToolApprovalContext(
          buildCanvasMarkdownCapabilityInput(definition.capabilityId, args),
          options,
        );
        if (
          definition.capabilityId !== 'canvas.attachResource' &&
          (!('markdown' in input) || input.markdown.trim().length === 0)
        ) {
          return createBlockedCanvasMarkdownToolResult(
            definition,
            input,
            'Canvas Markdown capability requires non-empty markdown.',
            'canvas-markdown-missing-markdown',
          );
        }
        if (
          requiresVisibleStoryboardReviewSource(definition, input) &&
          !hasVisibleAssistantMarkdownBlockSource(input)
        ) {
          return createBlockedCanvasMarkdownToolResult(
            definition,
            input,
            CANVAS_STORYBOARD_VISIBLE_SOURCE_REQUIRED_MESSAGE,
            CANVAS_STORYBOARD_VISIBLE_SOURCE_REQUIRED_CODE,
          );
        }
        const data = await api.markdown.invoke(input);
        if (!isCanvasMarkdownCapabilityResult(data)) {
          return createBlockedCanvasMarkdownToolResult(
            definition,
            input,
            'Canvas Markdown capability returned an invalid result.',
            'canvas-markdown-invalid-result',
          );
        }
        const lifecycle = toCanvasMarkdownLifecycleResult(definition, input, data);
        const missingMutationRef = readMissingCanvasMarkdownMutationRefDiagnostic(definition, data);
        if (missingMutationRef) {
          return createBlockedCanvasMarkdownToolResult(
            definition,
            input,
            missingMutationRef.message,
            missingMutationRef.code,
          );
        }
        return { success: lifecycle.status !== 'blocked', data: lifecycle };
      } catch (err) {
        const authoringResult = createBlockedCanvasAuthoringResultEnvelope(
          definition.capabilityId,
          err,
          { requiredQuery: TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES },
        );
        return {
          success: false,
          error: `Failed to invoke Canvas Markdown capability: ${String(err)}`,
          data: {
            authoringResult,
          },
        };
      }
    },
  };
}

function createBlockedCanvasMarkdownToolResult(
  definition: CanvasMarkdownToolDefinition,
  input: CanvasMarkdownCapabilityInput,
  message: string,
  code: string,
): {
  readonly success: false;
  readonly error: string;
  readonly data: AgentCapabilityInvocationResult;
} {
  const authoringResult = createBlockedCanvasAuthoringResultEnvelope(
    definition.capabilityId,
    message,
    {
      target: 'target' in input ? input.target : undefined,
      provenance: 'provenance' in input ? input.provenance : undefined,
      requiredQuery: TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
    },
  );
  return {
    success: false,
    error: message,
    data: {
      capabilityId: definition.capabilityId,
      phase: definition.phase,
      status: 'blocked',
      diagnostics: [
        {
          severity: 'error',
          code,
          message,
        },
      ],
      data: {
        capabilityId: definition.capabilityId,
        status: 'blocked',
        diagnostics: authoringResult.diagnostics.map((diagnostic) => ({
          severity: diagnostic.severity,
          code: diagnostic.code,
          message: diagnostic.message,
        })),
        authoringResult,
      },
    },
  };
}

function readMissingCanvasMarkdownMutationRefDiagnostic(
  definition: CanvasMarkdownToolDefinition,
  result: CanvasMarkdownCapabilityResult,
): { readonly code: string; readonly message: string } | undefined {
  if (definition.isReadOnly || result.status === 'blocked' || result.status === 'validated') {
    return undefined;
  }
  if (
    result.status !== 'created' &&
    result.status !== 'changed' &&
    result.status !== 'needs-review'
  ) {
    return undefined;
  }
  const hasRef = Boolean(result.tableNodeId) || (result.nodeIds?.length ?? 0) > 0;
  if (hasRef) return undefined;
  return {
    code: 'canvas-markdown-mutation-result-missing-ref',
    message:
      'Canvas Markdown capability reported a mutation status but did not return any Canvas node reference.',
  };
}

function createCanvasMarkdownLifecycleInvocationInput(
  definition: CanvasMarkdownToolDefinition,
  input: CanvasMarkdownCapabilityInput,
): AgentCapabilityInvocationInput {
  return {
    capabilityId: definition.capabilityId,
    phase: definition.phase,
    payload: input,
    ...(input.capabilityId === 'canvas.attachResource'
      ? { target: projectCanvasMarkdownLifecycleTarget(input.target) }
      : input.target
        ? { target: projectCanvasMarkdownLifecycleTarget(input.target) }
        : {}),
    ...('provenance' in input && input.provenance
      ? {
          provenance: {
            source: input.provenance.source,
            conversationId: input.provenance.conversationId,
            messageId: input.provenance.messageId,
            toolCallId: input.provenance.toolCallId,
            label: input.provenance.label,
          },
        }
      : {}),
  };
}

function toCanvasMarkdownLifecycleResult(
  definition: CanvasMarkdownToolDefinition,
  input: CanvasMarkdownCapabilityInput,
  result: CanvasMarkdownCapabilityResult,
): AgentCapabilityInvocationResult {
  const lifecycleInput = createCanvasMarkdownLifecycleInvocationInput(definition, input);
  return {
    capabilityId: definition.capabilityId,
    phase: lifecycleInput.phase,
    status: toLifecycleStatus(definition.phase, result.status),
    diagnostics: result.diagnostics.map((diagnostic) => ({
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      ...(diagnostic.fieldKey ? { fieldKey: diagnostic.fieldKey } : {}),
      ...(diagnostic.token ? { token: diagnostic.token } : {}),
      ...(diagnostic.line !== undefined ? { line: diagnostic.line } : {}),
      ...(diagnostic.column !== undefined ? { column: diagnostic.column } : {}),
    })),
    ...(result.tableNodeId
      ? {
          reviewArtifact: {
            kind: 'node',
            id: result.tableNodeId,
            packageId: 'neko-canvas',
            artifactKind: 'canvas.table',
            profile: readCanvasMarkdownProfileFromResult(result) ?? 'storyboard',
          },
        }
      : {}),
    ...(result.nodeIds?.length
      ? {
          changedRefs: result.nodeIds.map((nodeId) => ({
            kind: 'node' as const,
            id: nodeId,
            packageId: 'neko-canvas',
          })),
        }
      : {}),
    ...(result.actions?.length
      ? {
          actions: result.actions.map((action) => {
            const capabilityId = action.capabilityId ?? definition.capabilityId;
            const actionDefinition = findCanvasMarkdownToolDefinition(capabilityId);
            return {
              actionId: action.actionId,
              ...(action.label ? { label: action.label } : {}),
              capabilityId,
              phase: actionDefinition?.phase ?? definition.phase,
              requiresApproval:
                actionDefinition?.requiresConfirmation ??
                capabilityId !== 'canvas.validateMarkdownStoryboard',
              ...(result.tableNodeId
                ? {
                    sourceRef: {
                      kind: 'node' as const,
                      id: result.tableNodeId,
                      packageId: 'neko-canvas',
                    },
                  }
                : {}),
              ...(lifecycleInput.target ? { target: lifecycleInput.target } : {}),
              payload: input,
            };
          }),
        }
      : {}),
    data: {
      ...result,
      authoringResult: createCanvasMarkdownAuthoringResult(definition, input, result),
    },
  };
}

function createCanvasMarkdownAuthoringResult(
  definition: CanvasMarkdownToolDefinition,
  input: CanvasMarkdownCapabilityInput,
  result: CanvasMarkdownCapabilityResult,
): CanvasAuthoringResultEnvelope {
  const refs = uniqueAuthoringRefs([
    ...(result.tableNodeId ? [nodeRef(result.tableNodeId, 'table')] : []),
    ...(result.nodeIds?.map((nodeId) => nodeRef(nodeId)) ?? []),
  ]);
  return createCanvasAuthoringResultEnvelope({
    status: toCanvasMarkdownAuthoringStatus(result.status),
    refs,
    diagnostics: result.diagnostics.map((diagnostic): CanvasAuthoringDiagnostic => ({
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      ...(diagnostic.fieldKey ? { target: diagnostic.fieldKey } : {}),
      ...(diagnostic.token ? { received: diagnostic.token } : {}),
      retryable: diagnostic.severity !== 'error',
    })),
    target: 'target' in input ? input.target : undefined,
    provenance: 'provenance' in input ? input.provenance : undefined,
    blockedReason:
      result.status === 'blocked'
        ? (result.diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message ??
          'Canvas Markdown capability blocked the authoring request.')
        : undefined,
    nextActions: result.actions?.map((action) => ({
      id: action.actionId,
      ...(action.label ? { label: action.label } : {}),
      toolName: findCanvasMarkdownToolDefinition(action.capabilityId ?? definition.capabilityId)
        ?.name,
      requiresApproval: action.capabilityId !== 'canvas.validateMarkdownStoryboard',
    })),
    summary: `${definition.displayName}: ${result.status}.`,
  });
}

function toCanvasMarkdownAuthoringStatus(
  status: CanvasMarkdownCapabilityResult['status'],
): CanvasAuthoringResultStatus {
  if (status === 'blocked') return 'blocked';
  if (status === 'needs-review') return 'partial';
  return 'success';
}

function readCanvasMarkdownProfileFromResult(
  result: CanvasMarkdownCapabilityResult,
): string | undefined {
  if (result.profileId) return result.profileId;
  return result.preview?.table?.profileId ?? result.preview?.profileId;
}

function findCanvasMarkdownToolDefinition(
  capabilityId: CanvasMarkdownCapabilityId,
): CanvasMarkdownToolDefinition | undefined {
  return CANVAS_MARKDOWN_TOOL_DEFINITIONS.find(
    (definition) => definition.capabilityId === capabilityId,
  );
}

function toLifecycleStatus(
  phase: AgentCapabilityLifecycleDescriptor['phases'][number],
  status: CanvasMarkdownCapabilityResult['status'],
): AgentCapabilityInvocationResult['status'] {
  if (status === 'blocked') return 'blocked';
  if (status === 'needs-review') return 'needs-review';
  if (phase === 'validate') return 'validated';
  if (phase === 'apply') return 'applied';
  if (phase === 'execute') return 'executed';
  if (phase === 'describe') return 'described';
  return status === 'created' || status === 'changed' ? 'needs-review' : 'validated';
}

function projectCanvasMarkdownLifecycleTarget(
  target: CanvasMarkdownCapabilityTarget,
): AgentCapabilityInvocationInput['target'] {
  return {
    packageId: 'neko-canvas',
    ...(target.canvasId ? { canvasId: target.canvasId } : {}),
    ...(target.nodeId ? { nodeId: target.nodeId } : {}),
    ...(target.containerId ? { containerId: target.containerId } : {}),
    ...(target.slotId ? { slotId: target.slotId } : {}),
    ...(target.fieldPath ? { fieldPath: target.fieldPath } : {}),
    ...(target.insertionPoint ? { insertionPoint: target.insertionPoint } : {}),
  };
}

function collectShotKeyframeReferenceDescriptors(
  nodeId: string,
  data: Record<string, unknown>,
): readonly ReferenceDescriptor[] {
  const mediaRefs = [
    ...readStoryboardMediaRefs(data['generatedMediaRefs']),
    ...readStoryboardMediaRefs(
      data['shotImagePrepPlan'] && isRecord(data['shotImagePrepPlan'])
        ? data['shotImagePrepPlan']['outputMediaRefs']
        : undefined,
    ),
  ];
  return mediaRefs.map((ref, index): ReferenceDescriptor => ({
    schemaVersion: 1,
    kind: 'reference-descriptor',
    referenceId: `${nodeId}:keyframeRefs:${index}:${ref.refId}`,
    sourceKind: 'canvas-node',
    sourceId: nodeId,
    referenceKind: ref.locator.type === 'asset' ? 'generated-asset' : 'custom',
    role: ref.role === 'generated' || ref.role === 'derived' ? 'keyframe' : 'reference',
    modality: ref.mimeType?.startsWith('video/') ? 'video' : 'image',
    payload: storyboardMediaRefPayloadForReference(ref),
    metadata: {
      storyboardRefId: ref.refId,
      ...(ref.label ? { label: ref.label } : {}),
      ...(ref.mimeType ? { mimeType: ref.mimeType } : {}),
    },
  }));
}

function readStoryboardMediaRefs(value: unknown): readonly StoryboardMediaRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): readonly StoryboardMediaRef[] =>
    isStoryboardMediaRef(item) ? [item] : [],
  );
}

function readShotPreparedKeyframeRef(
  data: Record<string, unknown>,
): StoryboardMediaRef | undefined {
  const refs = [
    ...readStoryboardMediaRefs(data['generatedMediaRefs']),
    ...readStoryboardMediaRefs(
      data['shotImagePrepPlan'] && isRecord(data['shotImagePrepPlan'])
        ? data['shotImagePrepPlan']['outputMediaRefs']
        : undefined,
    ),
  ];
  return refs.find(
    (ref) =>
      ref.role === 'derived' ||
      ref.role === 'generated' ||
      ref.role === 'thumbnail' ||
      ref.role === 'reference',
  );
}

function isStoryboardMediaRef(value: unknown): value is StoryboardMediaRef {
  if (!isRecord(value) || typeof value['refId'] !== 'string' || !isRecord(value['locator'])) {
    return false;
  }
  const locatorType = value['locator']['type'];
  return (
    locatorType === 'tool-result' ||
    locatorType === 'asset' ||
    locatorType === 'workspace-path' ||
    locatorType === 'canvas-node' ||
    locatorType === 'story-source'
  );
}

function storyboardMediaRefPayloadForReference(
  ref: StoryboardMediaRef,
): ReferenceDescriptor['payload'] {
  switch (ref.locator.type) {
    case 'asset':
      return {
        type: 'generated-asset',
        assetId: ref.locator.assetId,
        ...(ref.locator.assetVersion ? { variantId: ref.locator.assetVersion } : {}),
      };
    case 'canvas-node':
      return {
        type: 'canvas-node',
        nodeId: ref.locator.canvasNodeId,
        ...(ref.locator.outputId ? { slotId: ref.locator.outputId } : {}),
      };
    case 'workspace-path':
      return {
        type: 'path',
        path: ref.locator.path,
        pathKind: storyboardPathKindForReference(ref.locator.path),
      };
    case 'story-source':
      return {
        type: 'custom',
        data: {
          locatorType: 'story-source',
          storyId: ref.locator.storyId,
          ...(ref.locator.sceneId ? { sceneId: ref.locator.sceneId } : {}),
          ...(ref.locator.frameIndex !== undefined ? { frameIndex: ref.locator.frameIndex } : {}),
        },
      };
    case 'tool-result':
      return {
        type: 'custom',
        data: {
          locatorType: 'tool-result',
          toolCallId: ref.locator.toolCallId,
          assetIndex: ref.locator.assetIndex,
          ...(ref.locator.taskId ? { taskId: ref.locator.taskId } : {}),
        },
      };
  }
}

function storyboardPathKindForReference(
  path: string,
): 'workspace-relative' | 'variable' | 'transitional' {
  if (path.startsWith('${')) return 'variable';
  if (/^(?:\.{0,2}\/)?[^/]/.test(path)) return 'workspace-relative';
  return 'transitional';
}

function readShotGeneratedImageFallback(data: Record<string, unknown>): string | undefined {
  const generatedAsset = isRecord(data['generatedAsset']) ? data['generatedAsset'] : undefined;
  return (
    (typeof generatedAsset?.['path'] === 'string' ? generatedAsset['path'] : undefined) ??
    (typeof data['generatedImage'] === 'string' ? data['generatedImage'] : undefined)
  );
}

interface CanvasMarkdownToolDefinition {
  readonly name: string;
  readonly capabilityId: CanvasMarkdownCapabilityId;
  readonly displayName: string;
  readonly description: string;
  readonly phase: AgentCapabilityLifecycleDescriptor['phases'][number];
  readonly requiresConfirmation: boolean;
  readonly isReadOnly?: boolean;
}

type CanvasToolName = (typeof TOOL_NAMES_CANVAS)[keyof typeof TOOL_NAMES_CANVAS];
type CanvasToolLocalization = NonNullable<Tool['localization']>[string];
type CanvasToolTraits = NonNullable<Tool['traits']>;
type CanvasToolExecuteOptions = Parameters<Tool['execute']>[1];

const CANVAS_MARKDOWN_RESOURCE_CONTRACT_DESCRIPTION =
  'Resource wrappers must preserve field contracts: unified ResourceRef values use resourceRef; document-entry DocumentArchiveResourceRef values must use documentResourceRef.';
const CANVAS_VISIBLE_ASSISTANT_MARKDOWN_PROVENANCE_LABEL = 'assistant-markdown-block';
const CANVAS_STORYBOARD_VISIBLE_SOURCE_REQUIRED_CODE = 'canvas-storyboard-visible-source-required';
const CANVAS_STORYBOARD_VISIBLE_SOURCE_REQUIRED_MESSAGE =
  'Canvas storyboard review ingestion requires a visible assistant Markdown block source or UI handoff source.';

const CANVAS_MARKDOWN_TOOL_DEFINITIONS: readonly CanvasMarkdownToolDefinition[] = [
  {
    name: TOOL_NAMES_CANVAS.CANVAS_INGEST_MARKDOWN,
    capabilityId: 'canvas.ingestMarkdown',
    displayName: 'Ingest Markdown to Canvas',
    phase: 'review',
    description:
      'Review-ingest visible Markdown into Canvas as a note, generic table, or creative review table. Storyboard profile input must come from a visible assistant Markdown block or UI handoff source. This does not create production scene/shot nodes; use canvas.createStoryboardFromMarkdown for headless storyboard node creation.',
    requiresConfirmation: true,
  },
  {
    name: TOOL_NAMES_CANVAS.CANVAS_CREATE_MARKDOWN_NOTE,
    capabilityId: 'canvas.createMarkdownNote',
    displayName: 'Create Markdown Note',
    phase: 'review',
    description:
      'Create a Canvas Markdown note from reviewed Markdown. Canvas validates target and resources before mutating state.',
    requiresConfirmation: true,
  },
  {
    name: TOOL_NAMES_CANVAS.CANVAS_CREATE_TABLE_FROM_MARKDOWN,
    capabilityId: 'canvas.createTableFromMarkdown',
    displayName: 'Create Markdown Table',
    phase: 'review',
    description:
      'Create a Canvas table node from a Markdown or GFM table. Canvas owns parsing and diagnostics.',
    requiresConfirmation: true,
  },
  {
    name: TOOL_NAMES_CANVAS.CANVAS_CREATE_STORYBOARD_FROM_MARKDOWN,
    capabilityId: 'canvas.createStoryboardFromMarkdown',
    displayName: 'Create Storyboard Nodes',
    phase: 'apply',
    description:
      'Create production Canvas storyboard nodes (scene.basic + shot.basic) through the headless .nkc authoring path. Prefer a typed canonical Storyboard artifact; Markdown remains a source adapter for text-only inputs. Requires mode=create-nodes and explicit confirmation; host-confirmed tool calls provide approval automatically.',
    requiresConfirmation: true,
  },
  {
    name: TOOL_NAMES_CANVAS.CANVAS_ATTACH_RESOURCE,
    capabilityId: 'canvas.attachResource',
    displayName: 'Attach Canvas Resource',
    phase: 'apply',
    description:
      'Attach a stable ResourceRef or DocumentArchiveResourceRef to an existing Canvas target.',
    requiresConfirmation: true,
  },
  {
    name: TOOL_NAMES_CANVAS.CANVAS_VALIDATE_MARKDOWN_STORYBOARD,
    capabilityId: 'canvas.validateMarkdownStoryboard',
    displayName: 'Validate Markdown Storyboard',
    phase: 'validate',
    description:
      'Validate a Markdown semantic storyboard table and return diagnostics without mutating Canvas state.',
    requiresConfirmation: false,
    isReadOnly: true,
  },
] as const;

function createCanvasMarkdownLifecycleDescriptor(
  definition: CanvasMarkdownToolDefinition,
): AgentCapabilityLifecycleDescriptor {
  return {
    capabilityId: definition.capabilityId,
    providerId: 'neko-canvas',
    displayName: definition.displayName,
    description: definition.description,
    phases:
      definition.capabilityId === 'canvas.createStoryboardFromMarkdown'
        ? ['validate', 'review', 'apply']
        : definition.capabilityId === 'canvas.validateMarkdownStoryboard'
          ? ['validate']
          : [definition.phase],
    inputSchema: { id: 'canvas.markdown.input', version: 1 },
    resultSchema: { id: 'agent.capability.lifecycle.result', version: 1 },
    accepts:
      definition.capabilityId === 'canvas.attachResource'
        ? ['ResourceRef', 'DocumentArchiveResourceRef']
        : ['Markdown', 'GfmTable'],
    produces:
      definition.capabilityId === 'canvas.validateMarkdownStoryboard'
        ? ['CanvasMarkdownCapabilityDiagnostics']
        : ['canvas-node-ref'],
    risk: definition.isReadOnly ? 'low' : 'medium',
    requiresApproval: definition.requiresConfirmation,
    safetyKind: definition.requiresConfirmation ? 'confirmation-gated' : 'read-only-query',
    targetRequirements: definition.requiresConfirmation
      ? { allowedFallbacks: ['viewport-insertion', 'explicit-user-input'] }
      : undefined,
  };
}

const CANVAS_MARKDOWN_LIFECYCLE_DESCRIPTORS: readonly AgentCapabilityLifecycleDescriptor[] =
  CANVAS_MARKDOWN_TOOL_DEFINITIONS.map(createCanvasMarkdownLifecycleDescriptor);

const CANVAS_READ_ONLY_TOOL_NAMES: ReadonlySet<CanvasToolName> = new Set([
  TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_PLAN,
  TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_ROUTES,
  TOOL_NAMES_CANVAS.CANVAS_REVEAL_PLAYBACK_WORKSPACE,
  TOOL_NAMES_CANVAS.CANVAS_VALIDATE_MARKDOWN_STORYBOARD,
  TOOL_NAMES_CANVAS.CANVAS_LIST_NODES,
  TOOL_NAMES_CANVAS.CANVAS_GET_NODE,
  TOOL_NAMES_CANVAS.CANVAS_EXTRACT_STRUCTURED_CONTENT,
  TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
  TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
  TOOL_NAMES_CANVAS.CANVAS_LIST_CONNECTIONS,
  TOOL_NAMES_CANVAS.CANVAS_GET_CONNECTION,
  TOOL_NAMES_CANVAS.CANVAS_NARRATIVE_TRAVERSE,
  TOOL_NAMES_CANVAS.CANVAS_GET_STORYBOARD_EXECUTION_SUMMARY,
]);

const CANVAS_NETWORK_GENERATION_TOOL_NAMES: ReadonlySet<CanvasToolName> = new Set([
  TOOL_NAMES_CANVAS.CANVAS_GENERATE_IMAGE,
  TOOL_NAMES_CANVAS.CANVAS_GENERATE_BATCH,
  TOOL_NAMES_CANVAS.CANVAS_APPLY_STYLE_TRANSFER,
]);

const CANVAS_TOOL_ZH_LOCALIZATIONS = {
  [TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_PLAN]: {
    description:
      '读取当前 CanvasPlaybackPlan 投影；仅展示画布顺序，不持久化路由顺序、播放头或播放状态。',
    parameters: {
      sourceCanvasUri: '可选 Canvas 文档 URI；省略时使用当前活动 Canvas。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_ROUTES]: {
    description: '读取由 CanvasPlaybackPlan 派生的有效播放路由候选；不创建 Agent 自有时间线。',
    parameters: {
      sourceCanvasUri: '可选 Canvas 文档 URI；省略时使用当前活动 Canvas。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_REVEAL_PLAYBACK_WORKSPACE]: {
    description:
      '打开同一 Webview 内的 Canvas PlaybackWorkspace，用于路由播放；Canvas 负责播放 UI 和播放头。',
    parameters: {
      sourceCanvasUri: '可选 Canvas 文档 URI。',
      routeId: '可选播放路由 ID，用于聚焦。',
      unitId: '可选播放单元 ID，用于跳转。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_CREATE_CUT_DRAFT_FROM_ROUTE]: {
    description: '将 Canvas 播放路由投影为 CanvasCutDraftPayload，并可在确认后发送到 Cut。',
    parameters: {
      sourceCanvasUri: '可选 Canvas 文档 URI。',
      routeId: '要投影的播放路由 ID。',
      projectName: '可选目标 Cut 项目名称。',
      sendToCut: '为 true 时，在确认后把创建的草稿发送到当前 Cut 时间线。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_REORDER_PLAYBACK_UNITS]: {
    description:
      '通过 Canvas 图命令重排播放单元，并重新投影 CanvasPlaybackPlan；Agent 推断的重排需要确认。',
    parameters: {
      sourceCanvasUri: '可选 Canvas 文档 URI。',
      routeId: '要重排的播放路由 ID。',
      orderedUnitIds: '所选路由的完整播放单元 ID 顺序。',
      approvalContext: '审批上下文；agent-inferred 仍需要确认。',
      instructionText: '同一轮用户给出的具体重排指令。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_INGEST_MARKDOWN]: {
    description:
      '将可见 Markdown 内容作为可审阅 Note、表格或 creative table 导入 Canvas；storyboard profile 输入必须来自可见 assistant Markdown 块或 UI handoff 来源；不会创建生产 scene/shot 节点。',
    parameters: {
      markdown: '原始 Markdown 内容；不要传入渲染后的 HTML。',
      title: '可选标题。',
      sourceFormat: '来源格式提示。',
      resources: 'Markdown 中引用的稳定资源列表。',
      target: '可选 Canvas 插入目标。',
      provenance: '可选 Agent 来源信息。',
      intentHint: '可选内容意图提示。',
      profileHint: '可选 Canvas profile 提示。',
      tableTitle: '可选表格标题。',
      mode: '分镜创建模式；生产 scene/shot 创建使用 create-nodes。',
      approval:
        '可选生命周期审批上下文；已由宿主确认的工具调用会自动注入 tool-confirmation，显式创作流程可传 creation-apply。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_CREATE_MARKDOWN_NOTE]: {
    description: '从已审阅 Markdown 创建 Canvas Markdown Note；Canvas 会在变更前校验目标和资源。',
    parameters: {
      markdown: '原始 Markdown 内容；不要传入渲染后的 HTML。',
      title: '可选标题。',
      sourceFormat: '来源格式提示。',
      resources: 'Markdown 中引用的稳定资源列表。',
      target: '可选 Canvas 插入目标。',
      provenance: '可选 Agent 来源信息。',
      intentHint: '可选内容意图提示。',
      profileHint: '可选 Canvas profile 提示。',
      tableTitle: '可选表格标题。',
      mode: '可选分镜创建模式。',
      approval: '生产级 apply 变更所需的审批上下文。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_CREATE_TABLE_FROM_MARKDOWN]: {
    description: '从 Markdown 或 GFM 表格创建 Canvas 表格/草稿节点；Canvas 负责解析和诊断。',
    parameters: {
      markdown: '原始 Markdown 内容；不要传入渲染后的 HTML。',
      title: '可选标题。',
      sourceFormat: '来源格式提示。',
      resources: 'Markdown 中引用的稳定资源列表。',
      target: '可选 Canvas 插入目标。',
      provenance: '可选 Agent 来源信息。',
      intentHint: '可选内容意图提示。',
      profileHint: '可选 Canvas profile 提示。',
      tableTitle: '可选表格标题。',
      mode: '可选分镜创建模式。',
      approval: '生产级 apply 变更所需的审批上下文。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_CREATE_STORYBOARD_FROM_MARKDOWN]: {
    description:
      '在显式确认后，通过无 UI .nkc authoring 路径从已校验 Markdown 创建生产 Canvas 分镜节点（scene.basic + shot.basic）；需要完整 storyboard creative table 和 create-nodes 模式。',
    parameters: {
      markdown: '原始 Markdown 分镜内容。',
      title: '可选标题。',
      sourceFormat: '来源格式提示。',
      resources: 'Markdown 中引用的稳定资源列表。',
      target: '可选 Canvas 插入目标。',
      provenance: '可选 Agent 来源信息。',
      intentHint: '可选内容意图提示。',
      profileHint: '可选 Canvas profile 提示。',
      tableTitle: '可选表格标题。',
      mode: '分镜创建模式；生产节点创建必须使用 create-nodes。',
      approval:
        '可选生命周期审批上下文；已由宿主确认的工具调用会自动注入 tool-confirmation，显式创作流程可传 creation-apply。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_ATTACH_RESOURCE]: {
    description: '把稳定 ResourceRef 或 DocumentArchiveResourceRef 绑定到已有 Canvas 目标。',
    parameters: {
      target: '资源绑定的 Canvas 目标。',
      resource: '稳定 ResourceRef 或 DocumentArchiveResourceRef 包装对象。',
      role: '可选资源角色。',
      provenance: '可选 Agent 来源信息。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_VALIDATE_MARKDOWN_STORYBOARD]: {
    description: '只读校验 Markdown 分镜内容是否可被 Canvas 接收；不会修改 Canvas 状态。',
    parameters: {
      markdown: '要校验的 Markdown 分镜内容。',
      title: '可选标题。',
      sourceFormat: '来源格式提示。',
      resources: 'Markdown 中引用的稳定资源列表。',
      target: '可选 Canvas 插入目标。',
      provenance: '可选 Agent 来源信息。',
      intentHint: '内容意图提示。',
      profileHint: 'Canvas profile 提示。',
      tableTitle: '可选表格标题。',
      mode: '可选分镜创建模式。',
      approval: '生产级 apply 变更所需的审批上下文。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_LIST_NODES]: {
    description: '列出当前画布上的节点，可按类型过滤。',
    parameters: {
      type: '可选节点类型过滤条件。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_GET_NODE]: {
    description: '按节点 ID 读取单个 Canvas 节点的完整信息。',
    parameters: {
      nodeId: 'Canvas 节点 ID。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_UPDATE_NODE]: {
    description:
      '更新 Canvas 节点的数据字段。生成图片前先把提示词/参数写回节点，保证会话压缩后仍可恢复。',
    parameters: {
      nodeId: 'Canvas 节点 ID。',
      data: '要合并到 node.data 的部分字段。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_CREATE_NODE]: {
    description: '在当前画布创建一个新节点，并返回新节点 ID。',
    parameters: {
      type: '节点类型。',
      preset: '可选的 Canvas 预设；优先使用可组合预设以获得稳定渲染和预览 metadata。',
      x: '画布 X 坐标。',
      y: '画布 Y 坐标。',
      data: '节点初始数据。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_DERIVE_NODE]: {
    description: '基于已有节点和注册预设派生后继节点，并创建普通 Canvas 连接。',
    parameters: {
      sourceNodeId: '来源 Canvas 节点 ID。',
      targetPreset: '可选目标预设。',
      targetType: '未提供目标预设时使用的目标节点类型。',
      data: '覆盖默认值的可选数据。',
      connect: '是否连接来源和派生节点，默认 true。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_CREATE_COMPOSITE]: {
    description: '按容器策略一次性创建容器和子节点，并执行共享自动布局。',
    parameters: {
      containerPreset: '注册的容器预设。',
      x: '容器 X 坐标。',
      y: '容器 Y 坐标。',
      data: '容器默认数据或覆盖值。',
      children: '子节点规格列表。',
      autoLayout: '是否在容器内自动排列子节点，默认 true。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_UPDATE_BLOCK]: {
    description: '通过 block 绑定或 node.data JSON Pointer 路径更新可组合 Canvas block。',
    parameters: {
      nodeId: 'Canvas 节点 ID。',
      blockId: '带绑定的可组合 block ID。',
      path: 'node.data 内的 JSON Pointer 路径，例如 /content。',
      value: '新值；对象应传入 JSON 文本。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_EXTRACT_STRUCTURED_CONTENT]: {
    description:
      '从 Canvas 节点提取 JSON、Markdown 或 prompt 文本，保留层级边界并忽略运行时预览状态。',
    parameters: {
      nodeIds: '可选显式节点 ID；省略时使用选择或全部节点。',
      format: '提取格式。',
      includeChildren: '是否递归包含容器子节点。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT]: {
    description:
      '读取紧凑的当前 Canvas 上下文，包括选区、子系统摘要、插入点、视口、焦点容器和可编辑字段。',
    parameters: {
      includeSelection: '是否包含选中节点 ID 和紧凑摘要。',
      includeFocusedContainer: '是否包含焦点容器摘要和子节点约束。',
      includeNodeDetails: '是否包含更丰富的节点摘要；大型媒体数据仍会省略。',
      includeSubsystemMetadata:
        '是否包含 narrative、behavior、entity、memory 子系统的有界 metadata 摘要。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES]: {
    description:
      '读取 Canvas authoring 能力目录，包括节点、预设、容器、连接、字段、操作和推荐 recipe。',
    parameters: {
      version: '可选目录版本；当前为 1。',
      sections: '可选目录 section 列表；省略时返回所有支持的 section。',
      includeDetails: '是否包含更详细的描述；当前目录保持有界摘要。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_LIST_CONNECTIONS]: {
    description: '列出当前画布连接，可按类型、来源节点或目标节点过滤。',
    parameters: {
      type: '可选连接类型过滤条件。',
      sourceId: '可选来源节点 ID。',
      targetId: '可选目标节点 ID。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_GET_CONNECTION]: {
    description: '按连接 ID 读取当前画布中的单个连接。',
    parameters: {
      connectionId: 'Canvas 连接 ID。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_CREATE_CONNECTION]: {
    description: '在已有 Canvas 节点之间创建连接，并返回结构化连接引用。',
    parameters: {
      sourceId: '来源 Canvas 节点 ID。',
      targetId: '目标 Canvas 节点 ID。',
      sourceEndpoint: '可选来源 endpoint；nodeId 必须匹配 sourceId。',
      targetEndpoint: '可选目标 endpoint；nodeId 必须匹配 targetId。',
      type: '可选连接类型。',
      label: '可选连接标签。',
      priority: '可选连接优先级。',
      extension: '可选安全扩展数据对象。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_NARRATIVE_TRAVERSE]: {
    description:
      '遍历混合 Canvas 中的 narrative flow 节点；不会遍历 storyboard、behavior、entity 或 memory 节点。',
    parameters: {
      startNodeId: '可选 narrative 起始节点 ID。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_APPLY_AGENT_CONTENT]: {
    description:
      '把 Agent 生成的文本、优化提示词或结构化内容应用到 Canvas 节点、容器、字段路径或视口插入点。',
    parameters: {
      kind: '要应用的内容类型。',
      text: 'kind=text 时的文本内容。',
      prompt: 'kind=prompt 时的提示词内容。',
      contentJson: 'kind=structured 时的 JSON 字符串。',
      title: '可选内容标题。',
      format: '内容格式提示。',
      nodeId: '显式 Canvas 节点目标。',
      containerId: '显式 Canvas 容器目标。',
      slotId: '显式 Canvas 槽位目标。',
      fieldPath: 'node.data 内的 JSON Pointer 路径，例如 /storyboardPrompt。',
      mode: '变更模式；replace/apply 需要显式目标数据。',
      x: '画布插入 X 坐标。',
      y: '画布插入 Y 坐标。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_GET_STORYBOARD_EXECUTION_SUMMARY]: {
    description:
      '读取 Story/Agent 工作流可用的只读场景/镜头执行摘要，包含稳定场景 ID、镜头数、生成状态和时间线导入 metadata。',
    parameters: {
      sourceScriptUri: '可选源剧本 URI，用于关联导入的 Story 场景。',
      sceneId: '可选 Story 场景 ID。',
      sceneNodeId: '可选 Canvas SceneGroup 节点 ID。',
      canvasFileUri: '可选 Canvas 文件 URI，用于跟踪绑定。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_GENERATE_IMAGE]: {
    description:
      '触发 ShotNode 或 Gallery 子媒体节点的图片生成。调用前先用结构化 storyboardPrompt 写回语义提示词和参数。',
    parameters: {
      nodeId: 'ShotNode 或 GalleryNode ID。',
      childNodeId: 'GalleryNode 的子媒体节点 ID。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_GENERATE_BATCH]: {
    description: '批量触发多个镜头节点的图片生成，适合一次生成一个场景内所有镜头。',
    parameters: {
      nodeIds: '要生成图片的 ShotNode ID 列表。',
    },
  },
  [TOOL_NAMES_CANVAS.SET_PROJECT_GENERATION_CONFIG]: {
    description:
      '保存项目级生成参数和模型配置；它们会作为节点默认值。批量生成前应先调用，避免上下文压缩后丢失参数。',
    parameters: {
      imageRatio: '图片画幅比例。',
      imageResolution: '图片分辨率。',
      videoRatio: '视频画幅比例。',
      videoResolution: '视频分辨率。',
      videoDuration: '视频时长，单位秒。',
      videoFps: '视频帧率。',
      imageModel: '图片生成模型 ID。',
      videoModel: '视频生成模型 ID。',
      audioModel: '音频生成模型 ID。',
    },
  },
  [TOOL_NAMES_CANVAS.EXPORT_STORYBOARD]: {
    description: '将分镜导出为 ZIP 图片包，或导入到 neko-cut 时间线。',
    parameters: {
      format: '导出格式：zip 或 neko-cut。',
      projectName: '用于文件名和 manifest 的项目名称。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_APPLY_STYLE_TRANSFER]: {
    description: '使用 GalleryNode 作为风格参考，对目标 ShotNode 应用风格迁移并触发批量图片生成。',
    parameters: {
      targetNodeIds: '要应用风格迁移的 ShotNode 列表。',
      referenceNodeId: '作为 IP-Adapter 风格参考的 GalleryNode ID。',
    },
  },
  [TOOL_NAMES_CANVAS.IMPORT_SCRIPT_TO_CANVAS]: {
    description: '把 Fountain 剧本导入当前 Canvas，生成分镜骨架或语义分镜计划。',
    parameters: {
      path: 'Fountain 剧本文件的绝对路径。',
      mode: '导入模式：mechanical 为启发式骨架，semantic 使用 ScenePlan/ShotPlan。',
      startX: '第一个 SceneGroupNode 的画布 X 坐标。',
      startY: '第一个 SceneGroupNode 的画布 Y 坐标。',
      scenesLimit: '最多导入的场景数量。',
      scenePlans: 'semantic 模式下可选的 ScenePlan/ShotPlan 数组。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_GENERATE_VIDEO_WITH_KEYFRAMES]: {
    description: '使用首帧和尾帧图片作为关键帧，为 ShotNode 生成视频片段。',
    parameters: {
      nodeId: '保存生成视频的目标 ShotNode ID。',
      firstFrameNodeId: '提供首帧图片的 ShotNode ID。',
      lastFrameNodeId: '提供尾帧图片的 ShotNode ID。',
      duration: '视频时长，单位秒。',
      aspectRatio: '画幅比例，例如 16:9 或 9:16。',
    },
  },
} satisfies Readonly<Record<CanvasToolName, CanvasToolLocalization>>;

function withCanvasToolMetadata<T extends Tool>(tool: T): T {
  const localization = CANVAS_TOOL_ZH_LOCALIZATIONS[tool.name as CanvasToolName];
  if (!localization) {
    throw new Error(`Missing zh localization for Canvas tool "${tool.name}".`);
  }
  return {
    ...tool,
    localization: {
      ...tool.localization,
      zh: localization,
    },
    traits: tool.traits ?? readCanvasToolTraits(tool.name as CanvasToolName),
  };
}

function readCanvasToolTraits(toolName: CanvasToolName): CanvasToolTraits {
  if (toolName === TOOL_NAMES_CANVAS.CANVAS_GENERATE_VIDEO_WITH_KEYFRAMES) {
    return { cost: 'expensive', reversible: false, locality: 'network', impactLevel: 'high' };
  }
  if (CANVAS_NETWORK_GENERATION_TOOL_NAMES.has(toolName)) {
    return { cost: 'moderate', reversible: false, locality: 'network', impactLevel: 'high' };
  }
  if (CANVAS_READ_ONLY_TOOL_NAMES.has(toolName)) {
    return { cost: 'free', reversible: true, locality: 'local', impactLevel: 'none' };
  }
  return { cost: 'free', reversible: true, locality: 'local', impactLevel: 'low' };
}

function buildCanvasAuthoringCapabilityCatalog(
  request: CanvasAuthoringCatalogRequest = {},
): CanvasAuthoringCatalog {
  const sections =
    request.sections && request.sections.length > 0
      ? request.sections
      : CANVAS_AUTHORING_CATALOG_SECTIONS;
  const catalog: Partial<CanvasAuthoringCatalog> &
    Pick<CanvasAuthoringCatalog, 'version' | 'sections' | 'diagnostics'> = {
    version: CANVAS_AUTHORING_CATALOG_VERSION,
    sections,
    diagnostics: [],
  };

  if (sections.includes('nodeTypes')) {
    catalog.nodeTypes = CANVAS_AGENT_CREATE_NODE_TYPES.map((type) => ({
      type,
      label: { default: type },
      defaultPreset: getDefaultCanvasNodePresetName(type),
      presets: BUILT_IN_CANVAS_NODE_PRESETS.filter((preset) => preset.nodeType === type).map(
        (preset) => preset.name,
      ),
    }));
  }

  if (sections.includes('presets')) {
    catalog.presets = BUILT_IN_CANVAS_NODE_PRESETS.map((preset) => ({
      id: preset.name,
      nodeType: preset.nodeType,
      label: { default: preset.label },
      ...(preset.description ? { summary: preset.description } : {}),
      ...(preset.containerPolicy ? { containerPolicyId: preset.containerPolicy } : {}),
      traits: preset.composable ? ['composable'] : [],
    }));
  }

  if (sections.includes('containers')) {
    catalog.containers = [
      {
        id: 'scene',
        label: { default: 'Scene container', zhCN: '场景容器' },
        acceptedChildNodeTypes: ['shot', 'media', 'gallery', 'annotation', 'text'],
        acceptedChildPresets: [
          'shot.basic',
          'media.basic',
          'gallery.basic',
          'annotation.basic',
          'text.basic',
        ],
        layoutModes: ['sequence', 'grid'],
      },
      {
        id: 'gallery',
        label: { default: 'Gallery container', zhCN: '图库容器' },
        acceptedChildNodeTypes: ['media'],
        acceptedChildPresets: ['media.basic'],
        layoutModes: ['grid'],
      },
      {
        id: 'group',
        label: { default: 'Group container', zhCN: '分组容器' },
        acceptedChildNodeTypes: [...CANVAS_AGENT_CREATE_NODE_TYPES],
        acceptedChildPresets: [...CANVAS_AGENT_CHILD_PRESETS],
        layoutModes: ['freeform'],
      },
    ];
  }

  if (sections.includes('connections')) {
    catalog.connections = CANVAS_CONNECTION_TYPES.map((type) => ({
      type,
      label: { default: type },
      sourceEndpointScopes: ['node', 'port'],
      targetEndpointScopes: ['node', 'port'],
    }));
  }

  if (sections.includes('targetableFields')) {
    catalog.targetableFields = [
      {
        id: 'node.title',
        namespace: 'canvas.node',
        path: '/title',
        label: { default: 'Title', zhCN: '标题' },
        valueType: 'text',
        roles: ['metadata'],
        storageTarget: 'node-data',
      },
      {
        id: 'shot.imagePrompt',
        namespace: 'canvas.storyboard',
        path: '/storyboardPrompt/promptBlocks/imagePromptDocument/text',
        label: { default: 'Image prompt', zhCN: '图片提示词' },
        valueType: 'prompt',
        roles: ['prompt', 'shot'],
        storageTarget: 'prompt-span',
        aliases: ['imagePrompt', 'image prompt', '图像提示词', '图片提示词'],
        promptSpan: {
          behavior: 'source-of-truth',
          spanKind: 'image-prompt',
          fieldId: 'shot.imagePrompt',
          alignmentState: 'in-sync',
        },
      },
      {
        id: 'scene.videoPrompt',
        namespace: 'canvas.storyboard',
        path: '/storyboardPrompt/promptBlocks/videoPromptDocument/text',
        label: { default: 'Scene video prompt', zhCN: '场景视频提示词' },
        valueType: 'prompt',
        roles: ['prompt', 'scene'],
        storageTarget: 'prompt-span',
        aliases: [
          'videoPrompt',
          'video prompt',
          'scene video prompt',
          '视频提示词',
          '场景视频提示词',
        ],
        promptSpan: {
          behavior: 'source-of-truth',
          spanKind: 'video-prompt',
          fieldId: 'scene.videoPrompt',
          alignmentState: 'in-sync',
        },
      },
      {
        id: 'voice.dialogue',
        namespace: 'audio.voice',
        path: '/storyboardPrompt/promptBlocks/voicePromptDocument/text',
        label: { default: 'Dialogue / voice prompt', zhCN: '对白 / 语音提示词' },
        valueType: 'voice-cue',
        roles: ['voice', 'dialogue', 'prompt'],
        storageTarget: 'prompt-span',
        aliases: ['dialogue', 'voicePrompt', '台词', '对白', '语音'],
        promptSpan: {
          behavior: 'bidirectional',
          spanKind: 'voice-cue',
          fieldId: 'voice.dialogue',
          alignmentState: 'in-sync',
        },
      },
      {
        id: 'generation.duration',
        namespace: 'canvas.storyboard',
        path: '/storyboardPrompt/generationParams/duration',
        label: { default: 'Duration', zhCN: '时长' },
        valueType: 'duration',
        roles: ['shot'],
        storageTarget: 'capability-input',
        aliases: ['duration', '时长'],
        capabilityBinding: {
          capabilityId: 'video.generate',
          inputField: 'duration',
        },
      },
      {
        id: 'referenceMedia.imageRefs',
        namespace: 'canvas.storyboard',
        path: '/storyboardPrompt/referenceMedia/imageRefs',
        label: { default: 'Reference images', zhCN: '参考图片' },
        valueType: 'resource-ref',
        roles: ['media', 'shot'],
        storageTarget: 'node-data',
        aliases: ['source', 'referenceImage', 'reference media', '来源', '参考图'],
      },
      {
        id: 'referenceMedia.videoRefs',
        namespace: 'canvas.storyboard',
        path: '/storyboardPrompt/referenceMedia/videoRefs',
        label: { default: 'Reference videos', zhCN: '参考视频' },
        valueType: 'resource-ref',
        roles: ['media', 'shot'],
        storageTarget: 'node-data',
        aliases: ['video reference', 'videoReference', '参考视频'],
      },
      {
        id: 'referenceMedia.audioRefs',
        namespace: 'canvas.storyboard',
        path: '/storyboardPrompt/referenceMedia/audioRefs',
        label: { default: 'Reference audio', zhCN: '参考音频' },
        valueType: 'resource-ref',
        roles: ['media', 'voice'],
        storageTarget: 'node-data',
        aliases: ['audio reference', 'audioReference', '参考音频'],
      },
      {
        id: 'review.sourcePanel',
        namespace: 'canvas.storyboard.review',
        path: '/reviewMetadata/sourcePanel',
        label: { default: 'Source panel', zhCN: '来源分格' },
        valueType: 'text',
        roles: ['review', 'metadata'],
        storageTarget: 'review-metadata',
        aliases: ['sourcePanel', 'panel', '来源分格', '分格'],
      },
      {
        id: 'review.ocrNotes',
        namespace: 'canvas.storyboard.review',
        path: '/reviewMetadata/ocrNotes',
        label: { default: 'OCR notes', zhCN: 'OCR 备注' },
        valueType: 'text',
        roles: ['review', 'metadata'],
        storageTarget: 'review-metadata',
        aliases: ['ocrNotes', 'ocr notes', 'OCR 备注'],
      },
      {
        id: 'review.decisionReason',
        namespace: 'canvas.storyboard.review',
        path: '/reviewMetadata/decisionReason',
        label: { default: 'Decision reason', zhCN: '决策理由' },
        valueType: 'text',
        roles: ['review', 'metadata'],
        storageTarget: 'review-metadata',
        aliases: ['decisionReason', 'reason', '决策理由'],
      },
      {
        id: 'review.risk',
        namespace: 'canvas.storyboard.review',
        path: '/reviewMetadata/risk',
        label: { default: 'Risk', zhCN: '风险' },
        valueType: 'text',
        roles: ['review', 'metadata'],
        storageTarget: 'review-metadata',
        aliases: ['risk', '风险'],
      },
      {
        id: 'shot.generatedImage',
        namespace: 'canvas.storyboard',
        path: '/generatedImage',
        label: { default: 'Generated image', zhCN: '生成图片' },
        valueType: 'resource-ref',
        roles: ['media', 'execution'],
        storageTarget: 'node-data',
      },
    ];
  }

  if (sections.includes('resourcePolicies')) {
    catalog.resourcePolicies = [
      {
        id: 'durable-canvas-authoring-resource',
        label: { default: 'Durable Canvas authoring resource' },
        stableRefKinds: ['ResourceRef', 'DocumentArchiveResourceRef', 'project-relative-path'],
        rejectedRuntimeKinds: [
          'vscode-webview-uri',
          'blob-url',
          'cache-path',
          'engine-runtime-token',
          'chat-attachment-order',
        ],
      },
    ];
  }

  if (sections.includes('operations')) {
    catalog.operations = buildCanvasAuthoringOperationDescriptors();
  }

  if (sections.includes('recipes')) {
    catalog.recipes = [
      {
        id: 'storyboard.scene-with-shots',
        label: { default: 'Create storyboard scene with shots', zhCN: '创建场景和镜头分镜' },
        summary:
          'Query catalog/context, then create scene.basic with shot.basic children through canvas_create_composite.',
        preferredTools: [
          TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
          TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
          TOOL_NAMES_CANVAS.CANVAS_CREATE_COMPOSITE,
        ],
        requiredQueries: [
          TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
          TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
        ],
        targetHints: ['scene.basic', 'shot.basic'],
      },
      {
        id: 'media.single-asset',
        label: { default: 'Create media node for one asset', zhCN: '为单个素材创建媒体节点' },
        summary:
          'Use media.basic for one stable resource; direct import remains a separate add-source action.',
        preferredTools: [
          TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
          TOOL_NAMES_CANVAS.CANVAS_CREATE_NODE,
        ],
        targetHints: ['media.basic'],
      },
      {
        id: 'markdown.review-ingest',
        label: { default: 'Review and ingest Markdown', zhCN: '审阅并摄入 Markdown' },
        summary:
          'Use Canvas Markdown capabilities for Markdown or GFM table review and apply actions.',
        preferredTools: [
          TOOL_NAMES_CANVAS.CANVAS_VALIDATE_MARKDOWN_STORYBOARD,
          TOOL_NAMES_CANVAS.CANVAS_INGEST_MARKDOWN,
        ],
      },
    ];
  }

  if (sections.includes('fieldProfiles')) {
    const profileValidation = validateCanvasAuthoringFieldProfileDescriptor(
      AI_NATIVE_STORYBOARD_FIELD_PROFILE,
    );
    catalog.fieldProfiles = [AI_NATIVE_STORYBOARD_FIELD_PROFILE];
    catalog.diagnostics = [...catalog.diagnostics, ...profileValidation.diagnostics];
  }

  if (sections.includes('semanticPrompts')) {
    catalog.semanticPrompts = {
      supported: true,
      promptBlockKinds: [...CANVAS_STORYBOARD_PROMPT_BLOCK_KINDS],
      promptContentProfiles: [
        {
          id: 'storyboard.image-prompt.v1',
          blockKind: 'image',
          label: { default: 'Storyboard image prompt', zhCN: '分镜图片提示词' },
          summary:
            'Generation-effective image prompt content for keyframe generation, image editing, cleanup, color, repair, redraw, inpaint, outpaint, and reference preparation.',
          referenceKinds: ['image'],
          parameterIds: ['negativePrompt', 'seed', 'aspectRatio'],
          generationEffectiveParts: [
            {
              id: 'image.intent',
              label: { default: 'Image generation or edit intent', zhCN: '图片生成/编辑意图' },
              required: true,
            },
            {
              id: 'reference.usage',
              label: { default: 'Reference usage', zhCN: '参考图使用方式' },
              mapsToFieldId: 'referenceMedia.imageRefs',
            },
            {
              id: 'scene.context',
              label: { default: 'Scene context', zhCN: '场景上下文' },
              mapsToSpanKind: 'scene',
              mapsToFieldId: 'scene.info',
            },
            {
              id: 'character.appearance',
              label: { default: 'Character appearance', zhCN: '人物形象' },
              mapsToSpanKind: 'character-appearance',
              mapsToFieldId: 'character.appearance',
            },
            {
              id: 'visual.action',
              label: { default: 'Visible action and pose', zhCN: '画面动作和姿态' },
              mapsToSpanKind: 'visual-action',
            },
            {
              id: 'composition.camera',
              label: { default: 'Composition and camera', zhCN: '构图和镜头' },
              mapsToSpanKind: 'camera',
            },
            {
              id: 'style.look',
              label: { default: 'Style, light, color, texture', zhCN: '风格、光线、色彩、质感' },
              mapsToSpanKind: 'style',
            },
            {
              id: 'image.constraints',
              label: { default: 'Constraints and negative requirements', zhCN: '约束和负向要求' },
              mapsToParameterId: 'negativePrompt',
            },
          ],
        },
        {
          id: 'storyboard.video-prompt.v1',
          blockKind: 'video',
          label: { default: 'Scene video prompt', zhCN: '场景视频提示词' },
          summary:
            'Generation-effective scene video prompt content for scene video generation and edit actions.',
          referenceKinds: ['image', 'video', 'audio'],
          parameterIds: [
            'duration',
            'cameraControl',
            'motionStrength',
            'videoReference',
            'audioReference',
          ],
          generationEffectiveParts: [
            {
              id: 'video.intent',
              label: { default: 'Video generation or edit intent', zhCN: '视频生成/编辑意图' },
              required: true,
            },
            {
              id: 'reference.start',
              label: { default: 'Starting reference media', zhCN: '起始参考素材' },
              mapsToFieldId: 'referenceMedia.imageRefs',
            },
            {
              id: 'action.beats',
              label: { default: 'Action beats', zhCN: '动作节拍' },
              mapsToSpanKind: 'visual-action',
            },
            {
              id: 'camera.motion',
              label: { default: 'Camera movement', zhCN: '运镜' },
              mapsToSpanKind: 'camera',
            },
            {
              id: 'duration.rhythm',
              label: { default: 'Duration and rhythm', zhCN: '时长和节奏' },
              mapsToFieldId: 'generation.duration',
              mapsToParameterId: 'duration',
            },
            {
              id: 'continuity.constraints',
              label: { default: 'Continuity constraints', zhCN: '连续性约束' },
            },
            {
              id: 'style.consistency',
              label: { default: 'Style consistency', zhCN: '风格一致性' },
              mapsToSpanKind: 'style',
            },
          ],
        },
        {
          id: 'storyboard.voice-prompt.v1',
          blockKind: 'voice',
          label: { default: 'Storyboard voice prompt', zhCN: '分镜语音提示词' },
          summary:
            'Generation-effective voice prompt content for dialogue, narration, voice over, emotion, delivery, and optional voice references.',
          referenceKinds: ['audio'],
          parameterIds: ['audioReference'],
          generationEffectiveParts: [
            {
              id: 'voice.dialogue',
              label: { default: 'Dialogue text', zhCN: '台词文本' },
              required: true,
              mapsToFieldId: 'voice.dialogue',
            },
            {
              id: 'voice.speaker',
              label: { default: 'Speaker', zhCN: '说话人' },
              mapsToSpanKind: 'character',
            },
            {
              id: 'voice.emotion',
              label: { default: 'Emotion and delivery', zhCN: '情绪和语气' },
              mapsToSpanKind: 'voice-cue',
              mapsToFieldId: 'voice.cue',
            },
            {
              id: 'voice.reference',
              label: { default: 'Voice or audio reference', zhCN: '声线或音频参考' },
              mapsToFieldId: 'referenceMedia.audioRefs',
              mapsToParameterId: 'audioReference',
            },
          ],
        },
      ],
      spanKinds: [
        'scene',
        'character',
        'character-appearance',
        'visual-action',
        'camera',
        'style',
        'voice-cue',
        'resource-ref',
      ],
      alignmentStates: [...CANVAS_AUTHORING_FIELD_PROFILE_ALIGNMENT_STATES],
      referenceMediaRoles: [...STORYBOARD_MEDIA_ROLES],
      referenceMediaKinds: ['image', 'video', 'audio'],
      metadataPolicies: [
        {
          id: 'storyboard.review-metadata',
          label: { default: 'Storyboard review metadata', zhCN: '分镜审阅元数据' },
          fieldIds: [
            'sourcePanel',
            'decision',
            'decisionReason',
            'requiresSplit',
            'duplicateOf',
            'contentType',
            'ocrNotes',
            'risk',
          ],
          defaultStorageTarget: 'review-metadata',
          generationEffect: 'suggestion-only',
          summary:
            'Markdown extension fields and Skill custom fields preserve evidence, notes, risk, and diagnostics. They do not affect generation until promoted.',
        },
        {
          id: 'storyboard.custom-metadata',
          label: { default: 'Unregistered Skill fields', zhCN: '未注册 Skill 字段' },
          fieldIds: ['*'],
          defaultStorageTarget: 'custom-metadata',
          generationEffect: 'none',
          summary:
            'Unknown Skill-declared fields are preserved as custom metadata and are not Canvas production fields unless a Canvas field profile accepts them.',
        },
      ],
      promotionRules: [
        {
          id: 'metadata-to-prompt-span',
          from: 'review-metadata',
          to: 'semantic-prompt-span',
          requiresConfirmation: true,
          summary:
            'Review metadata may affect generation only after Agent or user explicitly promotes it into a prompt span.',
        },
        {
          id: 'skill-field-to-prompt-content',
          from: 'skill-field',
          to: 'semantic-prompt-span',
          requiresConfirmation: true,
          summary:
            'Skill-declared generation-effective fields must be merged into image/video/voice prompt content or registered in Canvas field profiles.',
        },
        {
          id: 'metadata-to-action-parameter',
          from: 'review-metadata',
          to: 'generation-parameter',
          requiresConfirmation: true,
          summary:
            'Metadata such as duration, split intent, or negative constraints must be converted into supported action parameters before execution.',
        },
      ],
      advancedParameterIds: [...CANVAS_STORYBOARD_ADVANCED_PARAMETER_IDS],
      nextCreativeStateIds: [
        'missing-reference',
        'needs-reference-processing',
        'image-prompt-ready',
        'image-prompt-skipped',
        'missing-video-prompt',
        'ready-to-generate-video',
        'needs-result-review',
        'prompt-conflict',
        'waiting-confirmation',
        'failed-retry',
        'accepted',
      ],
      nextCreativeStateTargets: [...CANVAS_STORYBOARD_NEXT_CREATIVE_STATE_TARGETS],
      actionIntentIds: [...CANVAS_STORYBOARD_ACTION_INTENT_IDS],
      primaryStoryboardColumns: [
        'shot',
        'reference-media',
        'image-prompt',
        'video-prompt',
        'duration',
        'dialogue',
        'state',
        'action',
      ],
      progressOwner: 'agent',
      commands: [
        'keep-prompt',
        'regenerate-prompt',
        'merge-fields-into-prompt',
        'apply-field-suggestion',
      ],
    };
  }

  return catalog as CanvasAuthoringCatalog;
}

function buildCanvasAuthoringOperationDescriptors(): readonly CanvasAuthoringOperationDescriptor[] {
  return [
    {
      id: 'describe-authoring-capabilities',
      kind: 'query',
      risk: 'read-only',
      status: 'available',
      toolName: TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
      label: { default: 'Describe Canvas authoring capabilities' },
      summary: 'Read versioned Canvas-owned node, preset, field, operation, and recipe summaries.',
    },
    {
      id: 'get-active-context',
      kind: 'query',
      risk: 'read-only',
      status: 'available',
      toolName: TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
      label: { default: 'Get active Canvas context' },
      summary: 'Read bounded active editor context before choosing mutation targets.',
    },
    {
      id: 'create-node',
      kind: 'mutation',
      risk: 'medium',
      status: 'available',
      toolName: TOOL_NAMES_CANVAS.CANVAS_CREATE_NODE,
      label: { default: 'Create Canvas node' },
      requiresConfirmation: true,
      preferredQueryTools: [
        TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
        TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
      ],
      targetRequirements: ['type-or-preset', 'position-or-active-context'],
    },
    {
      id: 'update-node',
      kind: 'mutation',
      risk: 'medium',
      status: 'available',
      toolName: TOOL_NAMES_CANVAS.CANVAS_UPDATE_NODE,
      label: { default: 'Update Canvas node' },
      requiresConfirmation: true,
      preferredQueryTools: [
        TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
        TOOL_NAMES_CANVAS.CANVAS_GET_NODE,
      ],
      targetRequirements: ['nodeId', 'data'],
    },
    {
      id: 'derive-node',
      kind: 'mutation',
      risk: 'medium',
      status: 'available',
      toolName: TOOL_NAMES_CANVAS.CANVAS_DERIVE_NODE,
      label: { default: 'Derive Canvas node' },
      requiresConfirmation: true,
      preferredQueryTools: [
        TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
        TOOL_NAMES_CANVAS.CANVAS_GET_NODE,
      ],
      targetRequirements: ['sourceNodeId'],
    },
    {
      id: 'create-composite',
      kind: 'mutation',
      risk: 'medium',
      status: 'available',
      toolName: TOOL_NAMES_CANVAS.CANVAS_CREATE_COMPOSITE,
      label: { default: 'Create Canvas composite' },
      requiresConfirmation: true,
      preferredQueryTools: [
        TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
        TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
      ],
      targetRequirements: ['containerPreset', 'children'],
    },
    {
      id: 'list-connections',
      kind: 'query',
      risk: 'read-only',
      status: 'available',
      toolName: TOOL_NAMES_CANVAS.CANVAS_LIST_CONNECTIONS,
      label: { default: 'List Canvas connections' },
      summary: 'Read bounded active Canvas connections by type, source, or target.',
      preferredQueryTools: [TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT],
    },
    {
      id: 'get-connection',
      kind: 'query',
      risk: 'read-only',
      status: 'available',
      toolName: TOOL_NAMES_CANVAS.CANVAS_GET_CONNECTION,
      label: { default: 'Get Canvas connection' },
      summary: 'Read one active Canvas connection by stable connection id.',
      targetRequirements: ['connectionId'],
      preferredQueryTools: [TOOL_NAMES_CANVAS.CANVAS_LIST_CONNECTIONS],
    },
    {
      id: 'create-connection',
      kind: 'mutation',
      risk: 'medium',
      status: 'available',
      toolName: TOOL_NAMES_CANVAS.CANVAS_CREATE_CONNECTION,
      label: { default: 'Create Canvas connection' },
      requiresConfirmation: true,
      preferredQueryTools: [
        TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
        TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
      ],
      targetRequirements: ['sourceId', 'targetId'],
    },
    {
      id: 'update-block',
      kind: 'mutation',
      risk: 'medium',
      status: 'available',
      toolName: TOOL_NAMES_CANVAS.CANVAS_UPDATE_BLOCK,
      label: { default: 'Update Canvas block' },
      requiresConfirmation: true,
      preferredQueryTools: [
        TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
        TOOL_NAMES_CANVAS.CANVAS_GET_NODE,
      ],
      targetRequirements: ['nodeId', 'blockId-or-path'],
    },
    {
      id: 'apply-agent-content',
      kind: 'mutation',
      risk: 'medium',
      status: 'available',
      toolName: TOOL_NAMES_CANVAS.CANVAS_APPLY_AGENT_CONTENT,
      label: { default: 'Apply Agent content' },
      requiresConfirmation: true,
      preferredQueryTools: [
        TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
        TOOL_NAMES_CANVAS.CANVAS_GET_NODE,
      ],
      targetRequirements: ['content-kind', 'target-or-insertion-point'],
    },
    {
      id: 'ingest-markdown',
      kind: 'mutation',
      risk: 'medium',
      status: 'available',
      toolName: TOOL_NAMES_CANVAS.CANVAS_INGEST_MARKDOWN,
      label: { default: 'Ingest Markdown' },
      requiresConfirmation: true,
      preferredQueryTools: [TOOL_NAMES_CANVAS.CANVAS_VALIDATE_MARKDOWN_STORYBOARD],
      targetRequirements: ['markdown'],
    },
    {
      id: 'delete-node',
      kind: 'mutation',
      risk: 'high',
      status: 'unavailable',
      label: { default: 'Delete Canvas node' },
      requiresConfirmation: true,
      unavailableReason:
        'Not advertised until confirmation, undo/history, affected-ref feedback, and diagnostics are covered.',
      targetRequirements: ['nodeId'],
    },
    {
      id: 'update-connection',
      kind: 'mutation',
      risk: 'high',
      status: 'unavailable',
      label: { default: 'Update Canvas connection' },
      requiresConfirmation: true,
      unavailableReason:
        'Not advertised until connection update validation, undo/history, and affected-ref feedback are covered.',
      targetRequirements: ['connectionId'],
    },
    {
      id: 'delete-connection',
      kind: 'mutation',
      risk: 'high',
      status: 'unavailable',
      label: { default: 'Delete Canvas connection' },
      requiresConfirmation: true,
      unavailableReason:
        'Not advertised until confirmation, undo/history, and affected-ref feedback are covered.',
      targetRequirements: ['connectionId'],
    },
  ];
}

const AI_NATIVE_STORYBOARD_FIELD_PROFILE: CanvasAuthoringFieldProfileDescriptor = {
  id: 'storyboard.ai-native',
  namespace: 'canvas.storyboard',
  version: 1,
  aliases: ['storyboard', 'markdown-storyboard', '分镜'],
  label: { default: 'AI-native storyboard', zhCN: 'AI 原生分镜' },
  unknownFieldPolicy: 'preserve-custom',
  fields: [
    {
      id: 'shot.imagePrompt',
      namespace: 'canvas.storyboard',
      aliases: ['imagePrompt', 'image prompt', '图像提示词', '图片提示词'],
      label: { default: 'Image prompt', zhCN: '图片提示词' },
      valueType: 'prompt',
      roles: ['prompt', 'shot'],
      cardinality: 'optional',
      storageTarget: 'prompt-span',
      path: '/storyboardPrompt/promptBlocks/imagePromptDocument/text',
      promptSpan: {
        behavior: 'source-of-truth',
        spanKind: 'image-prompt',
        alignmentState: 'in-sync',
      },
    },
    {
      id: 'scene.videoPrompt',
      namespace: 'canvas.storyboard',
      aliases: [
        'videoPrompt',
        'video prompt',
        'scene video prompt',
        '视频提示词',
        '场景视频提示词',
      ],
      label: { default: 'Scene video prompt', zhCN: '场景视频提示词' },
      valueType: 'prompt',
      roles: ['prompt', 'scene'],
      cardinality: 'optional',
      storageTarget: 'prompt-span',
      path: '/storyboardPrompt/promptBlocks/videoPromptDocument/text',
      promptSpan: {
        behavior: 'source-of-truth',
        spanKind: 'video-prompt',
        alignmentState: 'in-sync',
      },
    },
    {
      id: 'referenceMedia.imageRefs',
      namespace: 'canvas.storyboard',
      aliases: ['source', 'referenceImage', 'reference media', '来源', '参考图'],
      label: { default: 'Reference images', zhCN: '参考图片' },
      valueType: 'resource-ref',
      roles: ['media', 'shot'],
      cardinality: 'repeated',
      storageTarget: 'node-data',
      path: '/storyboardPrompt/referenceMedia/imageRefs',
    },
    {
      id: 'referenceMedia.videoRefs',
      namespace: 'canvas.storyboard',
      aliases: ['videoReference', 'video reference', '参考视频'],
      label: { default: 'Reference videos', zhCN: '参考视频' },
      valueType: 'resource-ref',
      roles: ['media', 'shot'],
      cardinality: 'repeated',
      storageTarget: 'node-data',
      path: '/storyboardPrompt/referenceMedia/videoRefs',
    },
    {
      id: 'referenceMedia.audioRefs',
      namespace: 'canvas.storyboard',
      aliases: ['audioReference', 'audio reference', '参考音频'],
      label: { default: 'Reference audio', zhCN: '参考音频' },
      valueType: 'resource-ref',
      roles: ['media', 'voice'],
      cardinality: 'repeated',
      storageTarget: 'node-data',
      path: '/storyboardPrompt/referenceMedia/audioRefs',
    },
    {
      id: 'generation.duration',
      namespace: 'canvas.storyboard',
      aliases: ['duration', '时长'],
      label: { default: 'Duration', zhCN: '时长' },
      valueType: 'duration',
      roles: ['shot'],
      cardinality: 'optional',
      storageTarget: 'capability-input',
      path: '/storyboardPrompt/generationParams/duration',
      capabilityBinding: {
        capabilityId: 'video.generate',
        inputField: 'duration',
      },
    },
    {
      id: 'voice.dialogue',
      namespace: 'audio.voice',
      aliases: ['dialogue', 'voicePrompt', '台词', '对白', '语音'],
      label: { default: 'Dialogue / voice prompt', zhCN: '对白 / 语音提示词' },
      valueType: 'voice-cue',
      roles: ['voice', 'dialogue', 'prompt'],
      cardinality: 'optional',
      storageTarget: 'prompt-span',
      path: '/storyboardPrompt/promptBlocks/voicePromptDocument/text',
      promptSpan: {
        behavior: 'bidirectional',
        spanKind: 'voice-cue',
        alignmentState: 'in-sync',
      },
    },
    {
      id: 'scene.info',
      namespace: 'canvas.storyboard',
      aliases: ['scene', '场景', '场景信息'],
      label: { default: 'Scene information', zhCN: '场景信息' },
      valueType: 'text',
      roles: ['scene', 'metadata'],
      cardinality: 'optional',
      storageTarget: 'prompt-span',
      promptSpan: {
        behavior: 'bidirectional',
        spanKind: 'scene',
        alignmentState: 'in-sync',
      },
    },
    {
      id: 'character.appearance',
      namespace: 'entity.character',
      aliases: ['character appearance', '人物形象', '角色外观'],
      label: { default: 'Character appearance', zhCN: '人物形象' },
      valueType: 'character-appearance',
      roles: ['character-appearance'],
      cardinality: 'optional',
      storageTarget: 'prompt-span',
      promptSpan: {
        behavior: 'bidirectional',
        spanKind: 'character-appearance',
        alignmentState: 'in-sync',
      },
      capabilityBinding: {
        capabilityId: 'entity.bindCharacterAppearance',
        stableRefRequired: true,
      },
    },
    {
      id: 'voice.cue',
      namespace: 'audio.voice',
      aliases: ['voice', 'voice cue', '语音'],
      label: { default: 'Voice cue', zhCN: '语音' },
      valueType: 'voice-cue',
      roles: ['voice'],
      cardinality: 'optional',
      storageTarget: 'capability-input',
      promptSpan: {
        behavior: 'field-projection',
        spanKind: 'voice-cue',
        alignmentState: 'fields-changed',
      },
      capabilityBinding: {
        capabilityId: 'audio.tts.generate',
        operationId: 'voice.generate',
        requiresApproval: true,
        stableRefRequired: true,
      },
    },
    {
      id: 'review.sourcePanel',
      namespace: 'canvas.storyboard.review',
      aliases: ['sourcePanel', 'panel', '来源分格', '分格'],
      label: { default: 'Source panel', zhCN: '来源分格' },
      valueType: 'text',
      roles: ['review', 'metadata'],
      cardinality: 'optional',
      storageTarget: 'review-metadata',
      path: '/reviewMetadata/sourcePanel',
    },
    {
      id: 'review.ocrNotes',
      namespace: 'canvas.storyboard.review',
      aliases: ['ocrNotes', 'ocr notes', 'OCR 备注'],
      label: { default: 'OCR notes', zhCN: 'OCR 备注' },
      valueType: 'text',
      roles: ['review', 'metadata'],
      cardinality: 'optional',
      storageTarget: 'review-metadata',
      path: '/reviewMetadata/ocrNotes',
    },
    {
      id: 'review.decisionReason',
      namespace: 'canvas.storyboard.review',
      aliases: ['decisionReason', 'reason', '决策理由'],
      label: { default: 'Decision reason', zhCN: '决策理由' },
      valueType: 'text',
      roles: ['review', 'metadata'],
      cardinality: 'optional',
      storageTarget: 'review-metadata',
      path: '/reviewMetadata/decisionReason',
    },
    {
      id: 'review.risk',
      namespace: 'canvas.storyboard.review',
      aliases: ['risk', '风险'],
      label: { default: 'Risk', zhCN: '风险' },
      valueType: 'text',
      roles: ['review', 'metadata'],
      cardinality: 'optional',
      storageTarget: 'review-metadata',
      path: '/reviewMetadata/risk',
    },
  ],
};

class NekoCanvasCapabilityProviderImpl implements NekoCanvasCapabilityProvider {
  readonly id = 'neko-canvas';
  readonly version = '1.0.0';
  private _runtimeContext?: CanvasCreativeAiRuntimeContext;

  constructor(private readonly _api: NekoCanvasAPI) {}

  async executeCanvasCreativeAiInvocation(
    invocation: ExternalCreativeAiInvocation,
  ): Promise<CanvasCreativeAiHostInvocationResult> {
    if (!this._runtimeContext) {
      return {
        ok: false,
        diagnostics: [
          createCreativeAiDiagnostic(
            'error',
            'canvas-creative-ai-runtime-unavailable',
            'Canvas creative AI requires registered product purpose ports.',
            'capabilityContext',
          ),
        ],
      };
    }
    const runId = `canvas-run:${invocation.invocationId}`;
    const result = await executeCanvasCreativeAi(
      {
        invocation,
        conversationId:
          invocation.routing?.requestedConversationId ??
          `canvas:${invocation.documentRef?.documentId ?? invocation.sourceRef.id}`,
        runId,
        workItemId: `${runId}:work`,
      },
      this._runtimeContext,
    );
    return result.status === 'completed'
      ? { ok: true, status: 'completed', diagnostics: result.diagnostics ?? [] }
      : { ok: false, diagnostics: result.diagnostics };
  }

  getArtifactFacets(_context: AgentCapabilityContext): AgentArtifactFacetsContribution {
    return {
      renderers: [
        {
          id: 'renderer:neko-canvas:generic-artifact-preview',
          accepts: ['CompositeArtifact', 'GenericTable', 'StoryboardTable'],
          profiles: [
            MEDIA_PRODUCTION_SHOT_IMAGE_PREP_PROFILE_ID,
            MEDIA_PRODUCTION_SHOT_IMAGE_PREP_REVIEW_PROFILE_ID,
            MEDIA_PRODUCTION_ANIMATION_PLAN_PROFILE_ID,
            STORYBOARD_FROM_COMIC_SOURCE_PROFILE_ID,
          ],
          lazy: true,
        },
      ],
      projectors: [
        {
          id: 'projector:canvas-playback-route-card',
          accepts: ['CanvasPlaybackPlan'],
          produces: ['CompositeArtifact'],
          profiles: ['canvas-playback-route'],
          lazy: true,
        },
      ],
      capabilities: [
        {
          capabilityId: 'canvas.authoring',
          packageId: 'neko-canvas',
          accepts: ['CanvasAuthoringIntent', 'Markdown', 'ResourceRef', 'Prompt'],
          produces: ['CanvasAuthoringResultEnvelope', 'canvas-node-ref'],
          actions: [
            TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
            TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
            TOOL_NAMES_CANVAS.CANVAS_LIST_NODES,
            TOOL_NAMES_CANVAS.CANVAS_GET_NODE,
            TOOL_NAMES_CANVAS.CANVAS_CREATE_NODE,
            TOOL_NAMES_CANVAS.CANVAS_CREATE_COMPOSITE,
            TOOL_NAMES_CANVAS.CANVAS_UPDATE_BLOCK,
            TOOL_NAMES_CANVAS.CANVAS_APPLY_AGENT_CONTENT,
            TOOL_NAMES_CANVAS.CANVAS_INGEST_MARKDOWN,
            TOOL_NAMES_CANVAS.CANVAS_ATTACH_RESOURCE,
          ],
          risk: 'medium',
          requiresApproval: true,
        },
        {
          capabilityId: 'canvas.getPlaybackPlan',
          packageId: 'neko-canvas',
          accepts: ['CanvasDocumentRef'],
          produces: ['CanvasPlaybackPlan'],
          actions: ['canvas.getPlaybackPlan', 'canvas.getPlaybackRoutes'],
          risk: 'low',
          requiresApproval: false,
        },
        {
          capabilityId: 'canvas.revealPlaybackWorkspace',
          packageId: 'neko-canvas',
          accepts: ['CanvasPlaybackPlan', 'CanvasPlaybackRoute'],
          actions: ['canvas.revealPlaybackWorkspace'],
          risk: 'low',
          requiresApproval: false,
        },
        {
          capabilityId: 'canvas.createCutDraftFromRoute',
          packageId: 'neko-canvas',
          accepts: ['CanvasPlaybackRoute'],
          produces: ['CanvasCutDraftPayload'],
          actions: ['canvas.createCutDraftFromRoute'],
          risk: 'medium',
          requiresApproval: true,
        },
        {
          capabilityId: 'canvas.reorderPlaybackUnits',
          packageId: 'neko-canvas',
          accepts: ['CanvasPlaybackRoute'],
          produces: ['CanvasPlaybackPlan'],
          actions: ['canvas.reorderPlaybackUnits'],
          risk: 'medium',
          requiresApproval: true,
        },
        {
          capabilityId: 'canvas.ingestMarkdown',
          packageId: 'neko-canvas',
          accepts: ['Markdown', 'GfmTable'],
          produces: ['canvas-node-ref'],
          actions: ['canvas.ingestMarkdown'],
          risk: 'medium',
          requiresApproval: true,
        },
        {
          capabilityId: 'canvas.createMarkdownNote',
          packageId: 'neko-canvas',
          accepts: ['Markdown'],
          produces: ['canvas-node-ref'],
          actions: ['canvas.createMarkdownNote'],
          risk: 'medium',
          requiresApproval: true,
        },
        {
          capabilityId: 'canvas.createTableFromMarkdown',
          packageId: 'neko-canvas',
          accepts: ['MarkdownTable', 'GfmTable'],
          produces: ['canvas-node-ref'],
          actions: ['canvas.createTableFromMarkdown'],
          risk: 'medium',
          requiresApproval: true,
        },
        {
          capabilityId: 'canvas.createStoryboardFromMarkdown',
          packageId: 'neko-canvas',
          accepts: ['GfmCreativeTable', 'SemanticStoryboardProjection'],
          produces: ['canvas-node-ref'],
          actions: ['canvas.createStoryboardFromMarkdown'],
          risk: 'medium',
          requiresApproval: true,
        },
        {
          capabilityId: 'canvas.attachResource',
          packageId: 'neko-canvas',
          accepts: ['ResourceRef', 'DocumentArchiveResourceRef'],
          produces: ['canvas-node-ref'],
          actions: ['canvas.attachResource'],
          risk: 'medium',
          requiresApproval: true,
        },
        {
          capabilityId: 'canvas.validateMarkdownStoryboard',
          packageId: 'neko-canvas',
          accepts: ['GfmCreativeTable', 'SemanticStoryboardProjection'],
          produces: ['CanvasMarkdownCapabilityDiagnostics'],
          actions: ['canvas.validateMarkdownStoryboard'],
          risk: 'low',
          requiresApproval: false,
        },
      ],
      lifecycleCapabilities: CANVAS_MARKDOWN_LIFECYCLE_DESCRIPTORS,
    };
  }

  getPromptFragments(_context: AgentCapabilityContext): PromptFragment[] {
    return [
      {
        id: 'neko-canvas:authoring-operation-routing',
        priority: 72,
        content: [
          '## Canvas Authoring Operation Routing',
          '',
          '- Call canvas_describe_authoring_capabilities when you need supported node types, presets, containers, connections, fields, operations, recipes, or prompt support.',
          '- Call canvas_get_active_context before choosing insertion points, selected nodes, focused containers, or targetable fields.',
          '- For relationships between nodes, query canvas_list_connections or canvas_get_connection before canvas_create_connection.',
          '- Unspecified Storyboard exploration, planning, analysis, alternatives, and first drafts are ordinary Markdown document content. Do not call structured Storyboard/table creation for them.',
          '- Only explicit professional structured intent may pass an already-canonical Storyboard unchanged to canvas.createStoryboardFromMarkdown with mode=create-nodes and explicit approval; do not flatten it to assets or reconstruct it from Markdown.',
          '- canvas.createStoryboardFromMarkdown creates or mutates a .nkc target through the headless authoring service and does not require an already open Canvas Webview.',
          '- Flexible Storyboard Markdown does not require fixed columns or production completeness. Keep unresolved choices in the document instead of routing to a specialized table fallback.',
          '- If canvas.createStoryboardFromMarkdown is listed in the catalog but not exposed as a callable tool, stop and report Canvas tool-surface blocked. Do not call canvas.ingestMarkdown as a substitute.',
          '- If canvas.createStoryboardFromMarkdown is blocked, report diagnostics and repair the table, approval, target, or resource refs before retrying.',
          `- ${CANVAS_MARKDOWN_RESOURCE_CONTRACT_DESCRIPTION}`,
        ].join('\n'),
        locales: {
          zh: {
            content: [
              '## Canvas Authoring Operation Routing',
              '',
              '- 需要节点类型、预设、容器、连接、字段、操作、recipe 或 prompt 支持时，先调用 canvas_describe_authoring_capabilities。',
              '- 选择插入点、选中节点、焦点容器或目标字段前，先调用 canvas_get_active_context。',
              '- 节点关系变更前先查询 canvas_list_connections 或 canvas_get_connection，再调用 canvas_create_connection。',
              '- 未指定结构化创作的分镜探索、规划、分析、方案和初稿都是普通 Markdown 文档内容；不得调用结构化 Storyboard/table 创建。',
              '- 只有明确的专业结构化意图，才可以把已经 canonical 的 Storyboard 原样通过 canonicalStoryboard 传给 canvas.createStoryboardFromMarkdown，并传入 mode=create-nodes 和显式审批；不得压平为素材或从 Markdown 重建。',
              '- canvas.createStoryboardFromMarkdown 通过无 UI authoring service 创建或修改 .nkc target，不要求 Canvas Webview 已打开。',
              '- 灵活 Storyboard Markdown 不要求固定列或制作字段完备；未决选择保留在文档中，不得路由到专用表格 fallback。',
              '- 如果 catalog 中有 canvas.createStoryboardFromMarkdown 但没有作为可调用工具暴露，停止并报告 Canvas tool-surface blocked。不要用 canvas.ingestMarkdown 替代。',
              '- 如果 canvas.createStoryboardFromMarkdown 被阻塞，报告 diagnostics，并修复表格、approval、target 或 resource refs 后再重试。',
              '- 资源包装对象必须保持字段契约：统一 ResourceRef 使用 resourceRef；document-entry DocumentArchiveResourceRef 使用 documentResourceRef。',
            ].join('\n'),
          },
        },
      },
      {
        id: 'neko-canvas:multi-purpose-canvas-subsystems',
        priority: 70,
        content: [
          'Neko Canvas .nkc files can mix storyboard, narrative, behavior, entity, and memory subsystems in one graph.',
          'Use canvas_get_active_context({ includeSubsystemMetadata: true }) before subsystem-aware edits; inspect activeSubsystems and subsystem metadata before choosing tools or mutations.',
          'Narrative traversal applies only to narrative nodes and choice connections. It ignores storyboard, behavior, entity, and memory nodes by design.',
          'Projected Canvas documents are adapter-backed views. Do not assume direct .nkc edits write to the source document; route source write-back through projection adapters.',
        ].join('\n'),
        locales: {
          zh: {
            content: [
              'Neko Canvas .nkc 文件可在同一图中混合分镜、叙事、行为、实体和记忆子系统。',
              '进行子系统感知编辑前，先调用 canvas_get_active_context({ includeSubsystemMetadata: true })；选择工具或变更前检查 activeSubsystems 和子系统元数据。',
              '叙事遍历只适用于 narrative 节点和 choice 连接。按设计会忽略 storyboard、behavior、entity 和 memory 节点。',
              '投影 Canvas 文档是 adapter 支持的视图。不要假设直接编辑 .nkc 会写回源文档；源写回应通过 projection adapter 路由。',
            ].join('\n'),
          },
        },
      },
    ];
  }

  getTools(context: AgentCapabilityContext): Tool[] {
    this._runtimeContext = {
      purposeMediaService: context.purposeMediaService,
      purposeTextRuntime: context.purposeTextRuntime,
    };
    const api = this._api;
    const logger = getRootLogger();
    const configManager = context.configManager;
    const mediaService = context.mediaService;

    const tools: Tool[] = [
      ...CANVAS_MARKDOWN_TOOL_DEFINITIONS.map((definition) =>
        createMarkdownCapabilityTool(api, definition),
      ),
      {
        name: TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
        description:
          'Read the versioned Canvas-owned authoring capability catalog: node types, presets, container policies, connection rules, targetable fields, operations, recipes, and prompt support.',
        category: 'project',
        isReadOnly: true,
        isConcurrencySafe: true,
        safetyKind: 'read-only-query',
        parameters: {
          type: 'object',
          properties: {
            version: {
              type: 'number',
              enum: [CANVAS_AUTHORING_CATALOG_VERSION],
              description: 'Optional catalog schema version. Current version is 1.',
            },
            sections: {
              type: 'array',
              items: {
                type: 'string',
                enum: [...CANVAS_AUTHORING_CATALOG_SECTIONS],
              },
              description:
                'Optional catalog sections to return. Omit to return every supported bounded section.',
            },
            includeDetails: {
              type: 'boolean',
              description:
                'Request more detailed descriptors when available. The catalog remains bounded.',
            },
          },
        } satisfies ToolParameters,
        async execute(args) {
          const request = {
            ...(args.version !== undefined ? { version: args.version } : {}),
            ...(args.sections !== undefined ? { sections: args.sections } : {}),
            ...(args.includeDetails !== undefined ? { includeDetails: args.includeDetails } : {}),
          };
          const validation = validateCanvasAuthoringCatalogRequest(request);
          if (!validation.valid) {
            return {
              success: false,
              error: 'Invalid Canvas authoring capability catalog request.',
              data: {
                version: CANVAS_AUTHORING_CATALOG_VERSION,
                sections: [],
                diagnostics: validation.diagnostics,
              },
            };
          }
          const sections = Array.isArray(args.sections)
            ? args.sections.filter(isCanvasAuthoringCatalogSection)
            : undefined;
          return {
            success: true,
            data: buildCanvasAuthoringCapabilityCatalog({
              ...(sections ? { sections } : {}),
              includeDetails: args.includeDetails === true,
            }),
          };
        },
      },
      // -----------------------------------------------------------------------
      // Canvas playback route tools
      // -----------------------------------------------------------------------
      {
        name: TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_PLAN,
        description:
          'Read the active CanvasPlaybackPlan projection. This displays Canvas order only; Agent must not persist route order, playhead, or media playback state.',
        category: 'project',
        isReadOnly: true,
        isConcurrencySafe: true,
        safetyKind: 'read-only-query',
        parameters: {
          type: 'object',
          properties: {
            sourceCanvasUri: {
              type: 'string',
              description: 'Optional Canvas document URI. Omit for the active Canvas.',
            },
          },
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const data = await api.playback.getPlan(readOptionalString(args.sourceCanvasUri));
            return { success: true, data };
          } catch (err) {
            return { success: false, error: `Failed to get Canvas playback plan: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_ROUTES,
        description:
          'Read effective Canvas playback route candidates derived from CanvasPlaybackPlan. Does not create an Agent-owned timeline.',
        category: 'project',
        isReadOnly: true,
        isConcurrencySafe: true,
        safetyKind: 'read-only-query',
        parameters: {
          type: 'object',
          properties: {
            sourceCanvasUri: {
              type: 'string',
              description: 'Optional Canvas document URI. Omit for the active Canvas.',
            },
          },
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const data = await api.playback.getRoutes(readOptionalString(args.sourceCanvasUri));
            return { success: true, data };
          } catch (err) {
            return {
              success: false,
              error: `Failed to get Canvas playback routes: ${String(err)}`,
            };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_REVEAL_PLAYBACK_WORKSPACE,
        description:
          'Reveal the same-Webview Canvas PlaybackWorkspace for route playback. Agent dispatches; Canvas owns playback UI and playhead.',
        category: 'project',
        isReadOnly: true,
        safetyKind: 'read-only-query',
        parameters: {
          type: 'object',
          properties: {
            sourceCanvasUri: { type: 'string', description: 'Optional Canvas document URI.' },
            routeId: { type: 'string', description: 'Optional playback route id to focus.' },
            unitId: { type: 'string', description: 'Optional playback unit id to jump to.' },
          },
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const data = await api.playback.revealWorkspace({
              sourceCanvasUri: readOptionalString(args.sourceCanvasUri),
              routeId: readOptionalString(args.routeId),
              unitId: readOptionalString(args.unitId),
            });
            return { success: data, data: { revealed: data } };
          } catch (err) {
            return {
              success: false,
              error: `Failed to reveal Canvas playback workspace: ${String(err)}`,
            };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_CREATE_CUT_DRAFT_FROM_ROUTE,
        description:
          'Project a Canvas playback route to a CanvasCutDraftPayload and optionally hand it to Cut. Requires confirmation before creating/updating Cut state.',
        category: 'project',
        requiresConfirmation: true,
        safetyKind: 'confirmation-gated',
        targetRequirements: {
          required: ['routeId'],
          allowedFallbacks: ['selection', 'explicit-user-input'],
          confirmationModes: ['create-cut-draft', 'send-to-cut'],
        },
        queryBeforeMutate: {
          preferredQueryTools: [
            TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_PLAN,
            TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_ROUTES,
          ],
          reason:
            'Show route title, unit count, diagnostics, target project, and import risk before creating a Cut draft.',
        },
        parameters: {
          type: 'object',
          properties: {
            sourceCanvasUri: { type: 'string', description: 'Optional Canvas document URI.' },
            routeId: { type: 'string', description: 'Playback route id to project.' },
            projectName: { type: 'string', description: 'Optional target Cut project name.' },
            cutProjectUri: {
              type: 'string',
              description: 'Explicit existing .nkv file URI used when sendToCut is true.',
            },
            cutProjectRevision: {
              type: 'string',
              description: 'Expected Cut project revision captured before authoring.',
            },
            sendToCut: {
              type: 'boolean',
              description:
                'When true, dispatch the created draft to the explicitly identified Cut project after confirmation.',
            },
          },
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const draft = await api.playback.createCutDraftFromRoute({
              sourceCanvasUri: readOptionalString(args.sourceCanvasUri),
              routeId: readOptionalString(args.routeId),
              projectName: readOptionalString(args.projectName),
            });
            let cutImportResult: unknown;
            if (args.sendToCut === true) {
              const cutProjectUri = readOptionalString(args.cutProjectUri);
              const cutProjectRevision = readOptionalString(args.cutProjectRevision);
              if (!cutProjectUri || !cutProjectRevision) {
                return {
                  success: false,
                  error: 'sendToCut requires cutProjectUri and cutProjectRevision.',
                };
              }
              cutImportResult = await vscode.commands.executeCommand(
                'neko.cut.authoring.importCanvasDraft',
                {
                  payload: draft,
                  target: { kind: 'file', documentUri: cutProjectUri },
                  expectedProjectRevision: cutProjectRevision,
                },
              );
            }
            return {
              success: true,
              data: {
                draft,
                sentToCut: args.sendToCut === true,
                ...(args.sendToCut === true ? { cutImportResult } : {}),
              },
            };
          } catch (err) {
            return { success: false, error: `Failed to create Canvas Cut draft: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_REORDER_PLAYBACK_UNITS,
        description:
          'Reorder Canvas playback units by writing through Canvas graph commands and then reprojecting CanvasPlaybackPlan. Agent-inferred reorder requires confirmation.',
        category: 'project',
        requiresConfirmation: true,
        safetyKind: 'confirmation-gated',
        targetRequirements: {
          required: ['routeId', 'orderedUnitIds'],
          allowedFallbacks: ['explicit-user-input'],
          confirmationModes: ['agent-inferred'],
        },
        queryBeforeMutate: {
          preferredQueryTools: [
            TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_PLAN,
            TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_ROUTES,
          ],
          reason:
            'Resolve the exact route and full ordered unit set before mutating Canvas graph order.',
        },
        parameters: {
          type: 'object',
          properties: {
            sourceCanvasUri: { type: 'string', description: 'Optional Canvas document URI.' },
            routeId: { type: 'string', description: 'Playback route id to reorder.' },
            orderedUnitIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Full ordered playback unit id list for the selected route.',
            },
            approvalContext: {
              type: 'string',
              enum: ['explicit-user-instruction', 'agent-confirmed', 'agent-inferred'],
              description:
                'explicit-user-instruction may auto-approve same-turn specific user reorder; agent-inferred remains confirmation-gated.',
            },
            instructionText: {
              type: 'string',
              description: 'Specific same-turn user reorder instruction, if present.',
            },
          },
          required: ['orderedUnitIds'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const approvalContext = readPlaybackReorderApprovalContext(args.approvalContext);
            if (approvalContext === 'agent-inferred') {
              return {
                success: false,
                error: 'Agent-inferred Canvas playback reorder requires confirmation.',
              };
            }
            const data = await api.playback.reorderUnits({
              sourceCanvasUri: readOptionalString(args.sourceCanvasUri),
              routeId: readOptionalString(args.routeId),
              orderedUnitIds: readStringArray(args.orderedUnitIds),
              approvalContext,
              instructionText: readOptionalString(args.instructionText),
            });
            return { success: true, data };
          } catch (err) {
            return {
              success: false,
              error: `Failed to reorder Canvas playback units: ${String(err)}`,
            };
          }
        },
      },
      // -----------------------------------------------------------------------
      // Storyboard / Node tools
      // -----------------------------------------------------------------------
      {
        name: TOOL_NAMES_CANVAS.CANVAS_LIST_NODES,
        description:
          'List all nodes on the active canvas. Optionally filter by type (shot, scene, gallery, media, annotation, etc.).',
        category: 'project',
        isReadOnly: true,
        isConcurrencySafe: true,
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: 'Optional node type filter',
            },
          },
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const data = await api.nodes.list(readOptionalCanvasNodeType(args.type));
            return { success: true, data };
          } catch (err) {
            return { success: false, error: `Failed to list nodes: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_GET_NODE,
        description: 'Get full details of a single canvas node by its ID.',
        category: 'project',
        isReadOnly: true,
        isConcurrencySafe: true,
        parameters: {
          type: 'object',
          properties: {
            nodeId: { type: 'string', description: 'Canvas node ID' },
          },
          required: ['nodeId'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const data = await api.nodes.get(args.nodeId as string);
            return { success: true, data };
          } catch (err) {
            return { success: false, error: `Failed to get node: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_UPDATE_NODE,
        description:
          "Update a canvas node's data fields. Use this to set shot descriptions, characters, " +
          'camera settings, or generation parameters. Always write generation params to the node ' +
          'before calling canvas_generate_image so they persist across sessions.',
        category: 'project',
        requiresConfirmation: true,
        safetyKind: 'confirmation-gated',
        targetRequirements: {
          required: ['nodeId', 'data'],
          allowedFallbacks: ['explicit-user-input'],
          confirmationModes: ['update-node'],
        },
        queryBeforeMutate: {
          preferredQueryTools: [
            TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
            TOOL_NAMES_CANVAS.CANVAS_GET_NODE,
          ],
          reason: 'Resolve the stable Canvas node id and current writable fields before updating.',
        },
        parameters: {
          type: 'object',
          properties: {
            nodeId: { type: 'string', description: 'Canvas node ID' },
            data: {
              type: 'object',
              description:
                'Partial node data to merge. For ShotNode: visualDescription, shotScale, ' +
                'cameraMovement, characters[], emotion[], dialogue. ' +
                'For SceneGroupNode: sceneTitle, location, timeOfDay.',
            },
          },
          required: ['nodeId', 'data'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            await api.nodes.update(args.nodeId as string, args.data as Record<string, unknown>);
            return {
              success: true,
              data: {
                authoringResult: createUpdateNodeAuthoringResult(args.nodeId as string, args.data),
              },
            };
          } catch (err) {
            return {
              success: false,
              error: `Failed to update node: ${String(err)}`,
              data: {
                authoringResult: createBlockedCanvasAuthoringResultEnvelope('update-node', err, {
                  requiredQuery: TOOL_NAMES_CANVAS.CANVAS_GET_NODE,
                }),
              },
            };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_CREATE_NODE,
        description: "Create a new node on the active canvas. Returns the new node's ID.",
        category: 'project',
        requiresConfirmation: true,
        safetyKind: 'confirmation-gated',
        targetRequirements: {
          required: ['type'],
          allowedFallbacks: ['viewport-insertion', 'explicit-user-input'],
          confirmationModes: ['create-node'],
        },
        queryBeforeMutate: {
          preferredQueryTools: [
            TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
            TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
          ],
          reason: 'Resolve supported node types, presets, and insertion context before creating.',
        },
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: [...CANVAS_AGENT_CREATE_NODE_TYPES],
              description: 'Node type',
            },
            preset: {
              type: 'string',
              enum: [...CANVAS_AGENT_NODE_PRESETS],
              description:
                'Optional registered Canvas preset. Prefer composable presets for block rendering and preview metadata.',
            },
            x: { type: 'number', description: 'Canvas X position' },
            y: { type: 'number', description: 'Canvas Y position' },
            data: {
              type: 'object',
              description:
                'Initial node data. For shot: { shotNumber, duration, visualDescription, shotScale }. ' +
                'For scene: { sceneTitle, sceneNumber }. For gallery: { preset, rows, cols, cells }.',
            },
          },
          required: ['type', 'x', 'y', 'data'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const nodeType = readOptionalCanvasNodeType(args.type);
            if (!nodeType) {
              throw new Error('Canvas node creation requires a node type');
            }
            const data = await api.nodes.create(
              nodeType,
              { x: args.x as number, y: args.y as number },
              args.data as object,
              args.preset as string | undefined,
            );
            return {
              success: true,
              data: withCanvasAuthoringResult(
                data,
                createNodeMutationAuthoringResult(data, 'Created a Canvas node.'),
              ),
            };
          } catch (err) {
            return {
              success: false,
              error: `Failed to create node: ${String(err)}`,
              data: {
                authoringResult: createBlockedCanvasAuthoringResultEnvelope('create-node', err, {
                  requiredQuery: TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
                }),
              },
            };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_DERIVE_NODE,
        description:
          'Derive a successor node from an existing Canvas node using registered preset rules, shared placement, and a normal Canvas connection.',
        category: 'project',
        requiresConfirmation: true,
        safetyKind: 'confirmation-gated',
        targetRequirements: {
          required: ['sourceNodeId'],
          allowedFallbacks: ['selection', 'explicit-user-input'],
          confirmationModes: ['derive-node'],
        },
        queryBeforeMutate: {
          preferredQueryTools: [
            TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
            TOOL_NAMES_CANVAS.CANVAS_GET_NODE,
          ],
          reason:
            'Resolve source node preset rules and allowed derive targets before creating a successor.',
        },
        parameters: {
          type: 'object',
          properties: {
            sourceNodeId: { type: 'string', description: 'Source Canvas node ID' },
            targetPreset: {
              type: 'string',
              enum: [...CANVAS_AGENT_DERIVE_TARGET_PRESETS],
              description:
                'Optional target preset from the registered global derive candidates. Source-specific preset rules are enforced at runtime.',
            },
            targetType: {
              type: 'string',
              enum: [...CANVAS_AGENT_CREATE_NODE_TYPES],
              description:
                'Optional registered Canvas node type. Used only when no targetPreset is provided.',
            },
            data: {
              type: 'object',
              description: 'Optional data overrides merged into the derived node defaults.',
            },
            connect: {
              type: 'boolean',
              description: 'Whether to connect source to derived node. Defaults to true.',
            },
          },
          required: ['sourceNodeId'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const data = await api.nodes.derive({
              sourceNodeId: args.sourceNodeId as string,
              targetPreset: args.targetPreset as string | undefined,
              targetType: readOptionalCanvasNodeType(args.targetType, 'derive target type'),
              data: args.data as Record<string, unknown> | undefined,
              connect: args.connect as boolean | undefined,
            });
            return {
              success: true,
              data: withCanvasAuthoringResult(data, createDeriveNodeAuthoringResult(data)),
            };
          } catch (err) {
            return {
              success: false,
              error: `Failed to derive node: ${String(err)}`,
              data: {
                authoringResult: createBlockedCanvasAuthoringResultEnvelope('derive-node', err, {
                  requiredQuery: TOOL_NAMES_CANVAS.CANVAS_GET_NODE,
                }),
              },
            };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_CREATE_COMPOSITE,
        description:
          'Create a container and child nodes as one atomic Canvas mutation using container policy validation and shared auto-layout.',
        category: 'project',
        requiresConfirmation: true,
        safetyKind: 'confirmation-gated',
        targetRequirements: {
          required: ['containerPreset', 'children'],
          allowedFallbacks: ['viewport-insertion', 'explicit-user-input'],
          confirmationModes: ['create-composite'],
        },
        queryBeforeMutate: {
          preferredQueryTools: [
            TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
            TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
          ],
          reason:
            'Resolve container policy, child presets, insertion point, and layout risk before creating.',
        },
        parameters: {
          type: 'object',
          properties: {
            containerPreset: {
              type: 'string',
              enum: [...CANVAS_AGENT_CONTAINER_PRESETS],
              description: 'Registered container preset, such as scene.basic or group.container.',
            },
            x: { type: 'number', description: 'Container X position' },
            y: { type: 'number', description: 'Container Y position' },
            data: {
              type: 'object',
              description: 'Container data defaults or overrides.',
            },
            children: {
              type: 'array',
              description: 'Child node specs. Each child may include preset, type, data, x, and y.',
              items: {
                type: 'object',
                properties: {
                  preset: {
                    type: 'string',
                    enum: [...CANVAS_AGENT_CHILD_PRESETS],
                  },
                  type: {
                    type: 'string',
                    enum: [...CANVAS_AGENT_CREATE_NODE_TYPES],
                  },
                  x: { type: 'number' },
                  y: { type: 'number' },
                  data: { type: 'object' },
                },
              },
            },
            autoLayout: {
              type: 'boolean',
              description:
                'Whether to auto-arrange children inside the container. Defaults to true.',
            },
          },
          required: ['containerPreset', 'children'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const children = Array.isArray(args.children)
              ? args.children.map((child) => {
                  const value = isRecord(child) ? child : {};
                  return {
                    preset: value.preset as string | undefined,
                    type: readOptionalCanvasNodeType(value.type, 'child node type'),
                    position:
                      typeof value.x === 'number' && typeof value.y === 'number'
                        ? { x: value.x, y: value.y }
                        : undefined,
                    data: isRecord(value.data) ? value.data : undefined,
                  };
                })
              : [];
            const data = await api.nodes.createComposite({
              containerPreset: args.containerPreset as string,
              position:
                typeof args.x === 'number' && typeof args.y === 'number'
                  ? { x: args.x, y: args.y }
                  : undefined,
              data: args.data as Record<string, unknown> | undefined,
              children,
              autoLayout: args.autoLayout as boolean | undefined,
            });
            return {
              success: true,
              data: withCanvasAuthoringResult(data, createCompositeAuthoringResult(data)),
            };
          } catch (err) {
            return {
              success: false,
              error: `Failed to create composite: ${String(err)}`,
              data: {
                authoringResult: createBlockedCanvasAuthoringResultEnvelope(
                  'create-composite',
                  err,
                  { requiredQuery: TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES },
                ),
              },
            };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_UPDATE_BLOCK,
        description:
          'Update a composable Canvas block through its binding or an explicit JSON Pointer path into node.data.',
        category: 'project',
        requiresConfirmation: true,
        safetyKind: 'confirmation-gated',
        targetRequirements: {
          required: ['nodeId'],
          confirmationModes: ['replace', 'apply'],
        },
        queryBeforeMutate: {
          preferredQueryTools: [
            TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
            TOOL_NAMES_CANVAS.CANVAS_GET_NODE,
          ],
          reason: 'Resolve a stable Canvas node id and writable field path before updating data.',
        },
        parameters: {
          type: 'object',
          properties: {
            nodeId: { type: 'string', description: 'Canvas node ID' },
            blockId: { type: 'string', description: 'Composable block ID with a binding' },
            path: {
              type: 'string',
              description:
                'JSON Pointer path into node.data, for example /content or /cells/0/prompt.',
            },
            value: {
              type: 'string',
              description: 'New value. Objects should be passed as JSON text.',
            },
          },
          required: ['nodeId', 'value'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const request = {
              nodeId: args.nodeId as string,
              blockId: args.blockId as string | undefined,
              path: normalizeJsonPointerPath(args.path),
              value: parseToolValue(args.value),
            };
            const data = await api.nodes.updateBlock(request);
            return {
              success: true,
              data: withCanvasAuthoringResult(
                data,
                createUpdateBlockAuthoringResult(request, data),
              ),
            };
          } catch (err) {
            return {
              success: false,
              error: `Failed to update block: ${String(err)}`,
              data: {
                authoringResult: createBlockedCanvasAuthoringResultEnvelope('update-block', err, {
                  requiredQuery: TOOL_NAMES_CANVAS.CANVAS_GET_NODE,
                }),
              },
            };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_EXTRACT_STRUCTURED_CONTENT,
        description:
          'Extract Canvas node content as JSON, markdown, or prompt-oriented text while preserving layer boundaries and omitting preview runtime state.',
        category: 'project',
        isReadOnly: true,
        isConcurrencySafe: true,
        parameters: {
          type: 'object',
          properties: {
            nodeIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional explicit node IDs. Omit to use selection or all nodes.',
            },
            format: {
              type: 'string',
              enum: ['json', 'markdown', 'prompt'],
              description: 'Extraction format.',
            },
            includeChildren: {
              type: 'boolean',
              description: 'Include recursive organization children for selected containers.',
            },
          },
          required: ['format'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const data = await api.nodes.extractStructuredContent({
              nodeIds: Array.isArray(args.nodeIds)
                ? args.nodeIds.filter((nodeId): nodeId is string => typeof nodeId === 'string')
                : undefined,
              format: args.format === 'markdown' || args.format === 'prompt' ? args.format : 'json',
              includeChildren: args.includeChildren as boolean | undefined,
            });
            return { success: true, data };
          } catch (err) {
            return {
              success: false,
              error: `Failed to extract structured content: ${String(err)}`,
            };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
        description:
          'Read compact active Canvas context: selected nodes, subsystem summaries, insertion point, viewport, focused container, and targetable fields for follow-up mutations.',
        category: 'project',
        isReadOnly: true,
        isConcurrencySafe: true,
        safetyKind: 'read-only-query',
        parameters: {
          type: 'object',
          properties: {
            includeSelection: {
              type: 'boolean',
              description: 'Include selected node ids and compact selected node summaries.',
            },
            includeFocusedContainer: {
              type: 'boolean',
              description:
                'Include focused container summary and child constraints when available.',
            },
            includeNodeDetails: {
              type: 'boolean',
              description:
                'Include slightly richer node summaries; large media data remains omitted.',
            },
            includeSubsystemMetadata: {
              type: 'boolean',
              description:
                'Include bounded subsystem metadata summaries for narrative, behavior, entity, and memory graphs.',
            },
          },
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const data = await api.nodes.getActiveContext({
              includeSelection: args.includeSelection as boolean | undefined,
              includeFocusedContainer: args.includeFocusedContainer as boolean | undefined,
              includeNodeDetails: args.includeNodeDetails as boolean | undefined,
              includeSubsystemMetadata: args.includeSubsystemMetadata as boolean | undefined,
            });
            return { success: true, data };
          } catch (err) {
            return {
              success: false,
              error: `Failed to get active Canvas context: ${String(err)}`,
            };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_LIST_CONNECTIONS,
        description:
          'List active Canvas connections with optional filtering by type, source node, or target node.',
        category: 'project',
        isReadOnly: true,
        isConcurrencySafe: true,
        safetyKind: 'read-only-query',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: [...CANVAS_CONNECTION_TYPES],
              description: 'Optional connection type filter.',
            },
            sourceId: { type: 'string', description: 'Optional source node id filter.' },
            targetId: { type: 'string', description: 'Optional target node id filter.' },
          },
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const type = readOptionalCanvasConnectionType(args.type);
            const sourceId = readOptionalString(args.sourceId);
            const targetId = readOptionalString(args.targetId);
            const context = await api.nodes.getActiveContext({ includeNodeDetails: false });
            const connections = (context.connections ?? []).filter((connection) => {
              if (type && connection.type !== type) return false;
              if (sourceId && connection.sourceId !== sourceId) return false;
              if (targetId && connection.targetId !== targetId) return false;
              return true;
            });
            return { success: true, data: { connections } };
          } catch (err) {
            return {
              success: false,
              error: `Failed to list Canvas connections: ${String(err)}`,
              data: {
                authoringResult: createBlockedCanvasAuthoringResultEnvelope(
                  'list-connections',
                  err,
                  { requiredQuery: TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT },
                ),
              },
            };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_GET_CONNECTION,
        description: 'Get one active Canvas connection by its stable connection id.',
        category: 'project',
        isReadOnly: true,
        isConcurrencySafe: true,
        safetyKind: 'read-only-query',
        parameters: {
          type: 'object',
          properties: {
            connectionId: { type: 'string', description: 'Canvas connection ID.' },
          },
          required: ['connectionId'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const connectionId = readRequiredString(args.connectionId, 'connectionId');
            const context = await api.nodes.getActiveContext({ includeNodeDetails: false });
            const connection = context.connections?.find((item) => item.id === connectionId);
            if (!connection) {
              throw new Error(`Canvas connection "${connectionId}" was not found`);
            }
            return { success: true, data: { connection } };
          } catch (err) {
            return {
              success: false,
              error: `Failed to get Canvas connection: ${String(err)}`,
              data: {
                authoringResult: createBlockedCanvasAuthoringResultEnvelope('get-connection', err, {
                  requiredQuery: TOOL_NAMES_CANVAS.CANVAS_LIST_CONNECTIONS,
                }),
              },
            };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_CREATE_CONNECTION,
        description:
          'Create a validated connection between existing Canvas nodes through the resolved .nkc Canvas target.',
        category: 'project',
        requiresConfirmation: true,
        safetyKind: 'confirmation-gated',
        targetRequirements: {
          required: ['sourceId', 'targetId'],
          allowedFallbacks: ['selection', 'explicit-user-input'],
          confirmationModes: ['create-connection'],
        },
        queryBeforeMutate: {
          preferredQueryTools: [
            TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
            TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
            TOOL_NAMES_CANVAS.CANVAS_LIST_CONNECTIONS,
          ],
          reason:
            'Resolve stable source/target node ids, endpoint scopes, and existing connections before mutating.',
        },
        parameters: {
          type: 'object',
          properties: {
            sourceId: { type: 'string', description: 'Source Canvas node id.' },
            targetId: { type: 'string', description: 'Target Canvas node id.' },
            sourceEndpoint: {
              type: 'object',
              description: 'Optional source endpoint. nodeId must match sourceId.',
            },
            targetEndpoint: {
              type: 'object',
              description: 'Optional target endpoint. nodeId must match targetId.',
            },
            type: {
              type: 'string',
              enum: [...CANVAS_CONNECTION_TYPES],
              description: 'Optional Canvas connection type.',
            },
            label: { type: 'string', description: 'Optional connection label.' },
            priority: { type: 'number', description: 'Optional connection priority.' },
            extension: {
              type: 'object',
              description: 'Optional safe extension data object owned by Canvas/domain rules.',
            },
          },
          required: ['sourceId', 'targetId'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const sourceId = readRequiredString(args.sourceId, 'sourceId');
            const targetId = readRequiredString(args.targetId, 'targetId');
            const type = readOptionalCanvasConnectionType(args.type);
            const label = readOptionalString(args.label);
            const priority = readOptionalConnectionPriority(args.priority);
            const extension = readOptionalConnectionExtension(args.extension);
            const request: CanvasCreateConnectionRequest = {
              sourceId,
              targetId,
              sourceEndpoint: readOptionalConnectionEndpoint(
                args.sourceEndpoint,
                sourceId,
                'source',
              ),
              targetEndpoint: readOptionalConnectionEndpoint(
                args.targetEndpoint,
                targetId,
                'target',
              ),
              ...(type ? { type } : {}),
              ...(label ? { label } : {}),
              ...(priority !== undefined ? { priority } : {}),
              ...(extension ? { extension } : {}),
            };
            const data = await api.nodes.createConnection(request);
            return {
              success: true,
              data: withCanvasAuthoringResult(data, createConnectionAuthoringResult(data)),
            };
          } catch (err) {
            return {
              success: false,
              error: `Failed to create Canvas connection: ${String(err)}`,
              data: {
                authoringResult: createBlockedCanvasAuthoringResultEnvelope(
                  'create-connection',
                  err,
                  { requiredQuery: TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT },
                ),
              },
            };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_NARRATIVE_TRAVERSE,
        description:
          'Traverse narrative flow nodes in a mixed Canvas. Ignores storyboard, behavior, entity, and memory nodes.',
        category: 'project',
        isReadOnly: true,
        isConcurrencySafe: true,
        safetyKind: 'read-only-query',
        parameters: {
          type: 'object',
          properties: {
            startNodeId: {
              type: 'string',
              description: 'Optional narrative node id used as traversal start.',
            },
          },
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const nodes = await api.nodes.list();
            const context = await api.nodes.getActiveContext({ includeNodeDetails: false });
            const connections = Array.isArray((context as { connections?: unknown }).connections)
              ? (context as { connections: CanvasConnection[] }).connections
              : [];
            const data = traverseNarrativeFlow(
              nodes,
              connections,
              typeof args.startNodeId === 'string' ? args.startNodeId : undefined,
            );
            return { success: true, data };
          } catch (err) {
            return {
              success: false,
              error: `Failed to traverse narrative flow: ${String(err)}`,
            };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_APPLY_AGENT_CONTENT,
        description:
          'Apply Agent-generated text, optimized prompts, or structured content to an explicit Canvas node, container, field path, or viewport insertion point.',
        category: 'project',
        requiresConfirmation: true,
        safetyKind: 'confirmation-gated',
        targetRequirements: {
          required: ['target'],
          allowedFallbacks: ['selection', 'viewport-insertion', 'explicit-user-input'],
          confirmationModes: ['replace', 'apply'],
        },
        queryBeforeMutate: {
          preferredQueryTools: [
            TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
            TOOL_NAMES_CANVAS.CANVAS_GET_NODE,
          ],
          reason:
            'Use structured Canvas context to resolve nodeId, containerId, fieldPath, and insertionPoint before mutating.',
        },
        parameters: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              enum: ['text', 'prompt', 'structured'],
              description: 'Content kind to apply.',
            },
            text: { type: 'string', description: 'Text content when kind=text.' },
            prompt: { type: 'string', description: 'Prompt content when kind=prompt.' },
            contentJson: {
              type: 'string',
              description: 'JSON string for structured content when kind=structured.',
            },
            title: { type: 'string', description: 'Optional content title.' },
            format: {
              type: 'string',
              enum: ['plain', 'markdown', 'json', 'prompt'],
              description: 'Content format hint.',
            },
            nodeId: { type: 'string', description: 'Explicit Canvas node target.' },
            containerId: { type: 'string', description: 'Explicit Canvas container target.' },
            slotId: { type: 'string', description: 'Explicit Canvas slot target.' },
            fieldPath: {
              type: 'string',
              description: 'JSON Pointer path into node.data, such as /storyboardPrompt.',
            },
            mode: {
              type: 'string',
              enum: ['insert', 'append', 'replace', 'apply', 'create-child'],
              description: 'Mutation mode. replace/apply require explicit target data.',
            },
            x: { type: 'number', description: 'Canvas insertion X coordinate.' },
            y: { type: 'number', description: 'Canvas insertion Y coordinate.' },
          },
          required: ['kind'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const payload = {
              kind: args.kind === 'prompt' || args.kind === 'structured' ? args.kind : 'text',
              text: args.text as string | undefined,
              prompt: args.prompt as string | undefined,
              content: args.kind === 'structured' ? parseToolValue(args.contentJson) : undefined,
              title: args.title as string | undefined,
              format: args.format as CanvasAgentContentFormat | undefined,
              target: {
                nodeId: args.nodeId as string | undefined,
                containerId: args.containerId as string | undefined,
                slotId: args.slotId as string | undefined,
                fieldPath: normalizeJsonPointerPath(args.fieldPath),
                mode: args.mode as CanvasAgentMutationMode | undefined,
                insertionPoint:
                  typeof args.x === 'number' && typeof args.y === 'number'
                    ? { x: args.x, y: args.y }
                    : undefined,
              },
              provenance: { source: 'tool', label: TOOL_NAMES_CANVAS.CANVAS_APPLY_AGENT_CONTENT },
            };
            const data = await api.nodes.applyAgentContent(payload);
            return {
              success: true,
              data: withCanvasAuthoringResult(data, createApplyAgentContentAuthoringResult(data)),
            };
          } catch (err) {
            return {
              success: false,
              error: `Failed to apply Agent content to Canvas: ${String(err)}`,
              data: {
                authoringResult: createBlockedCanvasAuthoringResultEnvelope(
                  'apply-agent-content',
                  err,
                  { requiredQuery: TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT },
                ),
              },
            };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_GET_STORYBOARD_EXECUTION_SUMMARY,
        description:
          'Get a read-only scene/shot storyboard execution summary for Story or Agent workflows. ' +
          'Returns stable scene IDs, shot counts, generation status, selected asset references, and timeline import metadata without runtime preview URLs.',
        category: 'project',
        isReadOnly: true,
        isConcurrencySafe: true,
        parameters: {
          type: 'object',
          properties: {
            sourceScriptUri: {
              type: 'string',
              description: 'Optional source script URI used to correlate imported Story scenes.',
            },
            sceneId: {
              type: 'string',
              description: 'Optional Story scene ID.',
            },
            sceneNodeId: {
              type: 'string',
              description: 'Optional Canvas SceneGroup node ID.',
            },
            canvasFileUri: {
              type: 'string',
              description: 'Optional canvas file URI for consumers tracking bindings.',
            },
          },
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const request: CanvasStoryboardExecutionSummaryRequest = {
              sourceScriptUri:
                typeof args.sourceScriptUri === 'string' ? args.sourceScriptUri : undefined,
              sceneId: typeof args.sceneId === 'string' ? args.sceneId : undefined,
              sceneNodeId: typeof args.sceneNodeId === 'string' ? args.sceneNodeId : undefined,
              canvasFileUri:
                typeof args.canvasFileUri === 'string' ? args.canvasFileUri : undefined,
            };
            const data = await api.storyboard.getExecutionSummary(request);
            return { success: true, data };
          } catch (err) {
            return {
              success: false,
              error: `Failed to get storyboard execution summary: ${String(err)}`,
            };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_GENERATE_IMAGE,
        description:
          'Trigger image generation for a ShotNode or a specific gallery child media node. ' +
          'Write semantic storyboardPrompt prompt blocks and params before generation ' +
          'so they are persisted. Generation runs asynchronously in the background.',
        category: 'generation',
        isConcurrencySafe: true,
        parameters: {
          type: 'object',
          properties: {
            nodeId: { type: 'string', description: 'ShotNode or GalleryNode ID' },
            childNodeId: {
              type: 'string',
              description: 'Gallery child media node ID (required when nodeId is a GalleryNode)',
            },
          },
          required: ['nodeId'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            await ensureProjectModel(configManager, 'image');
            await api.nodes.generateImage(
              args.nodeId as string,
              args.childNodeId as string | undefined,
            );
            return {
              success: true,
              data: {
                authoringResult: createGenerationAuthoringResult('generate-image', [
                  args.nodeId as string,
                ]),
              },
            };
          } catch (err) {
            return {
              success: false,
              error: `Failed to generate image: ${String(err)}`,
              data: {
                authoringResult: createBlockedCanvasAuthoringResultEnvelope('generate-image', err, {
                  requiredQuery: TOOL_NAMES_CANVAS.CANVAS_GET_NODE,
                }),
              },
            };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_GENERATE_BATCH,
        description:
          'Trigger image generation for multiple nodes at once. ' +
          'Useful for generating all shots in a scene in one command. ' +
          'Runs up to 2 generations concurrently via the scheduler.',
        category: 'generation',
        isConcurrencySafe: true,
        parameters: {
          type: 'object',
          properties: {
            nodeIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of ShotNode IDs to generate images for',
            },
          },
          required: ['nodeIds'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            await ensureProjectModel(configManager, 'image');
            await api.nodes.generateBatch(args.nodeIds as string[]);
            return {
              success: true,
              data: {
                authoringResult: createGenerationAuthoringResult(
                  'generate-batch',
                  readStringArray(args.nodeIds),
                ),
              },
            };
          } catch (err) {
            return {
              success: false,
              error: `Failed to generate batch: ${String(err)}`,
              data: {
                authoringResult: createBlockedCanvasAuthoringResultEnvelope('generate-batch', err, {
                  requiredQuery: TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
                }),
              },
            };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.SET_PROJECT_GENERATION_CONFIG,
        description:
          'Persist project-level generation parameters and model configuration. ' +
          'These become the default for all nodes unless overridden per-node. ' +
          'Always call this before batch generation to ensure params survive context compression.',
        category: 'project',
        parameters: {
          type: 'object',
          properties: {
            imageRatio: {
              type: 'string',
              enum: ['16:9', '9:16', '1:1', '4:3', '2.39:1'],
              description: 'Image aspect ratio',
            },
            imageResolution: {
              type: 'string',
              enum: ['512', '720p', '1080p', '2K'],
              description: 'Image resolution',
            },
            videoRatio: {
              type: 'string',
              enum: ['16:9', '9:16', '1:1'],
              description: 'Video aspect ratio',
            },
            videoResolution: {
              type: 'string',
              enum: ['480p', '720p', '1080p'],
              description: 'Video resolution',
            },
            videoDuration: { type: 'number', description: 'Video duration in seconds' },
            videoFps: { type: 'number', enum: [24, 30], description: 'Video frame rate' },
            imageModel: { type: 'string', description: 'Image generation model id' },
            videoModel: { type: 'string', description: 'Video generation model id' },
            audioModel: { type: 'string', description: 'Audio generation model id' },
          },
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const configEntries: Record<string, unknown> = {};
            if (args.imageRatio !== undefined)
              configEntries['neko.project.generation.image.ratio'] = args.imageRatio;
            if (args.imageResolution !== undefined)
              configEntries['neko.project.generation.image.resolution'] = args.imageResolution;
            if (args.videoRatio !== undefined)
              configEntries['neko.project.generation.video.ratio'] = args.videoRatio;
            if (args.videoResolution !== undefined)
              configEntries['neko.project.generation.video.resolution'] = args.videoResolution;
            if (args.videoDuration !== undefined)
              configEntries['neko.project.generation.video.duration'] = args.videoDuration;
            if (args.videoFps !== undefined)
              configEntries['neko.project.generation.video.fps'] = args.videoFps;
            if (args.imageModel !== undefined)
              configEntries['neko.project.models.image'] = args.imageModel;
            if (args.videoModel !== undefined)
              configEntries['neko.project.models.video'] = args.videoModel;
            if (args.audioModel !== undefined)
              configEntries['neko.project.models.audio'] = args.audioModel;

            const wsConfig = vscode.workspace.getConfiguration();
            await Promise.all(
              Object.entries(configEntries).map(([key, value]) =>
                wsConfig.update(key, value, vscode.ConfigurationTarget.Workspace),
              ),
            );

            return { success: true, data: { updated: Object.keys(configEntries) } };
          } catch (err) {
            return { success: false, error: `Failed to set generation config: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.EXPORT_STORYBOARD,
        description:
          'Export the storyboard as a ZIP image pack or import it into the neko-cut timeline. ' +
          'ZIP format: creates a .zip file with shot images + manifest.json at a user-chosen path. ' +
          'neko-cut format: sends all shots to an explicitly identified neko-cut project as MediaElement clips. ' +
          'Returns the saved file path (ZIP) or a confirmation (neko-cut).',
        category: 'project',
        parameters: {
          type: 'object',
          properties: {
            format: {
              type: 'string',
              enum: ['zip', 'neko-cut'],
              description:
                '"zip" to save image pack + manifest.json, "neko-cut" to import into timeline',
            },
            projectName: {
              type: 'string',
              description: 'Project name used for file naming and manifest (default: "storyboard")',
            },
            cutProjectUri: {
              type: 'string',
              description: 'Explicit existing .nkv file URI required for neko-cut export.',
            },
            cutProjectRevision: {
              type: 'string',
              description: 'Expected Cut project revision captured before authoring.',
            },
          },
          required: ['format'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const format = args.format as 'zip' | 'neko-cut';
            const projectName = (args.projectName as string | undefined) ?? 'storyboard';

            // Fetch all shot and scene nodes
            const [allShots, allScenes] = await Promise.all([
              api.nodes.list('shot' as CanvasNodeType),
              api.nodes.list('scene' as CanvasNodeType),
            ]);

            if (allShots.length === 0) {
              return {
                success: false,
                error: 'No shot nodes found on the canvas. Create ShotNodes first.',
              };
            }

            // Build scene title lookup
            const sceneTitleMap = new Map<string, string>();
            for (const scene of allScenes) {
              const d = scene.data as Record<string, unknown>;
              sceneTitleMap.set(scene.id, (d['sceneTitle'] as string | undefined) ?? '');
            }

            // Build manifest shots
            interface ManifestShot {
              id: string;
              shotNumber: number;
              sceneId?: string;
              sceneTitle?: string;
              shotScale?: string;
              cameraMovement?: string;
              duration: number;
              visualDescription: string;
              characters: string[];
              emotion: string[];
              dialogue?: string;
              voiceOver?: string;
              soundCue?: string;
              imageFile?: string;
            }

            const manifestShots: ManifestShot[] = allShots.map((node) => {
              const d = node.data as Record<string, unknown>;
              const shotNumber = (d['shotNumber'] as number | undefined) ?? 0;
              const sceneId = getNodeParentId(node);
              const chars =
                (d['characters'] as Array<{ characterName?: string }> | undefined) ?? [];
              const pad = String(shotNumber).padStart(3, '0');
              const scale = (d['shotScale'] as string | undefined) ?? '';
              const firstChar =
                typeof chars[0]?.characterName === 'string' ? chars[0].characterName : '';
              const imageFile = `shots/${pad}_${scale}${firstChar ? `_${firstChar}` : ''}.png`;
              return {
                id: node.id,
                shotNumber,
                sceneId,
                sceneTitle: sceneId ? sceneTitleMap.get(sceneId) : undefined,
                shotScale: scale || undefined,
                cameraMovement: d['cameraMovement'] as string | undefined,
                duration: (d['duration'] as number | undefined) ?? 3,
                visualDescription: (d['visualDescription'] as string | undefined) ?? '',
                characters: chars.map((c) => c.characterName ?? '').filter(Boolean),
                emotion: (d['emotion'] as string[] | undefined) ?? [],
                dialogue: d['dialogue'] as string | undefined,
                voiceOver: d['voiceOver'] as string | undefined,
                soundCue: d['soundCue'] as string | undefined,
                imageFile: readShotGeneratedImageFallback(d) ? imageFile : undefined,
              };
            });

            if (format === 'neko-cut') {
              const cutProjectUri = readOptionalString(args.cutProjectUri);
              const cutProjectRevision = readOptionalString(args.cutProjectRevision);
              if (!cutProjectUri || !cutProjectRevision) {
                return {
                  success: false,
                  error:
                    'neko-cut storyboard export requires cutProjectUri and cutProjectRevision.',
                };
              }
              const shotDataById = new Map<string, Record<string, unknown>>(
                allShots.map((node) => [node.id, node.data as Record<string, unknown>]),
              );
              const timelineShots = manifestShots.map((s) => {
                const data = shotDataById.get(s.id);
                const referenceDescriptors: readonly ReferenceDescriptor[] = data
                  ? collectShotKeyframeReferenceDescriptors(s.id, data)
                  : [];
                return {
                  id: s.id,
                  shotNumber: s.shotNumber,
                  duration: s.duration,
                  ...(data
                    ? {
                        preparedKeyframeRef: readShotPreparedKeyframeRef(data),
                        imageDataUrl: readShotGeneratedImageFallback(data),
                      }
                    : {}),
                  ...(referenceDescriptors.length > 0 ? { referenceDescriptors } : {}),
                  dialogue: s.dialogue,
                  voiceOver: s.voiceOver,
                  soundCue: s.soundCue,
                  label: `#${String(s.shotNumber).padStart(3, '0')} ${s.shotScale ?? ''}`.trim(),
                };
              });

              await vscode.commands.executeCommand('neko.cut.authoring.importStoryboard', {
                target: { kind: 'file', documentUri: cutProjectUri },
                expectedProjectRevision: cutProjectRevision,
                projectName,
                shots: timelineShots,
              });
              const importedAt = Date.now();
              await applyCanvasTimelineSyncToCanvas(
                api,
                buildStoryboardImportTimelineSyncPayload(
                  timelineShots.map((shot) => shot.id),
                  projectName,
                  importedAt,
                ),
              );

              return {
                success: true,
                data: {
                  format: 'neko-cut',
                  shotsImported: timelineShots.length,
                  message: `${timelineShots.length} shots imported into neko-cut timeline`,
                },
              };
            }

            // ZIP format — delegate to a command since ZIP requires AdmZip
            // which should not be a dependency of neko-canvas
            await vscode.commands.executeCommand('neko.canvas.exportStoryboard', 'zip');

            return {
              success: true,
              data: {
                format: 'zip',
                totalShots: manifestShots.length,
                message: 'Storyboard ZIP export initiated',
              },
            };
          } catch (err) {
            return { success: false, error: `Failed to export storyboard: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_APPLY_STYLE_TRANSFER,
        description:
          'Apply style transfer to target ShotNodes using a GalleryNode as IP-Adapter reference. ' +
          'Sets referenceNodeId on each target shot to the given GalleryNode, then triggers batch ' +
          'image generation so each shot is re-generated with the style reference applied. ' +
          'Use canvas_list_nodes to find GalleryNode IDs before calling this.',
        category: 'generation',
        parameters: {
          type: 'object',
          properties: {
            targetNodeIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of ShotNode IDs to apply style transfer to',
            },
            referenceNodeId: {
              type: 'string',
              description: 'GalleryNode ID to use as IP-Adapter style reference',
            },
          },
          required: ['targetNodeIds', 'referenceNodeId'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const targetNodeIds = args.targetNodeIds as string[];
            const refNodeId = args.referenceNodeId as string;

            // Verify the reference node is a gallery node
            const refNode = await api.nodes.get(refNodeId);
            if (!refNode) {
              return { success: false, error: `Reference node "${refNodeId}" not found` };
            }
            if (refNode.type !== 'gallery') {
              return {
                success: false,
                error: `Reference node must be a GalleryNode (got type: "${refNode.type}")`,
              };
            }

            // Set referenceNodeId on each target shot
            const updateErrors: string[] = [];
            for (const nodeId of targetNodeIds) {
              try {
                await api.nodes.update(nodeId, { referenceNodeId: refNodeId });
              } catch (err) {
                updateErrors.push(`${nodeId}: ${String(err)}`);
              }
            }

            if (updateErrors.length > 0) {
              return {
                success: false,
                error: `Failed to update reference on some nodes: ${updateErrors.join(', ')}`,
              };
            }

            // Trigger batch generation with the style reference set
            await api.nodes.generateBatch(targetNodeIds);

            logger.info(
              `canvas_apply_style_transfer: ref="${refNodeId}" targets=${targetNodeIds.length}`,
            );
            return {
              success: true,
              data: {
                message: `Style transfer queued for ${targetNodeIds.length} shot(s) using GalleryNode "${refNodeId}"`,
                targetNodeIds,
                referenceNodeId: refNodeId,
              },
            };
          } catch (err) {
            return { success: false, error: `Failed to apply style transfer: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.IMPORT_SCRIPT_TO_CANVAS,
        description:
          'Import a Fountain screenplay into the active canvas as a storyboard skeleton. ' +
          'Supports two code paths: mechanical skeleton import, or semantic import when ScenePlan/ShotPlan data is provided.',
        category: 'project',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute path to the .fountain screenplay file',
            },
            mode: {
              type: 'string',
              enum: ['mechanical', 'semantic'],
              description:
                'Import mode. mechanical = heuristic storyboard skeleton, semantic = consume ScenePlan/ShotPlan input when provided.',
            },
            startX: {
              type: 'number',
              description: 'Canvas X position of the first SceneGroupNode (default: 100)',
            },
            startY: {
              type: 'number',
              description: 'Canvas Y position of the first SceneGroupNode (default: 100)',
            },
            scenesLimit: {
              type: 'number',
              description: 'Maximum number of scenes to import (default: all, max: 50)',
            },
            scenePlans: {
              type: 'array',
              description:
                'Optional semantic ScenePlan/ShotPlan array. Used when mode=semantic; falls back to mechanical planning when omitted.',
            },
          },
          required: ['path'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const scriptPath = args.path as string;
            const content = await vscode.workspace.fs.readFile(vscode.Uri.file(scriptPath));
            const scriptIndex = buildFountainScriptIndex({ uri: scriptPath, content });
            if (scriptIndex.scenes.length === 0) {
              return { success: false, error: 'No scenes found in this screenplay.' };
            }

            const startX = (args.startX as number | undefined) ?? 100;
            const startY = (args.startY as number | undefined) ?? 100;
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            const characterBindings = await resolveCharacterBindingsForNames(
              scriptIndex.characters.map((character) => character.name),
              {
                workspaceRoot,
                uriOrPath: scriptPath,
              },
            );
            const payload = createStoryboardPayload(scriptIndex, {
              mode: (args.mode as 'mechanical' | 'semantic' | undefined) ?? 'mechanical',
              scenesLimit: Math.min(
                (args.scenesLimit as number | undefined) ?? scriptIndex.scenes.length,
                50,
              ),
              scenePlans: (args.scenePlans as StoryScenePlan[] | undefined) ?? [],
              characterBindings,
            });
            const created = await api.storyboard.import(payload, { startX, startY });

            logger.info(
              `import_script_to_canvas: mode=${created.mode} scenes=${created.scenesCreated} shots=${created.totalShots}`,
            );
            return {
              success: true,
              data: {
                mode: created.mode,
                scenesCreated: created.scenesCreated,
                totalShots: created.totalShots,
                scenes: created.scenes,
              },
            };
          } catch (err) {
            return { success: false, error: `Failed to import script to canvas: ${String(err)}` };
          }
        },
      },
    ];
    const localizedTools = tools.map((tool) => withCanvasToolMetadata(tool));

    // -----------------------------------------------------------------------
    // Keyframe Video Generation (requires mediaService)
    // -----------------------------------------------------------------------
    if (mediaService) {
      localizedTools.push(
        withCanvasToolMetadata(createVideoKeyframeTool(api, mediaService, logger)),
      );
    }

    return localizedTools;
  }
}

/**
 * Create the keyframe video generation tool (requires mediaService).
 */
function createVideoKeyframeTool(
  api: NekoCanvasAPI,
  media: ICapabilityMediaService,
  logger: ReturnType<typeof getRootLogger>,
): Tool {
  return {
    name: TOOL_NAMES_CANVAS.CANVAS_GENERATE_VIDEO_WITH_KEYFRAMES,
    description:
      'Generate a video clip for a ShotNode using first-frame and last-frame images as keyframes. ' +
      'The first frame node and last frame node must already have generated images. ' +
      'Calls the configured video model with the keyframe references and stores the result ' +
      "in the target node's generatedVideo field. Returns error if media service is unavailable.",
    category: 'generation',
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: 'Target ShotNode ID where the generated video will be stored',
        },
        firstFrameNodeId: {
          type: 'string',
          description: 'ShotNode ID whose generatedImage is used as the first (start) frame',
        },
        lastFrameNodeId: {
          type: 'string',
          description: 'ShotNode ID whose generatedImage is used as the last (end) frame',
        },
        duration: {
          type: 'number',
          description: 'Video duration in seconds (default: 3)',
        },
        aspectRatio: {
          type: 'string',
          description: 'Aspect ratio e.g. "16:9" or "9:16" (default: "16:9")',
        },
      },
      required: ['nodeId', 'firstFrameNodeId', 'lastFrameNodeId'],
    } satisfies ToolParameters,
    async execute(args, options?: ToolExecuteOptions) {
      try {
        const nodeId = args.nodeId as string;
        const firstFrameNodeId = args.firstFrameNodeId as string;
        const lastFrameNodeId = args.lastFrameNodeId as string;
        const duration = (args.duration as number | undefined) ?? 3;
        const aspectRatio = (args.aspectRatio as string | undefined) ?? '16:9';

        // Fetch all three nodes in parallel
        const [targetNode, firstNode, lastNode] = await Promise.all([
          api.nodes.get(nodeId),
          api.nodes.get(firstFrameNodeId),
          api.nodes.get(lastFrameNodeId),
        ]);

        if (!targetNode) return { success: false, error: `Target node "${nodeId}" not found` };
        if (!firstNode)
          return { success: false, error: `First frame node "${firstFrameNodeId}" not found` };
        if (!lastNode)
          return { success: false, error: `Last frame node "${lastFrameNodeId}" not found` };

        const firstNodeData = firstNode.data as Record<string, unknown>;
        const lastNodeData = lastNode.data as Record<string, unknown>;
        const firstFrameMediaRef = readShotPreparedKeyframeRef(firstNodeData);
        const lastFrameMediaRef = readShotPreparedKeyframeRef(lastNodeData);

        if (!firstFrameMediaRef) {
          return {
            success: false,
            error: `First frame node "${firstFrameNodeId}" has no durable prepared keyframe reference. Run canvas_generate_image and promote its output first.`,
          };
        }
        if (!lastFrameMediaRef) {
          return {
            success: false,
            error: `Last frame node "${lastFrameNodeId}" has no durable prepared keyframe reference. Run canvas_generate_image and promote its output first.`,
          };
        }

        let startFrameRef;
        let endFrameRef;
        try {
          startFrameRef = toCanvasStableMediaResourceRef(firstFrameMediaRef);
          endFrameRef = toCanvasStableMediaResourceRef(lastFrameMediaRef);
        } catch (error) {
          return {
            success: false,
            error: `Keyframe media identity is not durable: ${String(error)}`,
          };
        }

        // Build prompt from target node's visual description. Canvas node ids are local
        // lookup handles only and are not forwarded as provider media identity.
        const visualDesc = (targetNode.data as Record<string, unknown>)['visualDescription'] as
          string | undefined;
        const shotNumber = (targetNode.data as Record<string, unknown>)['shotNumber'] as
          number | undefined;
        const prompt = visualDesc?.trim() || `Shot ${shotNumber ?? ''} video clip`;
        const lineage = extractCanvasNodeGenerationLineage(targetNode);
        const metadata: Record<string, unknown> = {};
        if (lineage?.characterIds && lineage.characterIds.length > 0) {
          metadata['characterIds'] = [...lineage.characterIds];
        }

        // Mark node as generating
        await api.nodes.update(nodeId, { generationStatus: 'generating' });

        let task;
        try {
          task = await media.generateVideo({
            prompt,
            operation: 'generate-from-keyframes',
            startFrameRef,
            endFrameRef,
            aspectRatio,
            duration,
            metadata: withToolExecutionRunMetadata(options, metadata),
          });
        } catch (err) {
          await api.nodes.update(nodeId, { generationStatus: 'error' });
          return { success: false, error: `Video generation failed to start: ${String(err)}` };
        }

        // Wait for completion (up to 5 minutes)
        let completed;
        try {
          completed = await media.waitForTask(task.scope, 5 * 60 * 1000);
        } catch (err) {
          await api.nodes.update(nodeId, { generationStatus: 'error' });
          return { success: false, error: `Video generation timed out: ${String(err)}` };
        }

        if (completed.status !== 'completed' || !completed.outputs?.length) {
          await api.nodes.update(nodeId, { generationStatus: 'error' });
          return { success: false, error: `Video generation ${completed.status}` };
        }

        const output = completed.outputs[0]!;
        await api.nodes.update(nodeId, {
          generatedVideo: output.url,
          generationStatus: 'done',
        });

        logger.info(`canvas_generate_video_with_keyframes: nodeId=${nodeId} taskId=${task.id}`);
        return {
          success: true,
          data: {
            message: `Video generated for shot "${nodeId}"`,
            videoUrl: output.url,
            taskId: task.id,
            duration,
            aspectRatio,
          },
        };
      } catch (err) {
        return {
          success: false,
          error: `Failed to generate video with keyframes: ${String(err)}`,
        };
      }
    },
  };
}
