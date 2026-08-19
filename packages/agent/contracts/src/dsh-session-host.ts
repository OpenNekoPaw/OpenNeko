import {
  decodeDshAcpInputCatalogProjection,
  decodeDshAcpJsonPayload,
  type DshAcpInputCatalogProjection,
  type DshAcpJsonValue,
} from './dsh-acp';
import { isAgentContextType, type AgentContextPayload } from './agent-context';
import type { ModelType } from '@neko/ai-contracts';
import { validateContentLocator, type ContentLocator } from '@neko/content';

export const DSH_SESSION_HOST_CHANNEL = 'openneko:dsh:session';
export const DSH_SESSION_CHANGED_CHANNEL = 'openneko:dsh:session:changed';

export type DshSessionHostEvent =
  | {
      readonly kind: 'message';
      readonly role: 'user';
      readonly text: string;
      readonly messageId?: string;
    }
  | {
      readonly kind: 'message';
      readonly role: 'assistant';
      readonly turn: number;
      readonly step: number;
      readonly text: string;
      readonly messageId: string;
      readonly state: 'streaming' | 'final';
    }
  | {
      readonly kind: 'thought';
      readonly turn: number;
      readonly step: number;
      readonly text: string;
      readonly messageId: string;
      readonly state: 'streaming' | 'final';
    }
  | {
      readonly kind: 'tool';
      readonly toolCallId: string;
      readonly turn: number;
      readonly status: 'pending' | 'in_progress' | 'completed' | 'failed';
      readonly title?: string;
      readonly rawInput?: DshAcpJsonValue;
      readonly rawOutput?: DshAcpJsonValue;
    }
  | {
      readonly kind: 'command';
      readonly commandId: string;
      readonly name: string;
      readonly args?: string;
      readonly status: 'running' | 'completed' | 'failed';
      readonly text?: string;
    }
  | {
      readonly kind: 'turn';
      readonly turn: number;
      readonly phase: 'start';
      readonly startedAt: number;
    }
  | {
      readonly kind: 'turn';
      readonly turn: number;
      readonly phase: 'end';
      readonly startedAt: number;
      readonly completedAt: number;
      readonly reason?: string;
    }
  | {
      readonly kind: 'cancel';
      readonly turn?: number;
      readonly toolCallId?: string;
    }
  | {
      readonly kind: 'diagnostic';
      readonly code: string;
      readonly message: string;
    };

export interface DshSessionHostProjection {
  readonly conversationId: string;
  readonly dshSessionId: string;
  readonly currentTurn?: number;
  readonly events: readonly DshSessionHostEvent[];
}

export interface DshComposerModelOption {
  readonly id: string;
  readonly label: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly providerLabel: string;
  readonly category: ModelType;
  readonly capabilities: readonly string[];
}

export interface DshComposerPermissionPresetOption {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly selectable: boolean;
}

export interface DshComposerContextProjection {
  readonly kind: 'workspace';
  readonly workspaceId: string;
  readonly workspaceLabel: string;
  readonly canvas: {
    readonly kind: 'workspace-board';
    readonly label: string;
  };
}

export interface DshComposerConfigurationProjection {
  readonly models: readonly DshComposerModelOption[];
  readonly selectedModelOptionId?: string;
  readonly selectedMediaModelOptionIds: Readonly<
    Partial<Record<Exclude<ModelType, 'llm'>, string>>
  >;
  readonly permissionPresetId: string;
  readonly permissionPresets: readonly DshComposerPermissionPresetOption[];
  readonly context?: DshComposerContextProjection;
  readonly inputCatalog?: DshAcpInputCatalogProjection;
  readonly inputCatalogDiagnostic?: string;
  readonly diagnostic?: string;
}

export interface DshComposerReference {
  readonly label: string;
  readonly contentLocator: ContentLocator;
}

export interface DshComposerMentionProjection {
  readonly id: string;
  readonly kind: 'file' | 'media' | 'asset' | 'entity' | 'canvas-node' | 'character' | 'scene';
  readonly label: string;
  readonly description?: string;
  readonly contentLocator?: ContentLocator;
  readonly contextPayload?: AgentContextPayload;
  readonly source: 'workspace' | 'media-library' | 'entity-graph' | 'story' | 'canvas';
  readonly mediaType?: 'video' | 'audio' | 'image' | 'text' | 'document';
}

export type DshComposerSubmitInput =
  | {
      readonly kind: 'message';
      readonly text: string;
      readonly references: readonly DshComposerReference[];
      readonly contextPayloads: readonly AgentContextPayload[];
    }
  | { readonly kind: 'command'; readonly line: string }
  | {
      readonly kind: 'skill';
      readonly skillName: string;
      readonly displayText: string;
      readonly args?: string;
    };

interface DshSessionHostSenderRequest {
  readonly requestId: string;
  readonly windowId: string;
  readonly rendererSessionId: string;
}

interface DshSessionHostConversationRequest extends DshSessionHostSenderRequest {
  readonly conversationId: string;
}

export type DshConversationCreationTarget =
  { readonly kind: 'surface' } | { readonly kind: 'project'; readonly projectId: string };

export type DshSessionHostRequest =
  | (DshSessionHostSenderRequest & {
      readonly operation: 'create';
      readonly workbenchInstanceId: string;
      readonly agentSurfaceId: string;
      readonly permissionPresetId: string;
      readonly target: DshConversationCreationTarget;
    })
  | (DshSessionHostConversationRequest & { readonly operation: 'snapshot' })
  | (DshSessionHostConversationRequest & {
      readonly operation: 'submit';
      readonly input: DshComposerSubmitInput;
    })
  | (DshSessionHostConversationRequest & { readonly operation: 'cancel' })
  | (DshSessionHostSenderRequest & {
      readonly operation: 'composer-snapshot';
      readonly workbenchInstanceId: string;
      readonly agentSurfaceId: string;
    })
  | (DshSessionHostSenderRequest & {
      readonly operation: 'composer-mentions';
      readonly workbenchInstanceId: string;
      readonly agentSurfaceId: string;
      readonly filter: string;
    })
  | (DshSessionHostSenderRequest & {
      readonly operation: 'composer-model';
      readonly workbenchInstanceId: string;
      readonly agentSurfaceId: string;
      readonly modelOptionId: string;
    })
  | (DshSessionHostSenderRequest & {
      readonly operation: 'composer-media-model';
      readonly workbenchInstanceId: string;
      readonly agentSurfaceId: string;
      readonly category: 'image' | 'video' | 'audio';
      readonly modelOptionId: string;
    })
  | (DshSessionHostSenderRequest & {
      readonly operation: 'composer-permission-preset';
      readonly workbenchInstanceId: string;
      readonly agentSurfaceId: string;
      readonly permissionPresetId: string;
    });

export interface DshSessionHostResult {
  readonly requestId: string;
  readonly projection: DshSessionHostProjection;
  readonly stopReason?: string;
}

export interface DshComposerConfigurationHostResult {
  readonly requestId: string;
  readonly configuration: DshComposerConfigurationProjection;
}

export interface DshComposerMentionsHostResult {
  readonly requestId: string;
  readonly mentions: readonly DshComposerMentionProjection[];
}

export interface DshSessionChangedEvent {
  readonly conversationId: string;
}

export interface OpenNekoDshSessionBridge {
  readonly dshSessions: {
    create(
      workbenchInstanceId: string,
      agentSurfaceId: string,
      permissionPresetId: string,
      target: DshConversationCreationTarget,
    ): Promise<DshSessionHostProjection>;
    getSnapshot(conversationId: string): Promise<DshSessionHostProjection>;
    submit(conversationId: string, input: DshComposerSubmitInput): Promise<DshSessionHostResult>;
    cancel(conversationId: string): Promise<DshSessionHostProjection>;
    getComposerConfiguration(
      workbenchInstanceId: string,
      agentSurfaceId: string,
    ): Promise<DshComposerConfigurationProjection>;
    searchComposerMentions(
      workbenchInstanceId: string,
      agentSurfaceId: string,
      filter: string,
    ): Promise<readonly DshComposerMentionProjection[]>;
    selectComposerModel(
      workbenchInstanceId: string,
      agentSurfaceId: string,
      modelOptionId: string,
    ): Promise<DshComposerConfigurationProjection>;
    selectComposerMediaModel(
      workbenchInstanceId: string,
      agentSurfaceId: string,
      category: 'image' | 'video' | 'audio',
      modelOptionId: string,
    ): Promise<DshComposerConfigurationProjection>;
    selectComposerPermissionPreset(
      workbenchInstanceId: string,
      agentSurfaceId: string,
      permissionPresetId: string,
    ): Promise<DshComposerConfigurationProjection>;
    subscribe(listener: (event: DshSessionChangedEvent) => void): () => void;
  };
}

export function parseDshSessionHostRequest(value: unknown): DshSessionHostRequest {
  const record = requireRecord(value, 'DSH Session request');
  const base = {
    requestId: requireIdentity(record.requestId, 'requestId'),
    windowId: requireIdentity(record.windowId, 'windowId'),
    rendererSessionId: requireIdentity(record.rendererSessionId, 'rendererSessionId'),
  };
  if (record.operation === 'create') {
    requireExactKeys(record, [
      'requestId',
      'operation',
      'windowId',
      'rendererSessionId',
      'workbenchInstanceId',
      'agentSurfaceId',
      'permissionPresetId',
      'target',
    ]);
    return {
      ...base,
      operation: 'create',
      workbenchInstanceId: requireIdentity(record.workbenchInstanceId, 'workbenchInstanceId'),
      agentSurfaceId: requireIdentity(record.agentSurfaceId, 'agentSurfaceId'),
      permissionPresetId: requireIdentity(record.permissionPresetId, 'permissionPresetId'),
      target: parseConversationCreationTarget(record.target),
    };
  }
  if (
    record.operation === 'composer-snapshot' ||
    record.operation === 'composer-mentions' ||
    record.operation === 'composer-model' ||
    record.operation === 'composer-media-model' ||
    record.operation === 'composer-permission-preset'
  ) {
    const commonKeys = [
      'requestId',
      'operation',
      'windowId',
      'rendererSessionId',
      'workbenchInstanceId',
      'agentSurfaceId',
    ];
    const common = {
      ...base,
      workbenchInstanceId: requireIdentity(record.workbenchInstanceId, 'workbenchInstanceId'),
      agentSurfaceId: requireIdentity(record.agentSurfaceId, 'agentSurfaceId'),
    };
    if (record.operation === 'composer-snapshot') {
      requireExactKeys(record, commonKeys);
      return { ...common, operation: 'composer-snapshot' };
    }
    if (record.operation === 'composer-mentions') {
      requireExactKeys(record, [...commonKeys, 'filter']);
      return {
        ...common,
        operation: 'composer-mentions',
        filter: requireString(record.filter, 'mention filter'),
      };
    }
    if (record.operation === 'composer-model') {
      requireExactKeys(record, [...commonKeys, 'modelOptionId']);
      return {
        ...common,
        operation: 'composer-model',
        modelOptionId: requireIdentity(record.modelOptionId, 'modelOptionId'),
      };
    }
    if (record.operation === 'composer-media-model') {
      requireExactKeys(record, [...commonKeys, 'category', 'modelOptionId']);
      return {
        ...common,
        operation: 'composer-media-model',
        category: parseMediaCategory(record.category),
        modelOptionId: requireIdentity(record.modelOptionId, 'modelOptionId'),
      };
    }
    requireExactKeys(record, [...commonKeys, 'permissionPresetId']);
    return {
      ...common,
      operation: 'composer-permission-preset',
      permissionPresetId: requireIdentity(record.permissionPresetId, 'permissionPresetId'),
    };
  }
  const conversationId = requireIdentity(record.conversationId, 'conversationId');
  if (record.operation === 'snapshot' || record.operation === 'cancel') {
    requireExactKeys(record, [
      'requestId',
      'operation',
      'windowId',
      'rendererSessionId',
      'conversationId',
    ]);
    return { ...base, operation: record.operation, conversationId };
  }
  if (record.operation === 'submit') {
    requireExactKeys(record, [
      'requestId',
      'operation',
      'windowId',
      'rendererSessionId',
      'conversationId',
      'input',
    ]);
    return {
      ...base,
      operation: 'submit',
      conversationId,
      input: parseComposerSubmitInput(record.input),
    };
  }
  throw new Error(`DSH Session operation '${String(record.operation)}' is unsupported.`);
}

function parseConversationCreationTarget(value: unknown): DshConversationCreationTarget {
  const record = requireRecord(value, 'DSH Conversation creation target');
  if (record.kind === 'surface') {
    requireExactKeys(record, ['kind']);
    return { kind: 'surface' };
  }
  if (record.kind === 'project') {
    requireExactKeys(record, ['kind', 'projectId']);
    return { kind: 'project', projectId: requireIdentity(record.projectId, 'projectId') };
  }
  throw new Error(`DSH Conversation creation target '${String(record.kind)}' is unsupported.`);
}

function parseMediaCategory(value: unknown): 'image' | 'video' | 'audio' {
  if (value === 'image' || value === 'video' || value === 'audio') return value;
  throw new Error(`DSH composer media category '${String(value)}' is unsupported.`);
}

export function parseDshComposerConfigurationHostResult(
  value: unknown,
  expectedRequestId: string,
): DshComposerConfigurationHostResult {
  const record = requireRecord(value, 'DSH composer configuration result');
  requireExactKeys(record, ['requestId', 'configuration']);
  const requestId = requireIdentity(record.requestId, 'requestId');
  if (requestId !== expectedRequestId) {
    throw new Error(
      `DSH composer configuration result '${requestId}' does not match '${expectedRequestId}'.`,
    );
  }
  return {
    requestId,
    configuration: parseDshComposerConfigurationProjection(record.configuration),
  };
}

export function parseDshComposerConfigurationProjection(
  value: unknown,
): DshComposerConfigurationProjection {
  const record = requireRecord(value, 'DSH composer configuration projection');
  requireAllowedKeys(
    record,
    [
      'models',
      'selectedModelOptionId',
      'selectedMediaModelOptionIds',
      'permissionPresetId',
      'permissionPresets',
      'context',
      'inputCatalog',
      'inputCatalogDiagnostic',
      'diagnostic',
    ],
    ['models', 'selectedMediaModelOptionIds', 'permissionPresetId', 'permissionPresets'],
  );
  if (!Array.isArray(record.models)) {
    throw new Error('DSH composer models must be an array.');
  }
  if (!Array.isArray(record.permissionPresets) || record.permissionPresets.length === 0) {
    throw new Error('DSH composer permission presets must be a non-empty array.');
  }
  const models = record.models.map((model) => {
    const candidate = requireRecord(model, 'DSH composer model option');
    requireExactKeys(candidate, [
      'id',
      'label',
      'providerId',
      'modelId',
      'providerLabel',
      'category',
      'capabilities',
    ]);
    if (!Array.isArray(candidate.capabilities)) {
      throw new Error('DSH composer model capabilities must be an array.');
    }
    return {
      id: requireIdentity(candidate.id, 'model.id'),
      label: requireIdentity(candidate.label, 'model.label'),
      providerId: requireIdentity(candidate.providerId, 'model.providerId'),
      modelId: requireIdentity(candidate.modelId, 'model.modelId'),
      providerLabel: requireIdentity(candidate.providerLabel, 'model.providerLabel'),
      category: parseModelType(candidate.category),
      capabilities: candidate.capabilities.map((capability) =>
        requireIdentity(capability, 'model.capability'),
      ),
    };
  });
  const modelIds = new Set<string>();
  for (const model of models) {
    if (modelIds.has(model.id)) {
      throw new Error(`DSH composer model option '${model.id}' is duplicated.`);
    }
    modelIds.add(model.id);
  }
  const permissionPresets = record.permissionPresets.map((preset) => {
    const candidate = requireRecord(preset, 'DSH composer permission preset option');
    requireAllowedKeys(
      candidate,
      ['id', 'label', 'description', 'selectable'],
      ['id', 'label', 'selectable'],
    );
    return {
      id: requireIdentity(candidate.id, 'permissionPreset.id'),
      label: requireIdentity(candidate.label, 'permissionPreset.label'),
      selectable: requireBoolean(candidate.selectable, 'permissionPreset.selectable'),
      ...(candidate.description === undefined
        ? {}
        : { description: requireIdentity(candidate.description, 'permissionPreset.description') }),
    };
  });
  const permissionPresetIds = new Set<string>();
  for (const preset of permissionPresets) {
    if (permissionPresetIds.has(preset.id)) {
      throw new Error(`DSH composer permission preset '${preset.id}' is duplicated.`);
    }
    permissionPresetIds.add(preset.id);
  }
  const selectedModelOptionId =
    record.selectedModelOptionId === undefined
      ? undefined
      : requireIdentity(record.selectedModelOptionId, 'selectedModelOptionId');
  if (selectedModelOptionId !== undefined && !modelIds.has(selectedModelOptionId)) {
    throw new Error(
      `DSH composer selected model '${selectedModelOptionId}' is not in the projected catalog.`,
    );
  }
  const permissionPresetId = requireIdentity(record.permissionPresetId, 'permissionPresetId');
  if (!permissionPresetIds.has(permissionPresetId)) {
    throw new Error(`DSH composer permission preset '${permissionPresetId}' is not projected.`);
  }
  const selectedMediaModelOptionIds = parseSelectedMediaModelOptionIds(
    record.selectedMediaModelOptionIds,
    models,
  );
  return {
    models,
    ...(selectedModelOptionId === undefined ? {} : { selectedModelOptionId }),
    selectedMediaModelOptionIds,
    permissionPresetId,
    permissionPresets,
    ...(record.context === undefined ? {} : { context: parseComposerContext(record.context) }),
    ...(record.inputCatalog === undefined
      ? {}
      : {
          inputCatalog: decodeDshAcpInputCatalogProjection(
            requireRecord(record.inputCatalog, 'DSH composer input catalog'),
          ),
        }),
    ...(record.inputCatalogDiagnostic === undefined
      ? {}
      : {
          inputCatalogDiagnostic: requireIdentity(
            record.inputCatalogDiagnostic,
            'inputCatalogDiagnostic',
          ),
        }),
    ...(record.diagnostic === undefined
      ? {}
      : { diagnostic: requireIdentity(record.diagnostic, 'diagnostic') }),
  };
}

export function parseDshComposerMentionsHostResult(
  value: unknown,
  expectedRequestId: string,
): DshComposerMentionsHostResult {
  const record = requireRecord(value, 'DSH composer mentions result');
  requireExactKeys(record, ['requestId', 'mentions']);
  const requestId = requireIdentity(record.requestId, 'requestId');
  if (requestId !== expectedRequestId) {
    throw new Error(
      `DSH composer mentions result '${requestId}' does not match '${expectedRequestId}'.`,
    );
  }
  if (!Array.isArray(record.mentions)) {
    throw new Error('DSH composer mentions must be an array.');
  }
  decodeDshAcpJsonPayload(record.mentions, 'composer mentions');
  const mentions = record.mentions.map((value, index): DshComposerMentionProjection => {
    const mention = requireRecord(value, `DSH composer mention[${index}]`);
    requireAllowedKeys(
      mention,
      [
        'id',
        'kind',
        'label',
        'description',
        'contentLocator',
        'contextPayload',
        'source',
        'mediaType',
      ],
      ['id', 'kind', 'label', 'source'],
    );
    if (
      mention.kind !== 'file' &&
      mention.kind !== 'media' &&
      mention.kind !== 'asset' &&
      mention.kind !== 'entity' &&
      mention.kind !== 'canvas-node' &&
      mention.kind !== 'character' &&
      mention.kind !== 'scene'
    ) {
      throw new Error(`DSH composer mention[${index}] kind is unsupported.`);
    }
    if (
      mention.source !== 'workspace' &&
      mention.source !== 'media-library' &&
      mention.source !== 'entity-graph' &&
      mention.source !== 'story' &&
      mention.source !== 'canvas'
    ) {
      throw new Error(`DSH composer mention[${index}] source is unsupported.`);
    }
    const locator =
      mention.contentLocator === undefined
        ? undefined
        : validateContentLocator(mention.contentLocator);
    if (locator !== undefined && !locator.ok) {
      throw new Error(`DSH composer mention[${index}] ContentLocator is invalid.`);
    }
    const contextPayload =
      mention.contextPayload === undefined
        ? undefined
        : parseAgentContextPayload(mention.contextPayload, `mention[${index}].contextPayload`);
    if ((locator === undefined) === (contextPayload === undefined)) {
      throw new Error(
        `DSH composer mention[${index}] requires exactly one ContentLocator or context payload.`,
      );
    }
    if ((mention.kind === 'file' || mention.kind === 'media') !== (locator !== undefined)) {
      throw new Error(`DSH composer mention[${index}] kind does not match its resource receipt.`);
    }
    const mediaType =
      mention.mediaType === undefined
        ? undefined
        : parseComposerMentionMediaType(mention.mediaType);
    return {
      id: requireIdentity(mention.id, `mention[${index}].id`),
      kind: mention.kind,
      label: requireIdentity(mention.label, `mention[${index}].label`),
      ...(mention.description === undefined
        ? {}
        : { description: requireIdentity(mention.description, `mention[${index}].description`) }),
      source: mention.source,
      ...(locator === undefined ? {} : { contentLocator: locator.locator }),
      ...(contextPayload === undefined ? {} : { contextPayload }),
      ...(mediaType === undefined ? {} : { mediaType }),
    };
  });
  const ids = new Set<string>();
  for (const mention of mentions) {
    if (ids.has(mention.id)) throw new Error(`DSH composer mention '${mention.id}' is duplicated.`);
    ids.add(mention.id);
  }
  return { requestId, mentions };
}

function parseComposerMentionMediaType(
  value: unknown,
): 'video' | 'audio' | 'image' | 'text' | 'document' {
  if (
    value === 'video' ||
    value === 'audio' ||
    value === 'image' ||
    value === 'text' ||
    value === 'document'
  ) {
    return value;
  }
  throw new Error(`DSH composer mention media type '${String(value)}' is unsupported.`);
}

function parseComposerSubmitInput(value: unknown): DshComposerSubmitInput {
  const record = requireRecord(value, 'DSH Composer submit input');
  if (record.kind === 'message') {
    requireExactKeys(record, ['kind', 'text', 'references', 'contextPayloads']);
    if (!Array.isArray(record.references)) {
      throw new Error('DSH Composer message references must be an array.');
    }
    const references = record.references.map((candidate, index) => {
      const reference = requireRecord(candidate, `DSH Composer reference[${index}]`);
      requireExactKeys(reference, ['label', 'contentLocator']);
      const locator = validateContentLocator(reference.contentLocator);
      if (!locator.ok) {
        throw new Error(`DSH Composer reference[${index}] ContentLocator is invalid.`);
      }
      return {
        label: requireIdentity(reference.label, `reference[${index}].label`),
        contentLocator: locator.locator,
      };
    });
    const text = requireString(record.text, 'message text');
    if (!Array.isArray(record.contextPayloads)) {
      throw new Error('DSH Composer message context payloads must be an array.');
    }
    decodeDshAcpJsonPayload(record.contextPayloads, 'message context payloads');
    const contextPayloads = record.contextPayloads.map((payload, index) =>
      parseAgentContextPayload(payload, `contextPayloads[${index}]`),
    );
    if (contextPayloads.length > 32) {
      throw new Error('DSH Composer message context payloads exceed the limit of 32.');
    }
    const contextIds = new Set<string>();
    for (const payload of contextPayloads) {
      if (contextIds.has(payload.id)) {
        throw new Error(`DSH Composer context payload '${payload.id}' is duplicated.`);
      }
      contextIds.add(payload.id);
    }
    if (text.trim().length === 0 && references.length === 0 && contextPayloads.length === 0) {
      throw new Error('DSH Composer message requires text or an authorized reference/context.');
    }
    return { kind: 'message', text, references, contextPayloads };
  }
  if (record.kind === 'command') {
    requireExactKeys(record, ['kind', 'line']);
    const line = requireIdentity(record.line, 'command line');
    if (!line.startsWith('/')) throw new Error("DSH Composer command must start with '/'.");
    return { kind: 'command', line };
  }
  if (record.kind === 'skill') {
    requireAllowedKeys(
      record,
      ['kind', 'skillName', 'displayText', 'args'],
      ['kind', 'skillName', 'displayText'],
    );
    return {
      kind: 'skill',
      skillName: requireIdentity(record.skillName, 'Skill name'),
      displayText: requireIdentity(record.displayText, 'Skill display text'),
      ...(record.args === undefined ? {} : { args: requireIdentity(record.args, 'Skill args') }),
    };
  }
  throw new Error(`DSH Composer submit kind '${String(record.kind)}' is unsupported.`);
}

function parseAgentContextPayload(value: unknown, field: string): AgentContextPayload {
  const record = requireRecord(value, `DSH Composer ${field}`);
  requireAllowedKeys(
    record,
    ['type', 'id', 'label', 'summary', 'data', 'intent'],
    ['type', 'id', 'label', 'summary', 'data'],
  );
  if (!isAgentContextType(record.type)) {
    throw new Error(`DSH Composer ${field}.type is unsupported.`);
  }
  return {
    type: record.type,
    id: requireIdentity(record.id, `${field}.id`),
    label: requireIdentity(record.label, `${field}.label`),
    summary: requireIdentity(record.summary, `${field}.summary`),
    data: decodeDshAcpJsonPayload(record.data, `${field}.data`),
    ...(record.intent === undefined
      ? {}
      : { intent: requireIdentity(record.intent, `${field}.intent`) }),
  };
}

function parseModelType(value: unknown): ModelType {
  if (value === 'llm' || value === 'image' || value === 'video' || value === 'audio') return value;
  throw new Error(`DSH composer model category '${String(value)}' is unsupported.`);
}

function parseSelectedMediaModelOptionIds(
  value: unknown,
  models: readonly DshComposerModelOption[],
): DshComposerConfigurationProjection['selectedMediaModelOptionIds'] {
  const record = requireRecord(value, 'DSH composer selected media models');
  requireAllowedKeys(record, ['image', 'video', 'audio'], []);
  const result: Partial<Record<'image' | 'video' | 'audio', string>> = {};
  for (const category of ['image', 'video', 'audio'] as const) {
    if (record[category] === undefined) continue;
    const modelOptionId = requireIdentity(
      record[category],
      `selectedMediaModelOptionIds.${category}`,
    );
    if (!models.some((model) => model.id === modelOptionId && model.category === category)) {
      throw new Error(
        `DSH composer selected ${category} model '${modelOptionId}' is not in that projected catalog.`,
      );
    }
    result[category] = modelOptionId;
  }
  return result;
}

function parseComposerContext(value: unknown): DshComposerContextProjection {
  const record = requireRecord(value, 'DSH composer context');
  requireExactKeys(record, ['kind', 'workspaceId', 'workspaceLabel', 'canvas']);
  if (record.kind !== 'workspace') {
    throw new Error(`DSH composer context kind '${String(record.kind)}' is unsupported.`);
  }
  const canvas = requireRecord(record.canvas, 'DSH composer Canvas context');
  requireExactKeys(canvas, ['kind', 'label']);
  if (canvas.kind !== 'workspace-board') {
    throw new Error(`DSH composer Canvas context kind '${String(canvas.kind)}' is unsupported.`);
  }
  return {
    kind: 'workspace',
    workspaceId: requireIdentity(record.workspaceId, 'context.workspaceId'),
    workspaceLabel: requireIdentity(record.workspaceLabel, 'context.workspaceLabel'),
    canvas: {
      kind: 'workspace-board',
      label: requireIdentity(canvas.label, 'context.canvas.label'),
    },
  };
}

export function parseDshSessionHostResult(
  value: unknown,
  expectedRequestId: string,
): DshSessionHostResult {
  const record = requireRecord(value, 'DSH Session result');
  requireAllowedKeys(
    record,
    ['requestId', 'projection', 'stopReason'],
    ['requestId', 'projection'],
  );
  const requestId = requireIdentity(record.requestId, 'requestId');
  if (requestId !== expectedRequestId) {
    throw new Error(`DSH Session result '${requestId}' does not match '${expectedRequestId}'.`);
  }
  return {
    requestId,
    projection: parseDshSessionHostProjection(record.projection),
    ...(record.stopReason === undefined
      ? {}
      : { stopReason: requireIdentity(record.stopReason, 'stopReason') }),
  };
}

export function parseDshSessionChangedEvent(value: unknown): DshSessionChangedEvent {
  const record = requireRecord(value, 'DSH Session changed event');
  requireExactKeys(record, ['conversationId']);
  return { conversationId: requireIdentity(record.conversationId, 'conversationId') };
}

export function parseDshSessionHostProjection(value: unknown): DshSessionHostProjection {
  const record = requireRecord(value, 'DSH Session projection');
  requireAllowedKeys(
    record,
    ['conversationId', 'dshSessionId', 'currentTurn', 'events'],
    ['conversationId', 'dshSessionId', 'events'],
  );
  if (!Array.isArray(record.events)) throw new Error('DSH Session events must be an array.');
  return {
    conversationId: requireIdentity(record.conversationId, 'conversationId'),
    dshSessionId: requireIdentity(record.dshSessionId, 'dshSessionId'),
    ...(record.currentTurn === undefined
      ? {}
      : { currentTurn: requireNonNegativeInteger(record.currentTurn, 'currentTurn') }),
    events: record.events.map(parseEvent),
  };
}

function parseEvent(value: unknown): DshSessionHostEvent {
  const record = requireRecord(value, 'DSH Session event');
  if (record.kind === 'message') {
    if (record.role === 'user') {
      requireAllowedKeys(record, ['kind', 'role', 'text', 'messageId'], ['kind', 'role', 'text']);
      return {
        kind: 'message',
        role: 'user',
        text: requireIdentity(record.text, 'event.text'),
        ...(record.messageId === undefined
          ? {}
          : { messageId: requireIdentity(record.messageId, 'event.messageId') }),
      };
    }
    if (record.role !== 'assistant') throw new Error('DSH Session message role is unsupported.');
    requireExactKeys(record, ['kind', 'role', 'turn', 'step', 'text', 'messageId', 'state']);
    return {
      kind: 'message',
      role: 'assistant',
      turn: requireNonNegativeInteger(record.turn, 'event.turn'),
      step: requireNonNegativeInteger(record.step, 'event.step'),
      text: requireIdentity(record.text, 'event.text'),
      messageId: requireIdentity(record.messageId, 'event.messageId'),
      state: parseAssistantOutputState(record.state),
    };
  }
  if (record.kind === 'thought') {
    requireExactKeys(record, ['kind', 'turn', 'step', 'text', 'messageId', 'state']);
    return {
      kind: 'thought',
      turn: requireNonNegativeInteger(record.turn, 'event.turn'),
      step: requireNonNegativeInteger(record.step, 'event.step'),
      text: requireIdentity(record.text, 'event.text'),
      messageId: requireIdentity(record.messageId, 'event.messageId'),
      state: parseAssistantOutputState(record.state),
    };
  }
  if (record.kind === 'tool') {
    requireAllowedKeys(
      record,
      ['kind', 'toolCallId', 'turn', 'status', 'title', 'rawInput', 'rawOutput'],
      ['kind', 'toolCallId', 'turn', 'status'],
    );
    const status = record.status;
    if (
      status !== 'pending' &&
      status !== 'in_progress' &&
      status !== 'completed' &&
      status !== 'failed'
    ) {
      throw new Error('DSH Session Tool status is unsupported.');
    }
    return {
      kind: 'tool',
      toolCallId: requireIdentity(record.toolCallId, 'event.toolCallId'),
      turn: requireNonNegativeInteger(record.turn, 'event.turn'),
      status,
      ...(record.title === undefined
        ? {}
        : { title: requireIdentity(record.title, 'event.title') }),
      ...(record.rawInput === undefined
        ? {}
        : { rawInput: decodeDshAcpJsonPayload(record.rawInput, 'event.rawInput') }),
      ...(record.rawOutput === undefined
        ? {}
        : { rawOutput: decodeDshAcpJsonPayload(record.rawOutput, 'event.rawOutput') }),
    };
  }
  if (record.kind === 'command') {
    requireAllowedKeys(
      record,
      ['kind', 'commandId', 'name', 'args', 'status', 'text'],
      ['kind', 'commandId', 'name', 'status'],
    );
    if (
      record.status !== 'running' &&
      record.status !== 'completed' &&
      record.status !== 'failed'
    ) {
      throw new Error('DSH Session command status is unsupported.');
    }
    return {
      kind: 'command',
      commandId: requireIdentity(record.commandId, 'event.commandId'),
      name: requireIdentity(record.name, 'event.name'),
      ...(record.args === undefined ? {} : { args: requireString(record.args, 'event.args') }),
      status: record.status,
      ...(record.text === undefined ? {} : { text: requireIdentity(record.text, 'event.text') }),
    };
  }
  if (record.kind === 'turn') {
    if (record.phase === 'start') {
      requireAllowedKeys(
        record,
        ['kind', 'turn', 'phase', 'startedAt'],
        ['kind', 'turn', 'phase', 'startedAt'],
      );
      return {
        kind: 'turn',
        turn: requireNonNegativeInteger(record.turn, 'event.turn'),
        phase: 'start',
        startedAt: requireNonNegativeInteger(record.startedAt, 'event.startedAt'),
      };
    }
    if (record.phase !== 'end') throw new Error('DSH Session turn phase is unsupported.');
    requireAllowedKeys(
      record,
      ['kind', 'turn', 'phase', 'startedAt', 'completedAt', 'reason'],
      ['kind', 'turn', 'phase', 'startedAt', 'completedAt'],
    );
    const startedAt = requireNonNegativeInteger(record.startedAt, 'event.startedAt');
    const completedAt = requireNonNegativeInteger(record.completedAt, 'event.completedAt');
    if (completedAt < startedAt) {
      throw new Error('DSH Session turn completedAt must not precede startedAt.');
    }
    return {
      kind: 'turn',
      turn: requireNonNegativeInteger(record.turn, 'event.turn'),
      phase: 'end',
      startedAt,
      completedAt,
      ...(record.reason === undefined
        ? {}
        : { reason: requireIdentity(record.reason, 'event.reason') }),
    };
  }
  if (record.kind === 'cancel') {
    requireAllowedKeys(record, ['kind', 'turn', 'toolCallId'], ['kind']);
    return {
      kind: 'cancel',
      ...(record.turn === undefined
        ? {}
        : { turn: requireNonNegativeInteger(record.turn, 'event.turn') }),
      ...(record.toolCallId === undefined
        ? {}
        : { toolCallId: requireIdentity(record.toolCallId, 'event.toolCallId') }),
    };
  }
  if (record.kind === 'diagnostic') {
    requireExactKeys(record, ['kind', 'code', 'message']);
    return {
      kind: 'diagnostic',
      code: requireIdentity(record.code, 'event.code'),
      message: requireIdentity(record.message, 'event.message'),
    };
  }
  throw new Error(`DSH Session event kind '${String(record.kind)}' is unsupported.`);
}

function parseAssistantOutputState(value: unknown): 'streaming' | 'final' {
  if (value === 'streaming' || value === 'final') return value;
  throw new Error(`DSH Session assistant output state '${String(value)}' is unsupported.`);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireIdentity(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`DSH Session ${field} must be a non-empty string.`);
  }
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`DSH Session ${field} must be a string.`);
  return value;
}

function requireNonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`DSH Session ${field} must be a non-negative safe integer.`);
  }
  return value as number;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`DSH Session ${field} must be a boolean.`);
  return value;
}

function requireExactKeys(record: Record<string, unknown>, keys: readonly string[]): void {
  requireAllowedKeys(record, keys, keys);
}

function requireAllowedKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
): void {
  const allowed = new Set(allowedKeys);
  const unexpected = Object.keys(record).filter((key) => !allowed.has(key));
  const missing = requiredKeys.filter((key) => !Object.hasOwn(record, key));
  if (unexpected.length > 0 || missing.length > 0) {
    throw new Error(
      `DSH Session contract keys mismatch; missing=${missing.join(',')}; unexpected=${unexpected.join(',')}.`,
    );
  }
}
