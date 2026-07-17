import type { CanvasNode, GenerationModelConfig } from '@neko/shared';

export const DEFAULT_CANVAS_AMBIENT_SCOPE_ID = 'default';

export interface SelectedNodeSummary {
  readonly nodeId: string;
  readonly type: string;
  readonly summary: string;
  readonly assetUri?: string;
  readonly assetKind?: 'image' | 'video' | 'audio' | 'metadata' | 'unknown';
  readonly bounds?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

/** Lightweight summary of a canvas/asset change event for ambient injection. */
export interface CanvasChangeSummary {
  /** 'canvas' for node/shape changes, 'assets' for library changes */
  readonly domain: 'canvas' | 'assets';
  readonly changeType: 'add' | 'update' | 'delete';
  /** nodeId or assetId, when available */
  readonly id?: string;
  readonly timestamp: number;
}

export interface CanvasAssetChangeInput {
  readonly type: unknown;
  readonly assetId?: unknown;
}

export interface CanvasChangeInput {
  readonly type: unknown;
  readonly nodeId?: unknown;
  readonly shapeId?: unknown;
}

export interface CanvasAmbientContextRuntimeOptions {
  readonly maxAmbientNodes?: number;
  readonly maxPendingChanges?: number;
}

export interface CanvasAmbientContextScopeState {
  selectedNodes: SelectedNodeSummary[];
  generationConfig?: GenerationModelConfig;
  pendingChanges: CanvasChangeSummary[];
}

const DEFAULT_MAX_AMBIENT_NODES = 5;
const DEFAULT_MAX_PENDING_CHANGES = 20;

export class CanvasAmbientContextRuntime {
  private readonly maxAmbientNodes: number;
  private readonly maxPendingChanges: number;
  private readonly scopes = new Map<string, CanvasAmbientContextScopeState>();

  constructor(options: CanvasAmbientContextRuntimeOptions = {}) {
    this.maxAmbientNodes = options.maxAmbientNodes ?? DEFAULT_MAX_AMBIENT_NODES;
    this.maxPendingChanges = options.maxPendingChanges ?? DEFAULT_MAX_PENDING_CHANGES;
  }

  setCanvasSelection(
    nodes: readonly CanvasNode[],
    scopeId = DEFAULT_CANVAS_AMBIENT_SCOPE_ID,
  ): SelectedNodeSummary[] {
    const state = this.getScope(scopeId);
    state.selectedNodes = nodes.slice(0, this.maxAmbientNodes).map(summarizeCanvasNode);
    return [...state.selectedNodes];
  }

  getCanvasSelection(scopeId = DEFAULT_CANVAS_AMBIENT_SCOPE_ID): SelectedNodeSummary[] {
    return [...this.getScope(scopeId).selectedNodes];
  }

  clearCanvasSelection(scopeId = DEFAULT_CANVAS_AMBIENT_SCOPE_ID): SelectedNodeSummary[] {
    const state = this.getScope(scopeId);
    state.selectedNodes = [];
    return [];
  }

  setActiveGenerationConfig(
    config: GenerationModelConfig,
    scopeId = DEFAULT_CANVAS_AMBIENT_SCOPE_ID,
  ): GenerationModelConfig {
    this.getScope(scopeId).generationConfig = config;
    return config;
  }

  getActiveGenerationConfig(
    scopeId = DEFAULT_CANVAS_AMBIENT_SCOPE_ID,
  ): GenerationModelConfig | undefined {
    return this.getScope(scopeId).generationConfig;
  }

  recordCanvasChange(
    summary: CanvasChangeSummary,
    scopeId = DEFAULT_CANVAS_AMBIENT_SCOPE_ID,
  ): CanvasChangeSummary[] {
    const state = this.getScope(scopeId);
    state.pendingChanges.push(summary);
    if (state.pendingChanges.length > this.maxPendingChanges) {
      state.pendingChanges = state.pendingChanges.slice(
        state.pendingChanges.length - this.maxPendingChanges,
      );
    }
    return [...state.pendingChanges];
  }

  drainPendingCanvasChanges(scopeId = DEFAULT_CANVAS_AMBIENT_SCOPE_ID): CanvasChangeSummary[] {
    const state = this.getScope(scopeId);
    const changes = state.pendingChanges;
    state.pendingChanges = [];
    return changes;
  }

  getPendingCanvasChanges(scopeId = DEFAULT_CANVAS_AMBIENT_SCOPE_ID): CanvasChangeSummary[] {
    return [...this.getScope(scopeId).pendingChanges];
  }

  resetScope(scopeId = DEFAULT_CANVAS_AMBIENT_SCOPE_ID): void {
    this.scopes.delete(scopeId);
  }

  private getScope(scopeId: string): CanvasAmbientContextScopeState {
    let state = this.scopes.get(scopeId);
    if (!state) {
      state = { selectedNodes: [], pendingChanges: [] };
      this.scopes.set(scopeId, state);
    }
    return state;
  }
}

export function projectCanvasAssetChangeSummary(
  event: CanvasAssetChangeInput,
  timestamp = Date.now(),
): CanvasChangeSummary | null {
  const changeType = normalizeCanvasChangeType(event.type);
  if (!changeType) return null;

  return {
    domain: 'assets',
    changeType,
    ...(typeof event.assetId === 'string' && event.assetId.length > 0 ? { id: event.assetId } : {}),
    timestamp,
  };
}

export function projectCanvasChangeSummary(
  event: CanvasChangeInput,
  timestamp = Date.now(),
): CanvasChangeSummary | null {
  const changeType = normalizeCanvasChangeType(event.type);
  if (!changeType) return null;

  const id =
    typeof event.nodeId === 'string' && event.nodeId.length > 0
      ? event.nodeId
      : typeof event.shapeId === 'string' && event.shapeId.length > 0
        ? event.shapeId
        : undefined;

  return {
    domain: 'canvas',
    changeType,
    ...(id ? { id } : {}),
    timestamp,
  };
}

export function summarizeCanvasNode(node: CanvasNode): SelectedNodeSummary {
  const type = node.type;
  let summary = `${type} #${node.id.slice(0, 6)}`;
  const data: Readonly<Record<string, unknown>> = isRecord(node.data) ? node.data : {};

  switch (node.type) {
    case 'shot': {
      const shotNum = data['shotNumber'] ?? '?';
      const scale = data['shotScale'] ?? '';
      const desc =
        typeof data['visualDescription'] === 'string' ? data['visualDescription'].slice(0, 60) : '';
      summary = `#${String(shotNum)} ${String(scale)}${desc ? ` - ${desc}` : ''}`.trim();
      break;
    }
    case 'scene': {
      const title = typeof data['sceneTitle'] === 'string' ? data['sceneTitle'] : 'Scene';
      const num = data['sceneNumber'] ?? '';
      summary = `Scene ${String(num)}: ${title}`.trim();
      break;
    }
    case 'gallery': {
      const name = typeof data['characterName'] === 'string' ? data['characterName'] : '';
      const preset = typeof data['preset'] === 'string' ? data['preset'] : '';
      summary = name ? `Gallery: ${name} (${preset})` : `Gallery (${preset})`;
      break;
    }
    case 'annotation': {
      const content = typeof data['content'] === 'string' ? data['content'].slice(0, 60) : '';
      summary = content ? `Note: ${content}` : 'Annotation';
      break;
    }
    case 'media': {
      const mediaType = data['mediaType'] ?? 'media';
      const assetPath =
        typeof data['assetPath'] === 'string' ? (data['assetPath'].split('/').pop() ?? '') : '';
      summary = assetPath ? `${String(mediaType)}: ${assetPath}` : String(mediaType);
      break;
    }
    default:
      break;
  }

  const assetUri = readCanvasNodeAssetUri(node);
  const assetKind = readCanvasNodeAssetKind(node);

  return {
    nodeId: node.id,
    type,
    summary,
    ...(assetUri ? { assetUri } : {}),
    ...(assetKind ? { assetKind } : {}),
    bounds: {
      x: node.position.x,
      y: node.position.y,
      width: node.size.width,
      height: node.size.height,
    },
  };
}

export function readCanvasNodeAssetUri(node: CanvasNode): string | undefined {
  const data: Readonly<Record<string, unknown>> = isRecord(node.data) ? node.data : {};
  if (node.type === 'media' && typeof data['assetPath'] === 'string') {
    return data['assetPath'];
  }
  if (node.type === 'shot') {
    const generatedAsset = data['generatedAsset'];
    if (isRecord(generatedAsset) && typeof generatedAsset['path'] === 'string') {
      return generatedAsset['path'];
    }
    if (typeof data['generatedImage'] === 'string') {
      return data['generatedImage'];
    }
  }
  return undefined;
}

export function readCanvasNodeAssetKind(
  node: CanvasNode,
): SelectedNodeSummary['assetKind'] | undefined {
  const data: Readonly<Record<string, unknown>> = isRecord(node.data) ? node.data : {};
  if (node.type === 'media') {
    const mediaType = data['mediaType'];
    if (mediaType === 'image' || mediaType === 'video' || mediaType === 'audio') {
      return mediaType;
    }
    return 'unknown';
  }
  if (node.type === 'shot' && readCanvasNodeAssetUri(node)) {
    return 'image';
  }
  return undefined;
}

function normalizeCanvasChangeType(value: unknown): CanvasChangeSummary['changeType'] | null {
  return value === 'add' || value === 'update' || value === 'delete' ? value : null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
