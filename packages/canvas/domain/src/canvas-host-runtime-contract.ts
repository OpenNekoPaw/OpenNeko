import { validateContentLocator, type ContentLocator } from '@neko/content';
import {
  isCanvasMaterialActionDescriptor,
  isCanvasMaterialActionIntent,
  isCanvasMaterialAuthoringRequest,
  type CanvasMaterialActionDescriptor,
  type CanvasMaterialActionIntent,
  type CanvasMaterialAuthoringRequest,
} from './types/canvas-material-contracts';
import { isValidNkc } from './nkc/codec';
import { type CanvasData } from './types/canvas';
import {
  CANVAS_GENERATION_PURPOSES,
  isCanvasGenerationKind,
  isCanvasGenerationRecipe,
  type CanvasGenerationKind,
  type CanvasGenerationModelBinding,
  type CanvasGenerationPurpose,
  type CanvasGenerationRecipe,
} from './types/canvas-generation-node';
import type { CanvasGenerationRuntimeProjection } from './canvas-generation-application-port';

export function createCanvasHostSessionId(viewId: string, viewInstanceId: string): string {
  requireNonEmptyString(viewId, 'Canvas Host View identity is required.');
  requireNonEmptyString(viewInstanceId, 'Canvas Host View instance identity is required.');
  return `canvas-session:${viewId}:${viewInstanceId}`;
}

export const CANVAS_HOST_RUNTIME_ROUTES = {
  snapshotGet: 'snapshot.get',
  materialActionsResolve: 'material-actions.resolve',
  intentExecute: 'intent.execute',
  projectionEvent: 'projection.event',
} as const;

export type CanvasHostRuntimeRoute =
  (typeof CANVAS_HOST_RUNTIME_ROUTES)[keyof typeof CANVAS_HOST_RUNTIME_ROUTES];

export interface CanvasHostRuntimeIdentity {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly windowId: string;
  readonly viewId: string;
  readonly viewInstanceId: string;
  readonly documentId: string;
  readonly sessionId: string;
  readonly rendererSessionId: string;
}

export interface CanvasHostPresentationState {
  readonly viewport: {
    readonly pan: { readonly x: number; readonly y: number };
    readonly zoom: number;
  };
  readonly selectedNodeIds: readonly string[];
}

export interface CanvasHostAuthoringCapabilities {
  readonly sourceModes: readonly ('import' | 'reference')[];
  readonly generationKinds: readonly CanvasGenerationKind[];
  readonly generationModels: readonly CanvasGenerationModelOption[];
}

export interface CanvasGenerationModelOption {
  readonly binding: CanvasGenerationModelBinding;
  readonly label: string;
  readonly providerLabel: string;
  readonly isDefault: boolean;
}

export interface CanvasHostSnapshot {
  readonly identity: CanvasHostRuntimeIdentity;
  readonly dirty: boolean;
  readonly canvas: CanvasData;
  readonly presentation: CanvasHostPresentationState;
  /** Runtime-only add-surface capabilities rebuilt from executable Host effects. */
  readonly authoringCapabilities: CanvasHostAuthoringCapabilities;
  /** Runtime-only projections rebuilt from authoritative Generation Jobs. */
  readonly generationNodes: readonly CanvasGenerationRuntimeProjection[];
}

export interface CanvasMaterialActionResolutionRequest {
  readonly requestId: string;
  readonly identity: CanvasHostRuntimeIdentity;
  readonly selectedNodeIds: readonly string[];
}

export interface CanvasMaterialActionResolution {
  readonly requestId: string;
  readonly identity: CanvasHostRuntimeIdentity;
  readonly selectedNodeIds: readonly string[];
  readonly descriptors: readonly CanvasMaterialActionDescriptor[];
}

export type CanvasHostIntent =
  | {
      readonly type: 'replace-document';
      readonly canvas: CanvasData;
    }
  | {
      readonly type: 'save' | 'undo' | 'redo';
    }
  | {
      readonly type: 'author-material';
      readonly request: CanvasMaterialAuthoringRequest;
    }
  | {
      readonly type: 'request-source';
      readonly sourceKind: 'image' | 'video' | 'audio' | 'model' | 'document' | 'canvas';
      readonly sourceMode: 'import' | 'reference';
      readonly position?: { readonly x: number; readonly y: number };
    }
  | {
      readonly type: 'create-generation-node';
      readonly kind: CanvasGenerationKind;
      readonly position?: { readonly x: number; readonly y: number };
    }
  | {
      readonly type: 'attach-generation-reference';
      readonly nodeId: string;
      readonly sourceKind: 'image' | 'video' | 'audio' | 'document';
      readonly sourceMode: 'import' | 'reference';
    }
  | {
      readonly type: 'attach-generation-reference-material';
      readonly nodeId: string;
      readonly request: Extract<
        CanvasMaterialAuthoringRequest,
        { readonly kind: 'direct-reference' }
      >;
    }
  | {
      readonly type: 'update-generation-recipe';
      readonly nodeId: string;
      readonly recipe: CanvasGenerationRecipe;
    }
  | {
      readonly type: 'run-generation-node' | 'cancel-generation-node';
      readonly nodeId: string;
    }
  | {
      readonly type: 'select-generation-output';
      readonly nodeId: string;
      readonly outputId: string;
    }
  | {
      readonly type: 'author-generation-text';
      readonly nodeId: string;
      readonly text: string;
    }
  | {
      readonly type: 'preview-resource' | 'reveal-resource';
      readonly locator: ContentLocator;
    }
  | {
      readonly type: 'execute-material-action';
      readonly action: CanvasMaterialActionIntent;
    }
  | {
      readonly type: 'update-presentation';
      readonly presentation: CanvasHostPresentationState;
    };

export interface CanvasHostIntentRequest {
  readonly requestId: string;
  readonly commandId: string;
  readonly identity: CanvasHostRuntimeIdentity;
  readonly intent: CanvasHostIntent;
}

export type CanvasHostIntentResult =
  | {
      readonly requestId: string;
      readonly commandId: string;
      readonly status: 'accepted';
      readonly snapshot: CanvasHostSnapshot;
    }
  | {
      readonly requestId: string;
      readonly commandId: string;
      readonly status: 'rejected';
      readonly diagnostic: {
        readonly code:
          | 'canvas-runtime-stale-identity'
          | 'canvas-runtime-unsupported-intent'
          | 'canvas-runtime-source-cancelled'
          | 'canvas-runtime-effect-failed';
        readonly message: string;
      };
    };

export interface CanvasHostProjectionEvent {
  readonly sequence: number;
  /** Present when this projection was produced by an accepted Host intent. */
  readonly originCommandId?: string;
  readonly snapshot: CanvasHostSnapshot;
}

export interface CanvasHostRuntime {
  readonly identity: CanvasHostRuntimeIdentity;
  getSnapshot(): Promise<CanvasHostSnapshot>;
  resolveMaterialActions(
    request: CanvasMaterialActionResolutionRequest,
  ): Promise<CanvasMaterialActionResolution>;
  subscribe(listener: (event: CanvasHostProjectionEvent) => void): () => void;
  executeIntent(request: CanvasHostIntentRequest): Promise<CanvasHostIntentResult>;
  /** Releases runtime-local listeners. Owner-managed remote sessions may omit this hook. */
  dispose?(): void;
}

export function createCanvasMaterialActionResolutionRequest(input: {
  readonly requestId: string;
  readonly identity: CanvasHostRuntimeIdentity;
  readonly selectedNodeIds: readonly string[];
}): CanvasMaterialActionResolutionRequest {
  return parseCanvasMaterialActionResolutionRequest(input);
}

export function parseCanvasMaterialActionResolutionRequest(
  value: unknown,
): CanvasMaterialActionResolutionRequest {
  const record = requireRecord(
    value,
    'Canvas material action resolution request must be an object.',
  );
  requireExactKeys(record, ['requestId', 'identity', 'selectedNodeIds']);
  return {
    requestId: requireOpaqueIdentity(
      record['requestId'],
      'Canvas material action resolution request identity is required.',
    ),
    identity: parseCanvasHostRuntimeIdentity(record['identity']),
    selectedNodeIds: parseSelectedNodeIds(record['selectedNodeIds']),
  };
}

export function parseCanvasMaterialActionResolution(
  value: unknown,
  expectedRequestId: string,
): CanvasMaterialActionResolution {
  const record = requireRecord(value, 'Canvas material action resolution must be an object.');
  requireExactKeys(record, ['requestId', 'identity', 'selectedNodeIds', 'descriptors']);
  return {
    requestId: requireMatchingIdentity(
      record['requestId'],
      expectedRequestId,
      'Canvas material action resolution request identity does not match.',
    ),
    identity: parseCanvasHostRuntimeIdentity(record['identity']),
    selectedNodeIds: parseSelectedNodeIds(record['selectedNodeIds']),
    descriptors: parseCanvasMaterialActionDescriptors(record['descriptors']),
  };
}

export class CanvasHostRuntimeContractError extends Error {
  readonly code: 'invalid-canvas-host-runtime-payload' | 'canvas-host-runtime-stale-identity';

  constructor(code: CanvasHostRuntimeContractError['code'], message: string) {
    super(message);
    this.name = 'CanvasHostRuntimeContractError';
    this.code = code;
  }
}

export function createCanvasHostIntentRequest(input: {
  readonly requestId: string;
  readonly commandId: string;
  readonly identity: CanvasHostRuntimeIdentity;
  readonly intent: CanvasHostIntent;
}): CanvasHostIntentRequest {
  return parseCanvasHostIntentRequest(input);
}

export function parseCanvasHostIntentRequest(value: unknown): CanvasHostIntentRequest {
  const record = requireRecord(value, 'Canvas Host intent request must be an object.');
  requireExactKeys(record, ['requestId', 'commandId', 'identity', 'intent']);
  return {
    requestId: requireNonEmptyString(
      record['requestId'],
      'Canvas Host request identity is required.',
    ),
    commandId: requireOpaqueIdentity(
      record['commandId'],
      'Canvas Host command identity is required.',
    ),
    identity: parseCanvasHostRuntimeIdentity(record['identity']),
    intent: parseCanvasHostIntent(record['intent']),
  };
}

export function parseCanvasHostSnapshot(value: unknown): CanvasHostSnapshot {
  const record = requireRecord(value, 'Canvas Host snapshot must be an object.');
  requireExactKeys(record, [
    'identity',
    'dirty',
    'canvas',
    'presentation',
    'authoringCapabilities',
    'generationNodes',
  ]);
  const canvas = record['canvas'];
  if (!isValidNkc(canvas)) {
    throw invalidPayload('Canvas Host snapshot does not contain a valid .nkc document.');
  }
  return {
    identity: parseCanvasHostRuntimeIdentity(record['identity']),
    dirty: requireBoolean(record['dirty'], 'Canvas Host dirty state is invalid.'),
    canvas,
    presentation: parseCanvasHostPresentationState(record['presentation']),
    authoringCapabilities: parseCanvasHostAuthoringCapabilities(record['authoringCapabilities']),
    generationNodes: requireArray(
      record['generationNodes'],
      'Canvas Host Generation node projections must be an array.',
    ).map(parseCanvasGenerationRuntimeProjection),
  };
}

export function parseCanvasHostProjectionEvent(value: unknown): CanvasHostProjectionEvent {
  const record = requireRecord(value, 'Canvas Host projection event must be an object.');
  requireExactKeys(record, ['sequence', 'originCommandId', 'snapshot']);
  const originCommandId = record['originCommandId'];
  return {
    sequence: requirePositiveInteger(
      record['sequence'],
      'Canvas Host projection event sequence must be a positive integer.',
    ),
    ...(originCommandId === undefined
      ? {}
      : {
          originCommandId: requireOpaqueIdentity(
            originCommandId,
            'Canvas Host projection origin command identity is invalid.',
          ),
        }),
    snapshot: parseCanvasHostSnapshot(record['snapshot']),
  };
}

export function parseCanvasHostIntentResult(
  value: unknown,
  expectedRequestId: string,
  expectedCommandId: string,
): CanvasHostIntentResult {
  const record = requireRecord(value, 'Canvas Host intent result must be an object.');
  const requestId = requireMatchingIdentity(
    record['requestId'],
    expectedRequestId,
    'Canvas Host response request identity does not match.',
  );
  const commandId = requireMatchingIdentity(
    record['commandId'],
    expectedCommandId,
    'Canvas Host response command identity does not match.',
  );
  if (record['status'] === 'accepted') {
    requireExactKeys(record, ['requestId', 'commandId', 'status', 'snapshot']);
    return {
      requestId,
      commandId,
      status: 'accepted',
      snapshot: parseCanvasHostSnapshot(record['snapshot']),
    };
  }
  if (record['status'] !== 'rejected') {
    throw invalidPayload('Canvas Host intent result status is invalid.');
  }
  requireExactKeys(record, ['requestId', 'commandId', 'status', 'diagnostic']);
  const diagnostic = requireRecord(
    record['diagnostic'],
    'Canvas Host rejected result diagnostic is required.',
  );
  return {
    requestId,
    commandId,
    status: 'rejected',
    diagnostic: {
      code: requireDiagnosticCode(diagnostic['code']),
      message: requireNonEmptyString(
        diagnostic['message'],
        'Canvas Host diagnostic message is required.',
      ),
    },
  };
}

export function assertCanvasHostRuntimeIdentity(
  expected: CanvasHostRuntimeIdentity,
  actual: CanvasHostRuntimeIdentity,
): void {
  const matches =
    expected.projectId === actual.projectId &&
    expected.workspaceId === actual.workspaceId &&
    expected.windowId === actual.windowId &&
    expected.viewId === actual.viewId &&
    expected.viewInstanceId === actual.viewInstanceId &&
    expected.documentId === actual.documentId &&
    expected.sessionId === actual.sessionId &&
    expected.rendererSessionId === actual.rendererSessionId;
  if (!matches) {
    throw new CanvasHostRuntimeContractError(
      'canvas-host-runtime-stale-identity',
      'Canvas Host identity is stale or belongs to another document session.',
    );
  }
}

function parseCanvasHostRuntimeIdentity(value: unknown): CanvasHostRuntimeIdentity {
  const record = requireRecord(value, 'Canvas Host runtime identity is required.');
  return {
    projectId: requireOpaqueIdentity(
      record['projectId'],
      'Canvas Host Project identity is required.',
    ),
    workspaceId: requireOpaqueIdentity(
      record['workspaceId'],
      'Canvas Host Workspace identity is required.',
    ),
    windowId: requireOpaqueIdentity(record['windowId'], 'Canvas Host Window identity is required.'),
    viewId: requireOpaqueIdentity(record['viewId'], 'Canvas Host View identity is required.'),
    viewInstanceId: requireNonEmptyString(
      record['viewInstanceId'],
      'Canvas Host View instance identity is required.',
    ),
    documentId: requireOpaqueIdentity(
      record['documentId'],
      'Canvas Host document identity is required.',
    ),
    sessionId: requireOpaqueIdentity(
      record['sessionId'],
      'Canvas Host session identity is required.',
    ),
    rendererSessionId: requireOpaqueIdentity(
      record['rendererSessionId'],
      'Canvas Host renderer session identity is required.',
    ),
  };
}

function parseCanvasHostIntent(value: unknown): CanvasHostIntent {
  const record = requireRecord(value, 'Canvas Host intent must be an object.');
  const type = record['type'];
  if (type === 'replace-document') {
    const canvas = record['canvas'];
    if (!isValidNkc(canvas)) {
      throw invalidPayload('Canvas Host replace-document intent requires valid .nkc data.');
    }
    return { type, canvas };
  }
  if (type === 'save' || type === 'undo' || type === 'redo') {
    return { type };
  }
  if (type === 'author-material') {
    return {
      type,
      request: requireCanvasMaterialAuthoringRequest(record['request']),
    };
  }
  if (type === 'request-source') {
    return {
      type,
      sourceKind: requireSourceKind(record['sourceKind']),
      sourceMode: requireSourceMode(record['sourceMode']),
      ...readOptionalPosition(record['position']),
    };
  }
  if (type === 'create-generation-node') {
    requireExactKeys(record, ['type', 'kind', 'position']);
    return {
      type,
      kind: requireGenerationKind(record['kind']),
      ...readOptionalPosition(record['position']),
    };
  }
  if (type === 'attach-generation-reference') {
    requireExactKeys(record, ['type', 'nodeId', 'sourceKind', 'sourceMode']);
    const sourceKind = requireSourceKind(record['sourceKind']);
    if (sourceKind === 'model' || sourceKind === 'canvas') {
      throw invalidPayload('Canvas Generation reference source kind is invalid.');
    }
    return {
      type,
      nodeId: requireOpaqueIdentity(
        record['nodeId'],
        'Canvas Generation node identity is invalid.',
      ),
      sourceKind,
      sourceMode: requireSourceMode(record['sourceMode']),
    };
  }
  if (type === 'attach-generation-reference-material') {
    requireExactKeys(record, ['type', 'nodeId', 'request']);
    const materialRequest = requireCanvasMaterialAuthoringRequest(record['request']);
    if (materialRequest.kind !== 'direct-reference') {
      throw invalidPayload('Dropped Canvas Generation references require a direct reference.');
    }
    return {
      type,
      nodeId: requireOpaqueIdentity(
        record['nodeId'],
        'Canvas Generation node identity is invalid.',
      ),
      request: materialRequest,
    };
  }
  if (type === 'update-generation-recipe') {
    requireExactKeys(record, ['type', 'nodeId', 'recipe']);
    if (!isCanvasGenerationRecipe(record['recipe'])) {
      throw invalidPayload('Canvas Host Generation Recipe is invalid.');
    }
    return {
      type,
      nodeId: requireOpaqueIdentity(
        record['nodeId'],
        'Canvas Generation node identity is invalid.',
      ),
      recipe: structuredClone(record['recipe']),
    };
  }
  if (type === 'run-generation-node' || type === 'cancel-generation-node') {
    requireExactKeys(record, ['type', 'nodeId']);
    return {
      type,
      nodeId: requireOpaqueIdentity(
        record['nodeId'],
        'Canvas Generation node identity is invalid.',
      ),
    };
  }
  if (type === 'select-generation-output') {
    requireExactKeys(record, ['type', 'nodeId', 'outputId']);
    return {
      type,
      nodeId: requireOpaqueIdentity(
        record['nodeId'],
        'Canvas Generation node identity is invalid.',
      ),
      outputId: requireOpaqueIdentity(
        record['outputId'],
        'Canvas Generation output identity is invalid.',
      ),
    };
  }
  if (type === 'author-generation-text') {
    requireExactKeys(record, ['type', 'nodeId', 'text']);
    return {
      type,
      nodeId: requireOpaqueIdentity(
        record['nodeId'],
        'Canvas Generation node identity is invalid.',
      ),
      text: requireString(record['text'], 'Canvas Generation authored text is invalid.'),
    };
  }
  if (type === 'preview-resource' || type === 'reveal-resource') {
    return { type, locator: requireContentLocator(record['locator']) };
  }
  if (type === 'execute-material-action') {
    if (!isCanvasMaterialActionIntent(record['action'])) {
      throw invalidPayload('Canvas Host material action intent is invalid.');
    }
    return { type, action: structuredClone(record['action']) };
  }
  if (type === 'update-presentation') {
    return {
      type,
      presentation: parseCanvasHostPresentationState(record['presentation']),
    };
  }
  throw invalidPayload('Canvas Host intent type is invalid.');
}

function readOptionalPosition(value: unknown): {
  readonly position?: { readonly x: number; readonly y: number };
} {
  if (value === undefined) return {};
  const position = requireRecord(value, 'Canvas Host intent position is invalid.');
  return {
    position: {
      x: requireFiniteNumber(position['x'], 'Canvas Host intent position x is invalid.'),
      y: requireFiniteNumber(position['y'], 'Canvas Host intent position y is invalid.'),
    },
  };
}

export function parseCanvasHostPresentationState(value: unknown): CanvasHostPresentationState {
  const record = requireRecord(value, 'Canvas Host presentation state is required.');
  const viewport = requireRecord(
    record['viewport'],
    'Canvas Host presentation viewport is required.',
  );
  const pan = requireRecord(viewport['pan'], 'Canvas Host presentation pan is required.');
  return {
    viewport: {
      pan: {
        x: requireFiniteNumber(pan['x'], 'Canvas Host viewport pan x is invalid.'),
        y: requireFiniteNumber(pan['y'], 'Canvas Host viewport pan y is invalid.'),
      },
      zoom: requirePositiveNumber(viewport['zoom'], 'Canvas Host viewport zoom must be positive.'),
    },
    selectedNodeIds: parseSelectedNodeIds(record['selectedNodeIds']),
  };
}

function parseSelectedNodeIds(value: unknown): readonly string[] {
  const selectedNodeIds = requireArray(
    value,
    'Canvas Host selected node identities must be an array.',
  ).map((selectedNodeId) =>
    requireOpaqueIdentity(selectedNodeId, 'Canvas Host selected node identity is invalid.'),
  );
  if (new Set(selectedNodeIds).size !== selectedNodeIds.length) {
    throw invalidPayload('Canvas Host selected node identities must be unique.');
  }
  return selectedNodeIds;
}

function parseCanvasHostAuthoringCapabilities(value: unknown): CanvasHostAuthoringCapabilities {
  const record = requireRecord(value, 'Canvas Host authoring capabilities are required.');
  requireExactKeys(record, ['sourceModes', 'generationKinds', 'generationModels']);
  const generationModels = requireArray(
    record['generationModels'],
    'Canvas Host Generation model options must be an array.',
  ).map(parseCanvasGenerationModelOption);
  const modelKeys = generationModels.map(({ binding }) =>
    [binding.purpose, binding.providerId, binding.modelId].join('\u0000'),
  );
  if (new Set(modelKeys).size !== modelKeys.length) {
    throw invalidPayload('Canvas Host Generation model options must be unique.');
  }
  return {
    sourceModes: requireUniqueEnumArray(
      record['sourceModes'],
      ['import', 'reference'] as const,
      'Canvas Host source-mode capability',
    ),
    generationKinds: requireUniqueEnumArray(
      record['generationKinds'],
      ['prompt', 'image', 'audio', 'video'] as const,
      'Canvas Host Generation kind capability',
    ),
    generationModels,
  };
}

function parseCanvasGenerationModelOption(value: unknown): CanvasGenerationModelOption {
  const record = requireRecord(value, 'Canvas Host Generation model option must be an object.');
  requireExactKeys(record, ['binding', 'label', 'providerLabel', 'isDefault']);
  const binding = requireRecord(
    record['binding'],
    'Canvas Host Generation model binding must be an object.',
  );
  requireExactKeys(binding, ['purpose', 'providerId', 'modelId']);
  return {
    binding: {
      purpose: requireCanvasGenerationPurpose(binding['purpose']),
      providerId: requireNonEmptyString(
        binding['providerId'],
        'Canvas Host Generation provider identity is required.',
      ),
      modelId: requireNonEmptyString(
        binding['modelId'],
        'Canvas Host Generation model identity is required.',
      ),
    },
    label: requireNonEmptyString(
      record['label'],
      'Canvas Host Generation model label is required.',
    ),
    providerLabel: requireNonEmptyString(
      record['providerLabel'],
      'Canvas Host Generation provider label is required.',
    ),
    isDefault: requireBoolean(
      record['isDefault'],
      'Canvas Host Generation default-model marker is required.',
    ),
  };
}

function requireCanvasGenerationPurpose(value: unknown): CanvasGenerationPurpose {
  const purpose = CANVAS_GENERATION_PURPOSES.find((candidate) => candidate === value);
  if (!purpose) throw invalidPayload('Canvas Host Generation model purpose is invalid.');
  return purpose;
}

function requireContentLocator(value: unknown): ContentLocator {
  const result = validateContentLocator(value);
  if (!result.ok) {
    throw invalidPayload('Canvas Host intent ContentLocator is invalid or non-portable.');
  }
  return result.locator;
}

function requireUniqueEnumArray<const T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): readonly T[] {
  const values = requireArray(value, `${label} list must be an array.`);
  const parsed = values.map((entry) => {
    const match = allowed.find((candidate) => candidate === entry);
    if (!match) throw invalidPayload(`${label} value is invalid.`);
    return match;
  });
  if (new Set(parsed).size !== parsed.length) {
    throw invalidPayload(`${label} values must be unique.`);
  }
  return parsed;
}

function parseCanvasMaterialActionDescriptors(
  value: unknown,
): readonly CanvasMaterialActionDescriptor[] {
  const descriptors = requireArray(
    value,
    'Canvas Host material action descriptors must be an array.',
  );
  const ids = new Set<string>();
  return descriptors.map((descriptor) => {
    if (!isCanvasMaterialActionDescriptor(descriptor)) {
      throw invalidPayload('Canvas Host material action descriptor is invalid.');
    }
    if (ids.has(descriptor.id)) {
      throw invalidPayload(`Canvas Host material action "${descriptor.id}" is duplicated.`);
    }
    ids.add(descriptor.id);
    return structuredClone(descriptor);
  });
}

function requireCanvasMaterialAuthoringRequest(value: unknown): CanvasMaterialAuthoringRequest {
  if (!isCanvasMaterialAuthoringRequest(value)) {
    throw invalidPayload('Canvas Host material authoring request is invalid.');
  }
  return value;
}

function requireSourceKind(
  value: unknown,
): Extract<CanvasHostIntent, { readonly type: 'request-source' }>['sourceKind'] {
  const allowed = ['image', 'video', 'audio', 'model', 'document', 'canvas'] as const;
  const match = allowed.find((candidate) => candidate === value);
  if (!match) {
    throw invalidPayload('Canvas Host source kind is invalid.');
  }
  return match;
}

function requireSourceMode(
  value: unknown,
): Extract<CanvasHostIntent, { readonly type: 'request-source' }>['sourceMode'] {
  if (value !== 'import' && value !== 'reference') {
    throw invalidPayload('Canvas Host source mode is invalid.');
  }
  return value;
}

function requireGenerationKind(value: unknown): CanvasGenerationKind {
  if (!isCanvasGenerationKind(value)) {
    throw invalidPayload('Canvas Host Generation kind is invalid.');
  }
  return value;
}

function parseCanvasGenerationRuntimeProjection(value: unknown): CanvasGenerationRuntimeProjection {
  const record = requireRecord(value, 'Canvas Generation runtime projection must be an object.');
  const allowed = new Set([
    'nodeId',
    'submissionId',
    'recipeInputFingerprint',
    'jobRef',
    'phase',
    'progress',
    'resultLocators',
    'text',
    'recipeStale',
    'diagnostic',
  ]);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw invalidPayload('Canvas Generation runtime projection contains unsupported fields.');
  }
  const phase = record['phase'];
  if (
    phase !== 'binding' &&
    phase !== 'pending' &&
    phase !== 'running' &&
    phase !== 'succeeded' &&
    phase !== 'failed' &&
    phase !== 'cancelled' &&
    phase !== 'outcome-unknown'
  ) {
    throw invalidPayload('Canvas Generation runtime phase is invalid.');
  }
  const jobRef = record['jobRef'];
  const progress = record['progress'];
  const resultLocators = record['resultLocators'];
  const diagnostic = record['diagnostic'];
  const text = record['text'];
  const recipeStale = record['recipeStale'];
  return {
    nodeId: requireOpaqueIdentity(record['nodeId'], 'Canvas Generation node identity is invalid.'),
    submissionId: requireOpaqueIdentity(
      record['submissionId'],
      'Canvas Generation submission identity is invalid.',
    ),
    recipeInputFingerprint: requireNonEmptyString(
      record['recipeInputFingerprint'],
      'Canvas Generation fingerprint is invalid.',
    ),
    ...(jobRef === undefined ? {} : { jobRef: parseGenerationJobRef(jobRef) }),
    phase,
    ...(progress === undefined ? {} : { progress: parseGenerationProgress(progress) }),
    ...(resultLocators === undefined
      ? {}
      : {
          resultLocators: requireArray(
            resultLocators,
            'Canvas Generation outputs must be an array.',
          ).map(requireGeneratedOutputLocator),
        }),
    ...(text === undefined
      ? {}
      : { text: requireString(text, 'Canvas Generation text output is invalid.') }),
    ...(recipeStale === undefined
      ? {}
      : {
          recipeStale: requireBoolean(
            recipeStale,
            'Canvas Generation Recipe stale marker is invalid.',
          ),
        }),
    ...(diagnostic === undefined ? {} : { diagnostic: parseGenerationDiagnostic(diagnostic) }),
  };
}

function parseGenerationJobRef(value: unknown) {
  const record = requireRecord(value, 'Canvas Generation JobRef is invalid.');
  requireExactKeys(record, ['kind', 'jobId']);
  if (record['kind'] !== 'generation')
    throw invalidPayload('Canvas Generation JobRef kind is invalid.');
  return {
    kind: 'generation' as const,
    jobId: requireOpaqueIdentity(record['jobId'], 'Canvas Generation Job identity is invalid.'),
  };
}

function parseGenerationProgress(
  value: unknown,
): NonNullable<CanvasGenerationRuntimeProjection['progress']> {
  const record = requireRecord(value, 'Canvas Generation progress is invalid.');
  requireExactKeys(record, ['stage', 'percent']);
  const stage = record['stage'];
  if (
    stage !== 'queued' &&
    stage !== 'submitting' &&
    stage !== 'waiting-provider' &&
    stage !== 'committing-result' &&
    stage !== 'completed'
  ) {
    throw invalidPayload('Canvas Generation progress stage is invalid.');
  }
  const percent = requireFiniteNumber(
    record['percent'],
    'Canvas Generation progress percent is invalid.',
  );
  if (percent < 0 || percent > 100)
    throw invalidPayload('Canvas Generation progress percent is invalid.');
  return {
    stage: stage as NonNullable<CanvasGenerationRuntimeProjection['progress']>['stage'],
    percent,
  };
}

function requireGeneratedOutputLocator(value: unknown) {
  const result = validateContentLocator(value);
  if (!result.ok || result.locator.kind !== 'generated-output') {
    throw invalidPayload('Canvas Generation output locator is invalid.');
  }
  return result.locator;
}

function parseGenerationDiagnostic(value: unknown) {
  const record = requireRecord(value, 'Canvas Generation diagnostic is invalid.');
  requireExactKeys(record, ['code', 'message', 'retryable']);
  const retryable = record['retryable'];
  if (retryable !== undefined && typeof retryable !== 'boolean') {
    throw invalidPayload('Canvas Generation diagnostic retryable flag is invalid.');
  }
  return {
    code: requireNonEmptyString(record['code'], 'Canvas Generation diagnostic code is invalid.'),
    message: requireNonEmptyString(
      record['message'],
      'Canvas Generation diagnostic message is invalid.',
    ),
    ...(retryable === undefined ? {} : { retryable }),
  };
}

function requireDiagnosticCode(
  value: unknown,
): Extract<CanvasHostIntentResult, { readonly status: 'rejected' }>['diagnostic']['code'] {
  const allowed = [
    'canvas-runtime-stale-identity',
    'canvas-runtime-unsupported-intent',
    'canvas-runtime-source-cancelled',
    'canvas-runtime-effect-failed',
  ] as const;
  const match = allowed.find((candidate) => candidate === value);
  if (!match) {
    throw invalidPayload('Canvas Host diagnostic code is invalid.');
  }
  return match;
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidPayload(message);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(record: Record<string, unknown>, keys: readonly string[]): void {
  const unexpected = Object.keys(record).filter((key) => !keys.includes(key));
  if (unexpected.length > 0) {
    throw invalidPayload(
      `Canvas Host payload contains unsupported fields: ${unexpected.join(', ')}.`,
    );
  }
}

function requireArray(value: unknown, message: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw invalidPayload(message);
  }
  return value;
}

function requireNonEmptyString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalidPayload(message);
  }
  return value;
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== 'string') throw invalidPayload(message);
  return value;
}

function requireOpaqueIdentity(value: unknown, message: string): string {
  const identity = requireNonEmptyString(value, message);
  if (
    identity.startsWith('/') ||
    /^[A-Za-z]:[\\/]/u.test(identity) ||
    identity.startsWith('file://') ||
    identity.includes('\\')
  ) {
    throw invalidPayload('Canvas Host identities must not expose a local path.');
  }
  return identity;
}

function requireMatchingIdentity(value: unknown, expected: string, message: string): string {
  const actual = requireOpaqueIdentity(value, message);
  if (actual !== expected) {
    throw invalidPayload(message);
  }
  return actual;
}

function requirePositiveInteger(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw invalidPayload(message);
  }
  return value;
}

function requireFiniteNumber(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalidPayload(message);
  }
  return value;
}

function requirePositiveNumber(value: unknown, message: string): number {
  const number = requireFiniteNumber(value, message);
  if (number <= 0) {
    throw invalidPayload(message);
  }
  return number;
}

function requireBoolean(value: unknown, message: string): boolean {
  if (typeof value !== 'boolean') {
    throw invalidPayload(message);
  }
  return value;
}

function invalidPayload(message: string): CanvasHostRuntimeContractError {
  return new CanvasHostRuntimeContractError('invalid-canvas-host-runtime-payload', message);
}
