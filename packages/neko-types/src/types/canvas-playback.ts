import type { CanvasConnection, CanvasData, CanvasNode } from './canvas';
import type { CanvasSerializableRecord } from './canvas-serializable';
import type { ResourceRef } from './resource-cache';
import { getContainerChildIds, getNodeParentId } from '../utils/canvasLayered';

export const CANVAS_PLAYBACK_ADAPTER_IDS = ['auto', 'generic'] as const;
export type CanvasPlaybackAdapterId = (typeof CANVAS_PLAYBACK_ADAPTER_IDS)[number];
export type ResolvedCanvasPlaybackAdapterId = 'generic';

export const CANVAS_PLAYBACK_BEHAVIOR_MODES = ['auto', 'manual', 'linear'] as const;
export type CanvasPlaybackBehaviorMode = (typeof CANVAS_PLAYBACK_BEHAVIOR_MODES)[number];
export type ResolvedCanvasPlaybackBehaviorMode = Exclude<CanvasPlaybackBehaviorMode, 'auto'>;

export type CanvasPlaybackAdvancePolicy = 'timer' | 'media-ended' | 'user-input';
export type CanvasPlaybackNodeRole = 'start' | 'end' | 'skip' | 'step';
export type CanvasPlaybackExpansion = 'self' | 'children' | 'recursive';

export interface CanvasPlaybackNodeOverride {
  readonly role?: CanvasPlaybackNodeRole;
  readonly order?: number;
  readonly durationMs?: number;
  readonly expand?: CanvasPlaybackExpansion;
}

export interface CanvasPlaybackEdgeOverride {
  readonly enabled?: boolean;
  readonly order?: number;
}

export interface CanvasPlaybackMetadata {
  readonly version: 1;
  readonly adapterId?: CanvasPlaybackAdapterId;
  readonly mode?: CanvasPlaybackBehaviorMode;
  readonly entryIds?: readonly string[];
  readonly nodeOverrides?: Readonly<Record<string, CanvasPlaybackNodeOverride>>;
  readonly edgeOverrides?: Readonly<Record<string, CanvasPlaybackEdgeOverride>>;
}

export type CanvasPlaybackUnitKind = 'node' | 'container' | 'media';
export type CanvasPlaybackRenderMode = 'select-node' | 'inline-preview' | 'media-playback';

export interface CanvasPlaybackUnit {
  readonly id: string;
  readonly sourceNodeId: string;
  readonly kind: CanvasPlaybackUnitKind;
  readonly renderMode: CanvasPlaybackRenderMode;
  readonly label?: string;
  readonly durationMs?: number;
  readonly terminal?: boolean;
  readonly assetPath?: string;
  readonly resourceRef?: ResourceRef;
  readonly metadata?: CanvasSerializableRecord;
}

export type CanvasPlaybackTransitionType = 'sequence';

export interface CanvasPlaybackTransition {
  readonly id: string;
  readonly sourceUnitId: string;
  readonly targetUnitId: string;
  readonly type: CanvasPlaybackTransitionType;
  readonly priority: number;
  readonly label?: string;
  readonly sourceConnectionId?: string;
  readonly sourceNodeId?: string;
  readonly targetNodeId?: string;
  readonly enabled?: boolean;
  readonly metadata?: CanvasSerializableRecord;
}

export type CanvasPlaybackDiagnosticCode =
  | 'playback-missing-entry'
  | 'playback-missing-unit'
  | 'playback-missing-route'
  | 'playback-invalid-route'
  | 'playback-route-cycle'
  | 'playback-dangling-node'
  | 'playback-dangling-connection'
  | 'playback-missing-media-source';

export interface CanvasPlaybackDiagnostic {
  readonly code: CanvasPlaybackDiagnosticCode;
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
  readonly adapterId?: ResolvedCanvasPlaybackAdapterId;
  readonly nodeId?: string;
  readonly connectionId?: string;
}

export type CanvasPlaybackRouteSourceKind =
  'entry' | 'auto-entry' | 'selection' | 'container' | 'single-unit';

export interface CanvasPlaybackRouteCandidate {
  readonly id: string;
  readonly title: string;
  readonly entryUnitId: string;
  readonly unitIds: readonly string[];
  readonly sourceKind: CanvasPlaybackRouteSourceKind;
  readonly sourceNodeId?: string;
  readonly totalDurationMs?: number;
  readonly diagnostics?: readonly CanvasPlaybackDiagnostic[];
}

export interface CanvasPlaybackRouteResolution {
  readonly routes: readonly CanvasPlaybackRouteCandidate[];
  readonly diagnostics: readonly CanvasPlaybackDiagnostic[];
}

export interface CanvasPlaybackPlan {
  readonly adapterId: ResolvedCanvasPlaybackAdapterId;
  readonly requestedAdapterId: CanvasPlaybackAdapterId;
  readonly behaviorMode: ResolvedCanvasPlaybackBehaviorMode;
  readonly advancePolicy: CanvasPlaybackAdvancePolicy;
  readonly entryUnitIds: readonly string[];
  readonly units: readonly CanvasPlaybackUnit[];
  readonly transitions: readonly CanvasPlaybackTransition[];
  readonly routeCandidates: readonly CanvasPlaybackRouteCandidate[];
  readonly diagnostics: readonly CanvasPlaybackDiagnostic[];
  readonly metadata: CanvasSerializableRecord;
}

export interface CreateCanvasPlaybackPlanInput {
  readonly canvas: CanvasData;
  readonly selectedNodeId?: string;
  readonly adapterId?: CanvasPlaybackAdapterId;
  readonly mode?: CanvasPlaybackBehaviorMode;
}

export interface NormalizedCanvasPlaybackMetadata {
  readonly version: 1;
  readonly adapterId: CanvasPlaybackAdapterId;
  readonly mode: CanvasPlaybackBehaviorMode;
  readonly entryIds: readonly string[];
  readonly nodeOverrides: Readonly<Record<string, CanvasPlaybackNodeOverride>>;
  readonly edgeOverrides: Readonly<Record<string, CanvasPlaybackEdgeOverride>>;
}

export function normalizeCanvasPlaybackMetadata(
  canvas: Pick<CanvasData, 'playback'> | Record<string, unknown>,
): NormalizedCanvasPlaybackMetadata {
  const rawPlayback = Reflect.get(canvas, 'playback');
  const source: Record<string, unknown> | undefined = isRecord(rawPlayback)
    ? rawPlayback
    : undefined;
  return {
    version: 1,
    adapterId: readAdapterId(source?.['adapterId']) ?? 'auto',
    mode: readBehaviorMode(source?.['mode']) ?? 'auto',
    entryIds: readStringArray(source?.['entryIds']),
    nodeOverrides: readOverrideRecord(source?.['nodeOverrides'], readNodeOverride),
    edgeOverrides: readOverrideRecord(source?.['edgeOverrides'], readEdgeOverride),
  };
}

export function getCanvasPlaybackNodeOverride(
  metadata: Pick<NormalizedCanvasPlaybackMetadata, 'nodeOverrides'>,
  node: Pick<CanvasNode, 'id'>,
): CanvasPlaybackNodeOverride {
  return metadata.nodeOverrides[node.id] ?? {};
}

export function getCanvasPlaybackEdgeOverride(
  metadata: Pick<NormalizedCanvasPlaybackMetadata, 'edgeOverrides'>,
  connection: Pick<CanvasConnection, 'id'>,
): CanvasPlaybackEdgeOverride {
  return metadata.edgeOverrides[connection.id] ?? {};
}

export function sortCanvasPlaybackContainerChildren(
  container: CanvasNode,
  nodes: readonly CanvasNode[],
  metadata: Pick<NormalizedCanvasPlaybackMetadata, 'nodeOverrides'>,
): readonly CanvasNode[] {
  if (container.type !== 'group') {
    throw new Error(`Canvas playback container "${container.id}" is not a Group`);
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childIds = getContainerChildIds(container);
  return childIds
    .map((id) => byId.get(id))
    .filter((node): node is CanvasNode => node !== undefined)
    .map((node, index) => ({ node, index }))
    .sort((left, right) => {
      const leftOrder = metadata.nodeOverrides[left.node.id]?.order;
      const rightOrder = metadata.nodeOverrides[right.node.id]?.order;
      if (leftOrder !== undefined || rightOrder !== undefined) {
        return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER);
      }
      return left.index - right.index;
    })
    .map(({ node }) => node);
}

export function sortCanvasPlaybackConnections(
  connections: readonly CanvasConnection[],
  metadata: Pick<NormalizedCanvasPlaybackMetadata, 'edgeOverrides'>,
): readonly CanvasConnection[] {
  return connections
    .filter((connection) => isCanvasPlaybackConnectionPlayable(connection, metadata))
    .map((connection, index) => ({ connection, index }))
    .sort((left, right) => {
      const leftOrder = metadata.edgeOverrides[left.connection.id]?.order;
      const rightOrder = metadata.edgeOverrides[right.connection.id]?.order;
      if (leftOrder !== undefined || rightOrder !== undefined) {
        return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER);
      }
      return left.index - right.index;
    })
    .map(({ connection }) => connection);
}

export function isCanvasPlaybackConnectionPlayable(
  connection: Pick<CanvasConnection, 'id' | 'type'>,
  metadata: Pick<NormalizedCanvasPlaybackMetadata, 'edgeOverrides'>,
): boolean {
  return connection.type === 'sequence' && metadata.edgeOverrides[connection.id]?.enabled !== false;
}

export function resolveCanvasPlaybackBehavior(
  _adapterId: ResolvedCanvasPlaybackAdapterId,
  mode: CanvasPlaybackBehaviorMode,
): {
  readonly behaviorMode: ResolvedCanvasPlaybackBehaviorMode;
  readonly advancePolicy: CanvasPlaybackAdvancePolicy;
} {
  const behaviorMode = mode === 'auto' ? 'linear' : mode;
  return {
    behaviorMode,
    advancePolicy: behaviorMode === 'manual' ? 'user-input' : 'media-ended',
  };
}

export function resolveCanvasPlaybackAdapterId(
  _canvas: CanvasData,
  _selectedNodeId: string | undefined,
  requestedAdapterId: CanvasPlaybackAdapterId,
): ResolvedCanvasPlaybackAdapterId {
  if (requestedAdapterId !== 'auto' && requestedAdapterId !== 'generic') {
    throw new Error(`Unsupported Canvas playback adapter "${String(requestedAdapterId)}"`);
  }
  return 'generic';
}

export function createCanvasPlaybackPlan(input: CreateCanvasPlaybackPlanInput): CanvasPlaybackPlan {
  const metadata = normalizeCanvasPlaybackMetadata(input.canvas);
  const requestedAdapterId = input.adapterId ?? metadata.adapterId;
  const adapterId = resolveCanvasPlaybackAdapterId(
    input.canvas,
    input.selectedNodeId,
    requestedAdapterId,
  );
  const behavior = resolveCanvasPlaybackBehavior(adapterId, input.mode ?? metadata.mode);
  const diagnostics: CanvasPlaybackDiagnostic[] = [];
  const nodeById = new Map(input.canvas.nodes.map((node) => [node.id, node]));
  const orderedNodes = projectOrderedPlayableNodes(
    input.canvas,
    metadata,
    input.selectedNodeId,
    diagnostics,
  );
  const units = orderedNodes.map((node) => projectNodeToUnit(node, metadata, diagnostics));
  const unitByNodeId = new Map(units.map((unit) => [unit.sourceNodeId, unit]));
  const sequenceConnections = sortCanvasPlaybackConnections(input.canvas.connections, metadata);
  for (const connection of sequenceConnections) {
    if (!nodeById.has(connection.sourceId) || !nodeById.has(connection.targetId)) {
      diagnostics.push({
        code: 'playback-dangling-connection',
        severity: 'error',
        message: `Canvas sequence connection "${connection.id}" has a missing endpoint.`,
        adapterId,
        connectionId: connection.id,
      });
    }
  }
  const transitions = units.slice(0, -1).map((unit, index): CanvasPlaybackTransition => {
    const target = units[index + 1];
    if (!target) throw new Error('Canvas playback transition target is missing');
    const explicit = sequenceConnections.find(
      (connection) =>
        connection.sourceId === unit.sourceNodeId && connection.targetId === target.sourceNodeId,
    );
    return {
      id: explicit?.id ?? `playback:${unit.id}:${target.id}`,
      sourceUnitId: unit.id,
      targetUnitId: target.id,
      type: 'sequence',
      priority: index,
      ...(explicit?.label ? { label: explicit.label } : {}),
      ...(explicit
        ? {
            sourceConnectionId: explicit.id,
            sourceNodeId: explicit.sourceId,
            targetNodeId: explicit.targetId,
          }
        : {}),
    };
  });
  const terminalUnits = units.map((unit, index) =>
    index === units.length - 1 ? { ...unit, terminal: true } : unit,
  );
  const entryUnitIds = resolveEntryUnitIds(
    metadata,
    input.selectedNodeId,
    unitByNodeId,
    diagnostics,
  );
  const routeCandidates = terminalUnits.length
    ? [
        {
          id: 'route:canonical',
          title: input.canvas.name || 'Canvas',
          entryUnitId: entryUnitIds[0] ?? terminalUnits[0]!.id,
          unitIds: terminalUnits.map((unit) => unit.id),
          sourceKind: resolveRouteSourceKind(metadata, input.selectedNodeId),
          ...(input.selectedNodeId ? { sourceNodeId: input.selectedNodeId } : {}),
          totalDurationMs: terminalUnits.reduce((total, unit) => total + (unit.durationMs ?? 0), 0),
        } satisfies CanvasPlaybackRouteCandidate,
      ]
    : [];
  if (terminalUnits.length === 0) {
    diagnostics.push({
      code: 'playback-missing-route',
      severity: 'warning',
      message: 'Canvas contains no playable Markdown or Media nodes.',
      adapterId,
    });
  }
  return {
    adapterId,
    requestedAdapterId,
    behaviorMode: behavior.behaviorMode,
    advancePolicy: behavior.advancePolicy,
    entryUnitIds,
    units: terminalUnits,
    transitions,
    routeCandidates,
    diagnostics,
    metadata: {
      source: 'canonical-canvas',
      playableNodeTypes: ['markdown', 'media'],
    },
  };
}

export function resolveEffectiveCanvasPlaybackRoutes(
  plan: CanvasPlaybackPlan,
  options: { readonly maxRoutes?: number } = {},
): CanvasPlaybackRouteResolution {
  const unitIds = new Set(plan.units.map((unit) => unit.id));
  const diagnostics: CanvasPlaybackDiagnostic[] = [];
  const routes = plan.routeCandidates.filter((route) => {
    const valid = route.unitIds.length > 0 && route.unitIds.every((id) => unitIds.has(id));
    if (!valid) {
      diagnostics.push({
        code: 'playback-invalid-route',
        severity: 'error',
        message: `Canvas playback route "${route.id}" references a missing unit.`,
        adapterId: plan.adapterId,
      });
    }
    return valid;
  });
  const maximum =
    options.maxRoutes === undefined ? routes.length : Math.max(0, Math.floor(options.maxRoutes));
  if (routes.length === 0) {
    diagnostics.push({
      code: 'playback-missing-route',
      severity: 'warning',
      message: 'Playback plan has no valid route candidates.',
      adapterId: plan.adapterId,
    });
  }
  return { routes: routes.slice(0, maximum), diagnostics };
}

function projectOrderedPlayableNodes(
  canvas: CanvasData,
  metadata: NormalizedCanvasPlaybackMetadata,
  selectedNodeId: string | undefined,
  diagnostics: CanvasPlaybackDiagnostic[],
): CanvasNode[] {
  const nodeById = new Map(canvas.nodes.map((node) => [node.id, node]));
  const result: CanvasNode[] = [];
  const emitted = new Set<string>();
  const visiting = new Set<string>();
  const append = (node: CanvasNode): void => {
    if (emitted.has(node.id)) return;
    if (node.type === 'markdown' || node.type === 'media') {
      if (metadata.nodeOverrides[node.id]?.role !== 'skip') {
        result.push(node);
        emitted.add(node.id);
      }
      return;
    }
    if (node.type !== 'group') return;
    if (visiting.has(node.id)) {
      diagnostics.push({
        code: 'playback-route-cycle',
        severity: 'error',
        message: `Canvas Group cycle detected at "${node.id}".`,
        adapterId: 'generic',
        nodeId: node.id,
      });
      return;
    }
    visiting.add(node.id);
    for (const child of sortCanvasPlaybackContainerChildren(node, canvas.nodes, metadata)) {
      append(child);
    }
    visiting.delete(node.id);
  };

  if (selectedNodeId) {
    const selected = nodeById.get(selectedNodeId);
    if (selected) append(selected);
  }
  for (const entryId of metadata.entryIds) {
    const entry = nodeById.get(entryId);
    if (entry) append(entry);
    else {
      diagnostics.push({
        code: 'playback-missing-entry',
        severity: 'warning',
        message: `Canvas playback entry "${entryId}" does not exist.`,
        adapterId: 'generic',
        nodeId: entryId,
      });
    }
  }
  const topLevel = canvas.nodes.filter((node) => !getNodeParentId(node));
  for (const node of topLevel) append(node);
  for (const node of canvas.nodes) append(node);
  return orderNodesBySequence(result, canvas.connections, metadata, diagnostics);
}

function orderNodesBySequence(
  nodes: readonly CanvasNode[],
  connections: readonly CanvasConnection[],
  metadata: NormalizedCanvasPlaybackMetadata,
  diagnostics: CanvasPlaybackDiagnostic[],
): CanvasNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const indexById = new Map(nodes.map((node, index) => [node.id, index]));
  const outgoing = new Map<string, string[]>();
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  for (const connection of sortCanvasPlaybackConnections(connections, metadata)) {
    if (!byId.has(connection.sourceId) || !byId.has(connection.targetId)) continue;
    outgoing.set(connection.sourceId, [
      ...(outgoing.get(connection.sourceId) ?? []),
      connection.targetId,
    ]);
    indegree.set(connection.targetId, (indegree.get(connection.targetId) ?? 0) + 1);
  }
  const queue = nodes
    .filter((node) => indegree.get(node.id) === 0)
    .sort((left, right) => (indexById.get(left.id) ?? 0) - (indexById.get(right.id) ?? 0));
  const ordered: CanvasNode[] = [];
  while (queue.length) {
    const node = queue.shift();
    if (!node) break;
    ordered.push(node);
    for (const targetId of outgoing.get(node.id) ?? []) {
      const nextDegree = (indegree.get(targetId) ?? 0) - 1;
      indegree.set(targetId, nextDegree);
      if (nextDegree === 0) {
        const target = byId.get(targetId);
        if (target) queue.push(target);
      }
    }
    queue.sort((left, right) => (indexById.get(left.id) ?? 0) - (indexById.get(right.id) ?? 0));
  }
  if (ordered.length !== nodes.length) {
    diagnostics.push({
      code: 'playback-route-cycle',
      severity: 'error',
      message: 'Canvas sequence connections contain a cycle; child order is used instead.',
      adapterId: 'generic',
    });
    return [...nodes];
  }
  return ordered;
}

function projectNodeToUnit(
  node: CanvasNode,
  metadata: NormalizedCanvasPlaybackMetadata,
  diagnostics: CanvasPlaybackDiagnostic[],
): CanvasPlaybackUnit {
  const override = metadata.nodeOverrides[node.id] ?? {};
  if (node.type === 'media') {
    if (!node.data.assetPath && !node.data.resourceRef && !node.data.documentResourceRef) {
      diagnostics.push({
        code: 'playback-missing-media-source',
        severity: 'warning',
        message: `Media node "${node.id}" has no stable source.`,
        adapterId: 'generic',
        nodeId: node.id,
      });
    }
    return {
      id: node.id,
      sourceNodeId: node.id,
      kind: 'media',
      renderMode: 'media-playback',
      label: node.data.title ?? node.id,
      ...(override.durationMs !== undefined
        ? { durationMs: override.durationMs }
        : node.data.duration !== undefined
          ? { durationMs: Math.round(node.data.duration * 1000) }
          : {}),
      ...(node.data.assetPath ? { assetPath: node.data.assetPath } : {}),
      ...(node.data.resourceRef ? { resourceRef: node.data.resourceRef } : {}),
      metadata: {
        nodeType: 'media',
        ...(node.data.mediaType ? { mediaType: node.data.mediaType } : {}),
      },
    };
  }
  if (node.type !== 'markdown') {
    throw new Error(`Canvas playback cannot project node type "${node.type}"`);
  }
  return {
    id: node.id,
    sourceNodeId: node.id,
    kind: 'node',
    renderMode: 'inline-preview',
    label: node.data.title ?? node.id,
    ...(override.durationMs !== undefined ? { durationMs: override.durationMs } : {}),
    metadata: { nodeType: 'markdown' },
  };
}

function resolveEntryUnitIds(
  metadata: NormalizedCanvasPlaybackMetadata,
  selectedNodeId: string | undefined,
  unitByNodeId: ReadonlyMap<string, CanvasPlaybackUnit>,
  diagnostics: CanvasPlaybackDiagnostic[],
): string[] {
  const requested = [...(selectedNodeId ? [selectedNodeId] : []), ...metadata.entryIds];
  const resolved = requested.flatMap((id) => {
    const unit = unitByNodeId.get(id);
    if (unit) return [unit.id];
    return [];
  });
  if (resolved.length) return [...new Set(resolved)];
  const first = unitByNodeId.values().next().value;
  if (first) return [first.id];
  if (requested.length) {
    diagnostics.push({
      code: 'playback-missing-entry',
      severity: 'warning',
      message: 'Requested Canvas playback entries are not playable.',
      adapterId: 'generic',
    });
  }
  return [];
}

function resolveRouteSourceKind(
  metadata: NormalizedCanvasPlaybackMetadata,
  selectedNodeId: string | undefined,
): CanvasPlaybackRouteSourceKind {
  if (selectedNodeId) return 'selection';
  if (metadata.entryIds.length) return 'entry';
  return 'auto-entry';
}

function readAdapterId(value: unknown): CanvasPlaybackAdapterId | undefined {
  return value === 'auto' || value === 'generic' ? value : undefined;
}

function readBehaviorMode(value: unknown): CanvasPlaybackBehaviorMode | undefined {
  return value === 'auto' || value === 'manual' || value === 'linear' ? value : undefined;
}

function readNodeOverride(value: unknown): CanvasPlaybackNodeOverride | undefined {
  if (!isRecord(value)) return undefined;
  const role = value['role'];
  const expand = value['expand'];
  return {
    ...(role === 'start' || role === 'end' || role === 'skip' || role === 'step' ? { role } : {}),
    ...(isFiniteNumber(value['order']) ? { order: value['order'] } : {}),
    ...(isFiniteNumber(value['durationMs']) && value['durationMs'] >= 0
      ? { durationMs: value['durationMs'] }
      : {}),
    ...(expand === 'self' || expand === 'children' || expand === 'recursive' ? { expand } : {}),
  };
}

function readEdgeOverride(value: unknown): CanvasPlaybackEdgeOverride | undefined {
  if (!isRecord(value)) return undefined;
  return {
    ...(typeof value['enabled'] === 'boolean' ? { enabled: value['enabled'] } : {}),
    ...(isFiniteNumber(value['order']) ? { order: value['order'] } : {}),
  };
}

function readOverrideRecord<T>(
  value: unknown,
  read: (entry: unknown) => T | undefined,
): Readonly<Record<string, T>> {
  if (!isRecord(value)) return {};
  const result: Record<string, T> = {};
  for (const [key, entry] of Object.entries(value)) {
    const parsed = read(entry);
    if (parsed) result[key] = parsed;
  }
  return result;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
