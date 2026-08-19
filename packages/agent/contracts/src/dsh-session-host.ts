import { decodeDshAcpJsonPayload, type DshAcpJsonValue } from './dsh-acp';
import type { ModelType } from '@neko/ai-contracts';

export const DSH_SESSION_HOST_CHANNEL = 'openneko:dsh:session';
export const DSH_SESSION_CHANGED_CHANNEL = 'openneko:dsh:session:changed';

export type DshSessionHostEvent =
  | {
      readonly kind: 'message';
      readonly role: 'user' | 'assistant';
      readonly text: string;
      readonly messageId?: string;
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
      readonly kind: 'turn';
      readonly turn: number;
      readonly phase: 'start' | 'end';
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
  readonly diagnostic?: string;
}

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
  | (DshSessionHostConversationRequest & { readonly operation: 'prompt'; readonly text: string })
  | (DshSessionHostConversationRequest & { readonly operation: 'cancel' })
  | (DshSessionHostSenderRequest & {
      readonly operation: 'composer-snapshot';
      readonly workbenchInstanceId: string;
      readonly agentSurfaceId: string;
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
    prompt(conversationId: string, text: string): Promise<DshSessionHostResult>;
    cancel(conversationId: string): Promise<DshSessionHostProjection>;
    getComposerConfiguration(
      workbenchInstanceId: string,
      agentSurfaceId: string,
    ): Promise<DshComposerConfigurationProjection>;
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
  if (record.operation === 'prompt') {
    requireExactKeys(record, [
      'requestId',
      'operation',
      'windowId',
      'rendererSessionId',
      'conversationId',
      'text',
    ]);
    return {
      ...base,
      operation: 'prompt',
      conversationId,
      text: requireIdentity(record.text, 'text'),
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
    ...(record.diagnostic === undefined
      ? {}
      : { diagnostic: requireIdentity(record.diagnostic, 'diagnostic') }),
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
    requireAllowedKeys(record, ['kind', 'role', 'text', 'messageId'], ['kind', 'role', 'text']);
    if (record.role !== 'user' && record.role !== 'assistant') {
      throw new Error('DSH Session message role is unsupported.');
    }
    return {
      kind: 'message',
      role: record.role,
      text: requireIdentity(record.text, 'event.text'),
      ...(record.messageId === undefined
        ? {}
        : { messageId: requireIdentity(record.messageId, 'event.messageId') }),
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
  if (record.kind === 'turn') {
    requireAllowedKeys(record, ['kind', 'turn', 'phase', 'reason'], ['kind', 'turn', 'phase']);
    if (record.phase !== 'start' && record.phase !== 'end') {
      throw new Error('DSH Session turn phase is unsupported.');
    }
    return {
      kind: 'turn',
      turn: requireNonNegativeInteger(record.turn, 'event.turn'),
      phase: record.phase,
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
