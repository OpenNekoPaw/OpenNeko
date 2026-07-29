import type { CanvasData, ContentLocator } from '@neko/shared';
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
} from './canvas-host-runtime-contract';

export interface CanvasHostRuntimeSessionEffects {
  readonly saveDocument?: (input: {
    readonly canvas: CanvasData;
    readonly identity: CanvasHostRuntimeIdentity;
    readonly expectedRevision: number;
  }) => Promise<void>;
  readonly projectContent?: (input: {
    readonly canvas: CanvasData;
    readonly identity: CanvasHostRuntimeIdentity;
    readonly locator: ContentLocator;
    readonly position?: { readonly x: number; readonly y: number };
  }) => Promise<CanvasData>;
  readonly requestSource?: (input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly sourceKind: 'image' | 'video' | 'audio' | 'document' | 'canvas';
  }) => Promise<ContentLocator | undefined>;
  readonly previewResource?: (input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly locator: ContentLocator;
  }) => Promise<void>;
  readonly revealResource?: (input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly locator: ContentLocator;
  }) => Promise<void>;
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
    } catch {
      result = rejected(request, 'canvas-runtime-effect-failed', 'Canvas Host effect failed.');
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
      this.commitCanvas(intent.canvas);
      return this.accepted(request);
    }
    if (intent.type === 'undo') {
      const previous = this.undoStack.pop();
      if (previous) {
        this.redoStack.push(cloneCanvas(this.canvas));
        this.canvas = previous;
        this.commitStateChange(true);
      }
      return this.accepted(request);
    }
    if (intent.type === 'redo') {
      const next = this.redoStack.pop();
      if (next) {
        this.pushHistory(this.undoStack, this.canvas);
        this.canvas = next;
        this.commitStateChange(true);
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
      this.commitStateChange(false);
      return this.accepted(request);
    }
    if (intent.type === 'project-content') {
      const next = await this.projectContent(intent.locator, request, intent.position);
      if (isIntentResult(next)) return next;
      this.commitCanvas(next);
      return this.accepted(request);
    }
    if (intent.type === 'request-source') {
      const requestSource = this.options.effects.requestSource;
      if (!requestSource) return unsupported(request, intent.type);
      const locator = await requestSource({
        identity: { ...this.identity },
        sourceKind: intent.sourceKind,
      });
      if (!locator) {
        return rejected(
          request,
          'canvas-runtime-source-cancelled',
          'Canvas source selection was cancelled.',
        );
      }
      const next = await this.projectContent(locator, request, intent.position);
      if (isIntentResult(next)) return next;
      this.commitCanvas(next);
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
    if (intent.type === 'update-presentation') {
      this.presentation = clonePresentation(intent.presentation);
      this.commitStateChange(this.dirty);
      return this.accepted(request);
    }
    return unsupported(request, 'unknown');
  }

  private async projectContent(
    locator: ContentLocator,
    request: CanvasHostIntentRequest,
    position?: { readonly x: number; readonly y: number },
  ): Promise<CanvasData | CanvasHostIntentResult> {
    const projectContent = this.options.effects.projectContent;
    if (!projectContent) return unsupported(request, 'project-content');
    return projectContent({
      canvas: cloneCanvas(this.canvas),
      identity: { ...this.identity },
      locator,
      ...(position ? { position } : {}),
    });
  }

  private commitCanvas(nextCanvas: CanvasData): void {
    this.pushHistory(this.undoStack, this.canvas);
    this.redoStack.length = 0;
    this.canvas = cloneCanvas(nextCanvas);
    this.commitStateChange(true);
  }

  private pushHistory(history: CanvasData[], canvas: CanvasData): void {
    history.push(cloneCanvas(canvas));
    if (history.length > this.documentHistoryLimit) history.shift();
  }

  private commitStateChange(dirty: boolean): void {
    this.dirty = dirty;
    this.revision += 1;
    this.sequence += 1;
    const event: CanvasHostProjectionEvent = {
      schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
      sequence: this.sequence,
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
    return {
      schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
      identity: { ...this.identity },
      revision: this.revision,
      dirty: this.dirty,
      canvas: cloneCanvas(this.canvas),
      presentation: clonePresentation(this.presentation),
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
