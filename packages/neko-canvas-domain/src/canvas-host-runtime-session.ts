import type {
  CanvasData,
  CanvasMaterialActionDescriptor,
  CanvasMaterialActionIntent,
  CanvasMaterialAuthoringRequest,
  ContentLocator,
} from '@neko/shared';
import {
  CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
  assertCanvasHostRuntimeIdentity,
  type CanvasHostIntentRequest,
  type CanvasHostIntentResult,
  type CanvasHostPresentationState,
  type CanvasHostProjectionEvent,
  type CanvasHostRuntime,
  type CanvasHostRuntimeIdentity,
  type CanvasHostSnapshot,
  type CanvasMaterialActionResolution,
  type CanvasMaterialActionResolutionRequest,
} from './canvas-host-runtime-contract';
import {
  projectCanvasMaterialActionCatalog,
  resolveCanvasMaterialActionTargets,
  type CanvasMaterialActionTarget,
} from './canvas-material-action-catalog';
import {
  projectGenerationSnapshotToCanvas,
  type CanvasGenerationProjectionSnapshot,
} from './canvas-generation-projection';

export interface CanvasHostRuntimeSessionEffects {
  readonly resolveMaterialActions?: (input: {
    readonly canvas: CanvasData;
    readonly identity: CanvasHostRuntimeIdentity;
    readonly revision: number;
    readonly targets: readonly CanvasMaterialActionTarget[];
  }) => Promise<readonly CanvasMaterialActionDescriptor[]>;
  readonly saveDocument?: (input: {
    readonly canvas: CanvasData;
    readonly identity: CanvasHostRuntimeIdentity;
    readonly expectedRevision: number;
  }) => Promise<void>;
  readonly authorMaterial?: (input: {
    readonly canvas: CanvasData;
    readonly identity: CanvasHostRuntimeIdentity;
    readonly request: CanvasMaterialAuthoringRequest;
  }) => Promise<CanvasData>;
  readonly requestSource?: (input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly sourceKind: 'image' | 'video' | 'audio' | 'model' | 'document' | 'canvas';
    readonly sourceMode: 'import' | 'reference';
  }) => Promise<CanvasMaterialAuthoringRequest | undefined>;
  readonly requestGenerationDraft?: (input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly mediaKind: 'image' | 'video' | 'audio' | 'model' | 'document';
    readonly position?: { readonly x: number; readonly y: number };
    readonly inputNodeIds: readonly string[];
  }) => Promise<CanvasGenerationProjectionSnapshot | undefined>;
  readonly previewResource?: (input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly locator: ContentLocator;
  }) => Promise<void>;
  readonly revealResource?: (input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly locator: ContentLocator;
  }) => Promise<void>;
  readonly executeMaterialAction?: (input: {
    readonly canvas: CanvasData;
    readonly identity: CanvasHostRuntimeIdentity;
    readonly descriptor: CanvasMaterialActionDescriptor;
    readonly action: CanvasMaterialActionIntent;
    readonly targets: readonly CanvasMaterialActionTarget[];
  }) => Promise<{ readonly canvas?: CanvasData }>;
}

export interface CanvasHostRuntimeSessionOptions {
  readonly identity: CanvasHostRuntimeIdentity;
  readonly initialCanvas: CanvasData;
  readonly initialRevision?: number;
  readonly initialDirty?: boolean;
  readonly initialPresentation?: CanvasHostPresentationState;
  readonly effects: CanvasHostRuntimeSessionEffects;
  readonly commandHistoryLimit?: number;
  readonly documentHistoryLimit?: number;
}

/**
 * Capability owners may surface a sanitized, user-actionable diagnostic.
 * Internal errors remain generic so absolute paths and implementation details are not exposed.
 */
export class CanvasHostVisibleEffectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanvasHostVisibleEffectError';
  }
}

const DEFAULT_PRESENTATION: CanvasHostPresentationState = {
  viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
  selectedNodeIds: [],
};

export class CanvasHostRuntimeSession implements CanvasHostRuntime {
  readonly identity: CanvasHostRuntimeIdentity;

  private canvas: CanvasData;
  private revision: number;
  private dirty: boolean;
  private presentation: CanvasHostPresentationState;
  private sequence = 0;
  private disposed = false;
  private readonly listeners = new Set<(event: CanvasHostProjectionEvent) => void>();
  private readonly undoStack: CanvasData[] = [];
  private readonly redoStack: CanvasData[] = [];
  private readonly completedCommands = new Map<string, CanvasHostIntentResult>();
  private readonly commandOrder: string[] = [];
  private readonly commandHistoryLimit: number;
  private readonly documentHistoryLimit: number;

  constructor(private readonly options: CanvasHostRuntimeSessionOptions) {
    this.identity = { ...options.identity };
    this.canvas = cloneCanvas(options.initialCanvas);
    this.revision = options.initialRevision ?? 0;
    this.dirty = options.initialDirty ?? false;
    this.presentation = clonePresentation(options.initialPresentation ?? DEFAULT_PRESENTATION);
    this.commandHistoryLimit = options.commandHistoryLimit ?? 200;
    this.documentHistoryLimit = options.documentHistoryLimit ?? 50;
    if (!Number.isSafeInteger(this.revision) || this.revision < 0) {
      throw new Error('Canvas Host initial revision must be a non-negative safe integer.');
    }
    if (!Number.isSafeInteger(this.commandHistoryLimit) || this.commandHistoryLimit < 1) {
      throw new Error('Canvas Host command history limit must be a positive safe integer.');
    }
    if (!Number.isSafeInteger(this.documentHistoryLimit) || this.documentHistoryLimit < 1) {
      throw new Error('Canvas Host document history limit must be a positive safe integer.');
    }
  }

  async getSnapshot(): Promise<CanvasHostSnapshot> {
    this.assertActive();
    return this.createSnapshot();
  }

  async resolveMaterialActions(
    request: CanvasMaterialActionResolutionRequest,
  ): Promise<CanvasMaterialActionResolution> {
    this.assertActive();
    assertCanvasHostRuntimeIdentity(this.identity, request.identity);
    if (request.expectedRevision !== this.revision) {
      throw new Error(`Canvas material action revision is stale; expected ${this.revision}.`);
    }
    const selectedNodeIds = [...request.selectedNodeIds];
    if (selectedNodeIds.length === 0) {
      return this.createMaterialActionResolution(request.requestId, selectedNodeIds, []);
    }
    const targets = resolveCanvasMaterialActionTargets(this.canvas.nodes, selectedNodeIds);
    const descriptors = await this.resolveAvailableMaterialActions(targets);
    return this.createMaterialActionResolution(request.requestId, selectedNodeIds, descriptors);
  }

  subscribe(listener: (event: CanvasHostProjectionEvent) => void): () => void {
    this.assertActive();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async executeIntent(request: CanvasHostIntentRequest): Promise<CanvasHostIntentResult> {
    if (this.disposed) {
      return rejected(request, 'canvas-runtime-effect-failed', 'Canvas Host session is disposed.');
    }
    let result: CanvasHostIntentResult;
    try {
      assertCanvasHostRuntimeIdentity(this.identity, request.identity);
    } catch {
      result = rejected(
        request,
        'canvas-runtime-stale-identity',
        'Canvas Host identity is stale or belongs to another document session.',
      );
      this.remember(request.commandId, result);
      return cloneResult(result);
    }
    const completed = this.completedCommands.get(request.commandId);
    if (completed) return replayResult(completed, request.requestId);
    if (request.expectedRevision !== this.revision) {
      result = rejected(
        request,
        'canvas-runtime-stale-revision',
        `Canvas Host revision is stale; expected ${this.revision}.`,
      );
      this.remember(request.commandId, result);
      return cloneResult(result);
    }

    try {
      result = await this.applyIntent(request);
    } catch (error: unknown) {
      result = rejected(
        request,
        'canvas-runtime-effect-failed',
        error instanceof CanvasHostVisibleEffectError
          ? error.message
          : 'Canvas Host effect failed.',
      );
    }
    this.remember(request.commandId, result);
    return cloneResult(result);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.completedCommands.clear();
    this.commandOrder.length = 0;
  }

  private async applyIntent(request: CanvasHostIntentRequest): Promise<CanvasHostIntentResult> {
    const { intent } = request;
    if (intent.type === 'replace-document') {
      this.commitCanvas(intent.canvas, request.commandId);
      return this.accepted(request);
    }
    if (intent.type === 'undo') {
      const previous = this.undoStack.pop();
      if (previous) {
        this.redoStack.push(cloneCanvas(this.canvas));
        this.canvas = previous;
        this.commitStateChange(true, request.commandId);
      }
      return this.accepted(request);
    }
    if (intent.type === 'redo') {
      const next = this.redoStack.pop();
      if (next) {
        this.pushHistory(this.undoStack, this.canvas);
        this.canvas = next;
        this.commitStateChange(true, request.commandId);
      }
      return this.accepted(request);
    }
    if (intent.type === 'save') {
      const saveDocument = this.options.effects.saveDocument;
      if (!saveDocument) return unsupported(request, intent.type);
      await saveDocument({
        canvas: cloneCanvas(this.canvas),
        identity: { ...this.identity },
        expectedRevision: this.revision,
      });
      this.commitStateChange(false, request.commandId);
      return this.accepted(request);
    }
    if (intent.type === 'author-material') {
      const next = await this.authorMaterial(intent.request, request);
      if (isIntentResult(next)) return next;
      this.commitCanvas(next, request.commandId);
      return this.accepted(request);
    }
    if (intent.type === 'request-source') {
      const requestSource = this.options.effects.requestSource;
      if (!requestSource) return unsupported(request, intent.type);
      const materialRequest = await requestSource({
        identity: { ...this.identity },
        sourceKind: intent.sourceKind,
        sourceMode: intent.sourceMode,
      });
      if (!materialRequest) {
        return rejected(
          request,
          'canvas-runtime-source-cancelled',
          'Canvas source selection was cancelled.',
        );
      }
      const requestWithPosition = applyRequestedPosition(materialRequest, intent.position);
      const next = await this.authorMaterial(requestWithPosition, request);
      if (isIntentResult(next)) return next;
      this.commitCanvas(next, request.commandId);
      return this.accepted(request);
    }
    if (intent.type === 'request-generation-draft') {
      const requestGenerationDraft = this.options.effects.requestGenerationDraft;
      if (!requestGenerationDraft) return unsupported(request, intent.type);
      const generation = await requestGenerationDraft({
        identity: { ...this.identity },
        mediaKind: intent.mediaKind,
        ...(intent.position ? { position: intent.position } : {}),
        inputNodeIds: [...intent.inputNodeIds],
      });
      if (!generation) {
        return rejected(
          request,
          'canvas-runtime-source-cancelled',
          'Canvas Generation draft was cancelled.',
        );
      }
      const identity = {
        projectId: this.identity.projectId,
        canvasId: this.identity.documentId,
        canvasSessionId: this.identity.sessionId,
      };
      this.commitCanvas(
        projectGenerationSnapshotToCanvas({
          identity,
          expectedIdentity: identity,
          canvas: cloneCanvas(this.canvas),
          snapshot: {
            ...generation,
            ...(intent.position ? { position: intent.position } : {}),
          },
        }),
        request.commandId,
      );
      return this.accepted(request);
    }
    if (intent.type === 'preview-resource' || intent.type === 'reveal-resource') {
      const effect =
        intent.type === 'preview-resource'
          ? this.options.effects.previewResource
          : this.options.effects.revealResource;
      if (!effect) return unsupported(request, intent.type);
      await effect({ identity: { ...this.identity }, locator: intent.locator });
      return this.accepted(request);
    }
    if (intent.type === 'execute-material-action') {
      if (!matchesMaterialActionIdentity(this.identity, intent.action)) {
        return rejected(
          request,
          'canvas-runtime-stale-identity',
          'Canvas material action belongs to another Canvas session.',
        );
      }
      if (intent.action.expectedCanvasRevision !== this.revision) {
        return rejected(
          request,
          'canvas-runtime-stale-revision',
          `Canvas material action revision is stale; expected ${this.revision}.`,
        );
      }
      const targets = resolveCanvasMaterialActionTargets(
        this.canvas.nodes,
        intent.action.selectedNodeIds,
      );
      const available = await this.resolveAvailableMaterialActions(targets);
      const descriptor = available.find((candidate) => candidate.id === intent.action.actionId);
      if (!descriptor) {
        return rejected(
          request,
          'canvas-runtime-unsupported-intent',
          `Canvas material action "${intent.action.actionId}" is unavailable for the current selection.`,
        );
      }
      const executeMaterialAction = this.options.effects.executeMaterialAction;
      if (!executeMaterialAction) return unsupported(request, intent.type);
      const result = await executeMaterialAction({
        canvas: cloneCanvas(this.canvas),
        identity: { ...this.identity },
        descriptor: structuredClone(descriptor),
        action: structuredClone(intent.action),
        targets: structuredClone(targets),
      });
      if (result.canvas) {
        this.commitCanvas(result.canvas, request.commandId);
      }
      return this.accepted(request);
    }
    if (intent.type === 'update-presentation') {
      this.presentation = clonePresentation(intent.presentation);
      this.commitStateChange(this.dirty, request.commandId);
      return this.accepted(request);
    }
    return unsupported(request, 'unknown');
  }

  private async authorMaterial(
    materialRequest: CanvasMaterialAuthoringRequest,
    request: CanvasHostIntentRequest,
  ): Promise<CanvasData | CanvasHostIntentResult> {
    const authorMaterial = this.options.effects.authorMaterial;
    if (!authorMaterial) return unsupported(request, 'author-material');
    assertMaterialIdentity(this.identity, materialRequest);
    return authorMaterial({
      canvas: cloneCanvas(this.canvas),
      identity: { ...this.identity },
      request: structuredClone(materialRequest),
    });
  }

  private commitCanvas(nextCanvas: CanvasData, originCommandId: string): void {
    this.pushHistory(this.undoStack, this.canvas);
    this.redoStack.length = 0;
    this.canvas = cloneCanvas(nextCanvas);
    this.commitStateChange(true, originCommandId);
  }

  private pushHistory(history: CanvasData[], canvas: CanvasData): void {
    history.push(cloneCanvas(canvas));
    if (history.length > this.documentHistoryLimit) history.shift();
  }

  private commitStateChange(dirty: boolean, originCommandId: string): void {
    this.dirty = dirty;
    this.revision += 1;
    this.sequence += 1;
    const event: CanvasHostProjectionEvent = {
      schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
      sequence: this.sequence,
      originCommandId,
      snapshot: this.createSnapshot(),
    };
    for (const listener of this.listeners) listener(cloneEvent(event));
  }

  private accepted(request: CanvasHostIntentRequest): CanvasHostIntentResult {
    return {
      schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
      requestId: request.requestId,
      commandId: request.commandId,
      status: 'accepted',
      snapshot: this.createSnapshot(),
    };
  }

  private createSnapshot(): CanvasHostSnapshot {
    const sourceAvailable = this.options.effects.requestSource !== undefined;
    const generationAvailable = this.options.effects.requestGenerationDraft !== undefined;
    return {
      schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
      identity: { ...this.identity },
      revision: this.revision,
      dirty: this.dirty,
      canvas: cloneCanvas(this.canvas),
      presentation: clonePresentation(this.presentation),
      authoringCapabilities: {
        sourceModes: sourceAvailable ? ['import', 'reference'] : [],
        generationMediaKinds: generationAvailable
          ? ['image', 'video', 'audio', 'model', 'document']
          : [],
      },
    };
  }

  private async resolveAvailableMaterialActions(
    targets: readonly CanvasMaterialActionTarget[],
  ): Promise<readonly CanvasMaterialActionDescriptor[]> {
    const resolveMaterialActions = this.options.effects.resolveMaterialActions;
    if (!resolveMaterialActions || targets.length === 0) return [];
    return projectCanvasMaterialActionCatalog({
      descriptors: await resolveMaterialActions({
        canvas: cloneCanvas(this.canvas),
        identity: { ...this.identity },
        revision: this.revision,
        targets: structuredClone(targets),
      }),
      targets,
    });
  }

  private createMaterialActionResolution(
    requestId: string,
    selectedNodeIds: readonly string[],
    descriptors: readonly CanvasMaterialActionDescriptor[],
  ): CanvasMaterialActionResolution {
    return {
      schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
      requestId,
      identity: { ...this.identity },
      revision: this.revision,
      selectedNodeIds: [...selectedNodeIds],
      descriptors: structuredClone(descriptors),
    };
  }

  private remember(commandId: string, result: CanvasHostIntentResult): void {
    this.completedCommands.set(commandId, cloneResult(result));
    this.commandOrder.push(commandId);
    while (this.commandOrder.length > this.commandHistoryLimit) {
      const oldest = this.commandOrder.shift();
      if (oldest) this.completedCommands.delete(oldest);
    }
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('Canvas Host session is disposed.');
  }
}

function rejected(
  request: Pick<CanvasHostIntentRequest, 'requestId' | 'commandId'>,
  code: Extract<CanvasHostIntentResult, { status: 'rejected' }>['diagnostic']['code'],
  message: string,
): CanvasHostIntentResult {
  return {
    schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
    requestId: request.requestId,
    commandId: request.commandId,
    status: 'rejected',
    diagnostic: { code, message },
  };
}

function unsupported(request: CanvasHostIntentRequest, intentType: string): CanvasHostIntentResult {
  return rejected(
    request,
    'canvas-runtime-unsupported-intent',
    `Canvas Host intent "${intentType}" is unavailable.`,
  );
}

function isIntentResult(
  value: CanvasData | CanvasHostIntentResult,
): value is CanvasHostIntentResult {
  return 'status' in value && (value.status === 'accepted' || value.status === 'rejected');
}

function cloneCanvas(canvas: CanvasData): CanvasData {
  return structuredClone(canvas);
}

function clonePresentation(presentation: CanvasHostPresentationState): CanvasHostPresentationState {
  return {
    viewport: {
      pan: { ...presentation.viewport.pan },
      zoom: presentation.viewport.zoom,
    },
    selectedNodeIds: [...presentation.selectedNodeIds],
  };
}

function cloneEvent(event: CanvasHostProjectionEvent): CanvasHostProjectionEvent {
  return {
    ...event,
    snapshot: cloneSnapshot(event.snapshot),
  };
}

function cloneResult(result: CanvasHostIntentResult): CanvasHostIntentResult {
  if (result.status === 'rejected') {
    return { ...result, diagnostic: { ...result.diagnostic } };
  }
  return { ...result, snapshot: cloneSnapshot(result.snapshot) };
}

function replayResult(result: CanvasHostIntentResult, requestId: string): CanvasHostIntentResult {
  return { ...cloneResult(result), requestId };
}

function cloneSnapshot(snapshot: CanvasHostSnapshot): CanvasHostSnapshot {
  return {
    ...snapshot,
    identity: { ...snapshot.identity },
    canvas: cloneCanvas(snapshot.canvas),
    presentation: clonePresentation(snapshot.presentation),
  };
}

function assertMaterialIdentity(
  identity: CanvasHostRuntimeIdentity,
  request: CanvasMaterialAuthoringRequest,
): void {
  if (
    request.identity.projectId !== identity.projectId ||
    request.identity.canvasId !== identity.documentId ||
    request.identity.canvasSessionId !== identity.sessionId
  ) {
    throw new Error('Canvas material authoring identity does not match the active Canvas session.');
  }
}

function matchesMaterialActionIdentity(
  identity: CanvasHostRuntimeIdentity,
  action: CanvasMaterialActionIntent,
): boolean {
  return (
    action.identity.projectId === identity.projectId &&
    action.identity.canvasId === identity.documentId &&
    action.identity.canvasSessionId === identity.sessionId
  );
}

function applyRequestedPosition(
  request: CanvasMaterialAuthoringRequest,
  position: Readonly<{ x: number; y: number }> | undefined,
): CanvasMaterialAuthoringRequest {
  if (position === undefined) return request;
  if (request.kind === 'global-library-link') {
    throw new Error('Canvas source selection cannot return a global Media Library link request.');
  }
  return { ...request, position: { ...position } };
}
