import type { ResourceRef } from './resource-cache';
import type {
  CanvasConnection,
  CanvasData,
  CanvasNode,
  MediaCanvasNode,
  SceneGroupCanvasNode,
  ShotCanvasNode,
} from './canvas';
import type { CanvasSerializableRecord, CanvasSerializableValue } from './canvas-serializable';
import { NARRATIVE_RUNTIME_NODE_TYPES } from './narrative-preview';
import {
  isNarrativeProductionBinding,
  type NarrativeProductionBinding,
} from './narrative-production-binding';
import { getContainerChildIds, getNodeParentId, isContainerNode } from '../utils/canvasLayered';

export const CANVAS_PLAYBACK_ADAPTER_IDS = [
  'auto',
  'storyboard',
  'narrative',
  'media-sequence',
  'generic',
] as const;

export type CanvasPlaybackAdapterId = (typeof CANVAS_PLAYBACK_ADAPTER_IDS)[number];
export type ResolvedCanvasPlaybackAdapterId = Exclude<CanvasPlaybackAdapterId, 'auto'>;

export const CANVAS_PLAYBACK_BEHAVIOR_MODES = ['auto', 'manual', 'linear', 'interactive'] as const;

export type CanvasPlaybackBehaviorMode = (typeof CANVAS_PLAYBACK_BEHAVIOR_MODES)[number];
export type ResolvedCanvasPlaybackBehaviorMode = Exclude<CanvasPlaybackBehaviorMode, 'auto'>;

export type CanvasPlaybackAdvancePolicy = 'timer' | 'media-ended' | 'user-input' | 'condition';
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
  readonly branchLabel?: string;
  readonly condition?: string;
}

export interface CanvasPlaybackMetadata {
  readonly version: 1;
  readonly adapterId?: CanvasPlaybackAdapterId;
  readonly mode?: CanvasPlaybackBehaviorMode;
  readonly entryIds?: readonly string[];
  readonly nodeOverrides?: Readonly<Record<string, CanvasPlaybackNodeOverride>>;
  readonly edgeOverrides?: Readonly<Record<string, CanvasPlaybackEdgeOverride>>;
}

export type CanvasPlaybackUnitKind =
  'node' | 'container' | 'media' | 'shot' | 'scene' | 'narrative';

export type CanvasPlaybackRenderMode =
  'select-node' | 'inline-preview' | 'story-preview' | 'media-playback' | 'narrative-preview';

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

export type CanvasPlaybackTransitionType = 'sequence' | 'default' | 'choice';

export interface CanvasPlaybackTransition {
  readonly id: string;
  readonly sourceUnitId: string;
  readonly targetUnitId: string;
  readonly type: CanvasPlaybackTransitionType;
  readonly priority: number;
  readonly label?: string;
  readonly condition?: string;
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
  | 'playback-route-truncated'
  | 'playback-route-cycle'
  | 'playback-unsupported-graph'
  | 'playback-dangling-node'
  | 'playback-dangling-connection'
  | 'playback-filtered-branch'
  | 'playback-unsupported-connection'
  | 'playback-missing-media-source'
  | 'playback-narrative-runtime-only';

export interface CanvasPlaybackDiagnostic {
  readonly code: CanvasPlaybackDiagnosticCode;
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
  readonly adapterId?: ResolvedCanvasPlaybackAdapterId;
  readonly nodeId?: string;
  readonly connectionId?: string;
}

export type CanvasPlaybackRouteSourceKind =
  'entry' | 'auto-entry' | 'selection' | 'container' | 'scene' | 'component' | 'single-unit';

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

interface PlaybackProjectionContext {
  readonly canvas: CanvasData;
  readonly metadata: NormalizedCanvasPlaybackMetadata;
  readonly selectedNodeId?: string;
  readonly requestedAdapterId: CanvasPlaybackAdapterId;
  readonly adapterId: ResolvedCanvasPlaybackAdapterId;
  readonly behaviorMode: ResolvedCanvasPlaybackBehaviorMode;
  readonly advancePolicy: CanvasPlaybackAdvancePolicy;
  readonly nodeById: ReadonlyMap<string, CanvasNode>;
}

export interface NormalizedCanvasPlaybackMetadata {
  readonly version: 1;
  readonly adapterId: CanvasPlaybackAdapterId;
  readonly mode: CanvasPlaybackBehaviorMode;
  readonly entryIds: readonly string[];
  readonly nodeOverrides: Readonly<Record<string, CanvasPlaybackNodeOverride>>;
  readonly edgeOverrides: Readonly<Record<string, CanvasPlaybackEdgeOverride>>;
}

interface AdapterProjection {
  readonly units: readonly CanvasPlaybackUnit[];
  readonly transitions: readonly CanvasPlaybackTransition[];
  readonly entryUnitIds: readonly string[];
  readonly diagnostics?: readonly CanvasPlaybackDiagnostic[];
}

type CanvasPlaybackRouteGraph = Pick<AdapterProjection, 'units' | 'transitions'>;

interface CanvasPlaybackAdapter {
  readonly id: ResolvedCanvasPlaybackAdapterId;
  readonly canHandle: (context: PlaybackProjectionContext) => boolean;
  readonly project: (context: PlaybackProjectionContext) => AdapterProjection;
}

const PLAYABLE_CONNECTION_TYPES = new Set<string | undefined>([
  undefined,
  'default',
  'sequence',
  'choice',
]);
const NARRATIVE_RUNTIME_NODE_TYPE_SET = new Set<string>(NARRATIVE_RUNTIME_NODE_TYPES);
const DEFAULT_CANVAS_PLAYBACK_ROUTE_CANDIDATE_CAP = 50;

export function normalizeCanvasPlaybackMetadata(
  canvas: Pick<CanvasData, 'playback'> | Record<string, unknown>,
): NormalizedCanvasPlaybackMetadata {
  const playbackValue = (canvas as { readonly playback?: unknown }).playback;
  const source = isRecord(playbackValue) ? playbackValue : undefined;
  const adapterId = readAdapterId(source?.['adapterId']) ?? 'auto';
  const mode = readBehaviorMode(source?.['mode']) ?? 'auto';

  return {
    version: 1,
    adapterId,
    mode,
    entryIds: readStringArray(source?.['entryIds']),
    nodeOverrides: readOverrideRecord(source?.['nodeOverrides'], readNodeOverride),
    edgeOverrides: readOverrideRecord(source?.['edgeOverrides'], readEdgeOverride),
  };
}

export function getCanvasPlaybackNodeOverride(
  metadata: Pick<NormalizedCanvasPlaybackMetadata, 'nodeOverrides'>,
  node: Pick<CanvasNode, 'id' | 'extension'>,
): CanvasPlaybackNodeOverride {
  return {
    ...(metadata.nodeOverrides[node.id] ?? {}),
    ...readNodeOverride(readExtensionPlaybackRecord(node.extension)),
  };
}

export function getCanvasPlaybackEdgeOverride(
  metadata: Pick<NormalizedCanvasPlaybackMetadata, 'edgeOverrides'>,
  connection: Pick<CanvasConnection, 'id' | 'extension'>,
): CanvasPlaybackEdgeOverride {
  return {
    ...(metadata.edgeOverrides[connection.id] ?? {}),
    ...readEdgeOverride(readExtensionPlaybackRecord(connection.extension)),
  };
}

export function sortCanvasPlaybackContainerChildren(
  container: CanvasNode,
  nodes: readonly CanvasNode[],
  metadata: Pick<NormalizedCanvasPlaybackMetadata, 'nodeOverrides'>,
): readonly CanvasNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const childIds = getContainerChildIds(container);
  return childIds
    .map((childId) => nodeById.get(childId))
    .filter((node): node is CanvasNode => Boolean(node))
    .slice()
    .sort((left, right) => comparePlaybackNodes(left, right, container, childIds, metadata));
}

export function sortCanvasPlaybackConnections(
  connections: readonly CanvasConnection[],
  metadata: Pick<NormalizedCanvasPlaybackMetadata, 'edgeOverrides'>,
  options: { readonly includeTransition?: boolean } = {},
): readonly CanvasConnection[] {
  return connections
    .filter((connection) => isCanvasPlaybackConnectionPlayable(connection, metadata, options))
    .map((connection, index) => ({ connection, index }))
    .sort((left, right) => comparePlaybackConnections(left, right, metadata))
    .map((entry) => entry.connection);
}

export function isCanvasPlaybackConnectionPlayable(
  connection: Pick<CanvasConnection, 'id' | 'type' | 'extension'>,
  metadata: Pick<NormalizedCanvasPlaybackMetadata, 'edgeOverrides'>,
  options: { readonly includeTransition?: boolean } = {},
): boolean {
  const override = getCanvasPlaybackEdgeOverride(metadata, connection);
  if (override.enabled === false) return false;
  if (connection.type === 'transition') return options.includeTransition === true;
  return PLAYABLE_CONNECTION_TYPES.has(connection.type);
}

export function resolveCanvasPlaybackBehavior(
  adapterId: ResolvedCanvasPlaybackAdapterId,
  mode: CanvasPlaybackBehaviorMode,
): {
  readonly behaviorMode: ResolvedCanvasPlaybackBehaviorMode;
  readonly advancePolicy: CanvasPlaybackAdvancePolicy;
} {
  const behaviorMode = mode === 'auto' ? defaultBehaviorModeForAdapter(adapterId) : mode;
  return {
    behaviorMode,
    advancePolicy: defaultAdvancePolicyForAdapter(adapterId, behaviorMode),
  };
}

export function resolveEffectiveCanvasPlaybackRoutes(
  plan: CanvasPlaybackPlan,
  options: { readonly maxRoutes?: number } = {},
): CanvasPlaybackRouteResolution {
  const maxRoutes = normalizeRouteCandidateCap(options.maxRoutes);
  if (plan.routeCandidates.length === 0) {
    return {
      routes: [],
      diagnostics: [
        playbackRouteDiagnostic(
          plan,
          'playback-missing-route',
          'warning',
          'Playback plan has no route candidates.',
        ),
      ],
    };
  }
  return limitCanvasPlaybackRouteCandidates(
    validateAndSortCanvasPlaybackRouteCandidates(plan.routeCandidates, plan),
    plan,
    maxRoutes,
  );
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
  const context: PlaybackProjectionContext = {
    canvas: input.canvas,
    metadata,
    selectedNodeId: input.selectedNodeId,
    requestedAdapterId,
    adapterId,
    behaviorMode: behavior.behaviorMode,
    advancePolicy: behavior.advancePolicy,
    nodeById: new Map(input.canvas.nodes.map((node) => [node.id, node])),
  };
  const adapter = CANVAS_PLAYBACK_ADAPTERS.find((candidate) => candidate.id === adapterId);
  const projection =
    adapter?.project(context) ?? emptyProjection(context, 'No playback adapter was available.');
  const diagnostics = [
    ...validateProjectionReferences(context, projection),
    ...(projection.diagnostics ?? []),
  ];
  const terminalUnitIds = resolveTerminalUnitIds(projection.units, projection.transitions);
  const units = projection.units.map((unit) =>
    terminalUnitIds.has(unit.id) || unit.terminal ? { ...unit, terminal: true } : unit,
  );
  const transitions = projection.transitions;
  const routeCandidates = createCanvasPlaybackRouteCandidates(context, {
    units,
    transitions,
    entryUnitIds: projection.entryUnitIds,
  });

  return {
    adapterId,
    requestedAdapterId,
    behaviorMode: behavior.behaviorMode,
    advancePolicy: behavior.advancePolicy,
    entryUnitIds: projection.entryUnitIds,
    units,
    transitions,
    routeCandidates,
    diagnostics,
    metadata: { sourceCanvasName: input.canvas.name },
  };
}

export function resolveCanvasPlaybackAdapterId(
  canvas: CanvasData,
  selectedNodeId: string | undefined,
  requestedAdapterId: CanvasPlaybackAdapterId,
): ResolvedCanvasPlaybackAdapterId {
  if (requestedAdapterId !== 'auto') return requestedAdapterId;
  const selected = selectedNodeId
    ? canvas.nodes.find((node) => node.id === selectedNodeId)
    : undefined;
  if (selected && isNarrativeRuntimeNode(selected)) return 'narrative';
  if (selected && (selected.type === 'scene' || selected.type === 'shot')) return 'storyboard';
  if (selected?.type === 'media') return 'media-sequence';
  if (canvas.nodes.some(isNarrativeRuntimeNode)) return 'narrative';
  if (canvas.nodes.some((node) => node.type === 'scene' || node.type === 'shot'))
    return 'storyboard';
  if (canvas.nodes.some((node) => node.type === 'media')) return 'media-sequence';
  return 'generic';
}

function projectStoryboard(context: PlaybackProjectionContext): AdapterProjection {
  const selected = context.selectedNodeId
    ? context.nodeById.get(context.selectedNodeId)
    : undefined;
  const explicitStoryboardEntry = resolveStoryboardExplicitEntry(context);
  const startScene = resolveStoryboardStartScene(context, explicitStoryboardEntry ?? selected);
  const startShot =
    explicitStoryboardEntry?.type === 'shot'
      ? explicitStoryboardEntry
      : selected?.type === 'shot'
        ? selected
        : undefined;
  if (startShot && !startScene) {
    return {
      units: [toPlaybackUnit(startShot, context)],
      transitions: outgoingNodeTransitions(context, new Set([startShot.id])),
      entryUnitIds: [startShot.id],
    };
  }
  if (!startScene) {
    return emptyProjection(context, 'Storyboard playback has no Scene or Shot entry.');
  }

  const visitedScenes = new Set<string>();
  const units: CanvasPlaybackUnit[] = [];
  const transitions: CanvasPlaybackTransition[] = [];
  const entryUnitIds: string[] = [];
  const sceneQueue: Array<{ scene: SceneGroupCanvasNode; startShotId?: string }> = [
    { scene: startScene, startShotId: startShot?.id },
  ];

  while (sceneQueue.length > 0) {
    const item = sceneQueue.shift();
    if (!item || visitedScenes.has(item.scene.id)) continue;
    visitedScenes.add(item.scene.id);
    const sceneUnits = projectSceneUnits(context, item.scene, item.startShotId);
    if (entryUnitIds.length === 0 && sceneUnits.units[0]) entryUnitIds.push(sceneUnits.units[0].id);
    units.push(...sceneUnits.units);
    transitions.push(...sceneUnits.transitions);

    const sceneConnections = sortCanvasPlaybackConnections(
      context.canvas.connections.filter((connection) => connection.sourceId === item.scene.id),
      context.metadata,
    ).filter((connection) => context.nodeById.get(connection.targetId)?.type === 'scene');

    for (const connection of sceneConnections) {
      const targetScene = context.nodeById.get(connection.targetId);
      if (targetScene?.type !== 'scene') continue;
      const targetUnits = projectSceneUnits(context, targetScene);
      const lastSourceUnit = sceneUnits.units[sceneUnits.units.length - 1];
      const firstTargetUnit = targetUnits.units[0];
      if (lastSourceUnit && firstTargetUnit) {
        transitions.push(
          toPlaybackTransition(connection, lastSourceUnit.id, firstTargetUnit.id, context),
        );
      }
      sceneQueue.push({ scene: targetScene });
    }
  }

  return finalizeProjectionEntries(context, { units, transitions, entryUnitIds });
}

function projectNarrative(context: PlaybackProjectionContext): AdapterProjection {
  const nodes = context.canvas.nodes.filter(isNarrativeRuntimeNode);
  if (nodes.length === 0) {
    return emptyProjection(
      context,
      'Narrative playback requires narrative-start, narrative-scene, choice, merge, or narrative-ending nodes.',
      'playback-narrative-runtime-only',
    );
  }
  const unitIds = new Set(nodes.map((node) => node.id));
  const units = nodes.map((node) => toPlaybackUnit(node, context));
  const transitions = sortCanvasPlaybackConnections(context.canvas.connections, context.metadata)
    .filter((connection) => unitIds.has(connection.sourceId) && unitIds.has(connection.targetId))
    .map((connection) =>
      toPlaybackTransition(connection, connection.sourceId, connection.targetId, context),
    );
  const start =
    nodes.find((node) => node.type === 'narrative-start')?.id ??
    (context.canvas.narrative?.entryNodeId && unitIds.has(context.canvas.narrative.entryNodeId)
      ? context.canvas.narrative.entryNodeId
      : undefined);
  return finalizeProjectionEntries(context, {
    units,
    transitions,
    entryUnitIds: start ? [start] : [],
  });
}

function projectMediaSequence(context: PlaybackProjectionContext): AdapterProjection {
  const selected = context.selectedNodeId
    ? context.nodeById.get(context.selectedNodeId)
    : undefined;
  const mediaNodes =
    selected?.type === 'media'
      ? collectReachableNodes(
          context,
          selected,
          (node): node is MediaCanvasNode => node.type === 'media',
        )
      : context.canvas.nodes.filter((node): node is MediaCanvasNode => node.type === 'media');
  const units = mediaNodes.map((node) => toPlaybackUnit(node, context));
  const unitIds = new Set(units.map((unit) => unit.id));
  const transitions = sortCanvasPlaybackConnections(context.canvas.connections, context.metadata)
    .filter((connection) => unitIds.has(connection.sourceId) && unitIds.has(connection.targetId))
    .map((connection) =>
      toPlaybackTransition(connection, connection.sourceId, connection.targetId, context),
    );

  return finalizeProjectionEntries(context, {
    units,
    transitions: transitions.length > 0 ? transitions : syntheticSequenceTransitions(units),
    entryUnitIds: selected?.type === 'media' ? [selected.id] : [],
    diagnostics: mediaDiagnostics(context, mediaNodes),
  });
}

function projectGeneric(context: PlaybackProjectionContext): AdapterProjection {
  const selected = context.selectedNodeId
    ? context.nodeById.get(context.selectedNodeId)
    : undefined;
  if (selected) {
    const expansion = getCanvasPlaybackNodeOverride(context.metadata, selected).expand ?? 'self';
    const units =
      expansion === 'self' && !isContainerNode(selected)
        ? collectReachableNodes(context, selected, isCanvasPlaybackNode).map((node) =>
            toPlaybackUnit(node, context),
          )
        : expandPlaybackNode(context, selected, expansion);
    const unitIds = new Set(units.map((unit) => unit.id));
    const transitions = sortCanvasPlaybackConnections(context.canvas.connections, context.metadata)
      .filter((connection) => unitIds.has(connection.sourceId) && unitIds.has(connection.targetId))
      .map((connection) =>
        toPlaybackTransition(connection, connection.sourceId, connection.targetId, context),
      );
    return finalizeProjectionEntries(context, {
      units,
      transitions: transitions.length > 0 ? transitions : syntheticSequenceTransitions(units),
      entryUnitIds: units[0] ? [units[0].id] : [],
    });
  }

  const topLevelNodes = context.canvas.nodes.filter((node) => !getNodeParentId(node));
  const units = topLevelNodes.map((node) => toPlaybackUnit(node, context));
  const unitIds = new Set(units.map((unit) => unit.id));
  const transitions = sortCanvasPlaybackConnections(context.canvas.connections, context.metadata)
    .filter((connection) => unitIds.has(connection.sourceId) && unitIds.has(connection.targetId))
    .map((connection) =>
      toPlaybackTransition(connection, connection.sourceId, connection.targetId, context),
    );
  return finalizeProjectionEntries(context, { units, transitions, entryUnitIds: [] });
}

function projectSceneUnits(
  context: PlaybackProjectionContext,
  scene: SceneGroupCanvasNode,
  startShotId?: string,
): {
  readonly units: readonly CanvasPlaybackUnit[];
  readonly transitions: readonly CanvasPlaybackTransition[];
} {
  const orderedShots = sortCanvasPlaybackContainerChildren(
    scene,
    context.canvas.nodes,
    context.metadata,
  ).filter((node): node is ShotCanvasNode => node.type === 'shot');
  const startIndex = startShotId
    ? Math.max(
        0,
        orderedShots.findIndex((shot) => shot.id === startShotId),
      )
    : 0;
  const shots = orderedShots.slice(startIndex >= 0 ? startIndex : 0);
  const units =
    shots.length > 0
      ? shots.map((shot) => toPlaybackUnit(shot, context))
      : [toPlaybackUnit(scene, context)];
  return { units, transitions: syntheticSequenceTransitions(units) };
}

function expandPlaybackNode(
  context: PlaybackProjectionContext,
  node: CanvasNode,
  expansion: CanvasPlaybackExpansion,
  visiting: ReadonlySet<string> = new Set(),
): readonly CanvasPlaybackUnit[] {
  if (expansion === 'self' || !isContainerNode(node)) return [toPlaybackUnit(node, context)];
  if (visiting.has(node.id)) return [];
  const nextVisiting = new Set(visiting);
  nextVisiting.add(node.id);
  const children = sortCanvasPlaybackContainerChildren(
    node,
    context.canvas.nodes,
    context.metadata,
  );
  if (expansion === 'children') return children.map((child) => toPlaybackUnit(child, context));
  return children.flatMap((child) =>
    isContainerNode(child)
      ? expandPlaybackNode(
          context,
          child,
          getCanvasPlaybackNodeOverride(context.metadata, child).expand ?? 'children',
          nextVisiting,
        )
      : [toPlaybackUnit(child, context)],
  );
}

function outgoingNodeTransitions(
  context: PlaybackProjectionContext,
  unitIds: ReadonlySet<string>,
): readonly CanvasPlaybackTransition[] {
  return sortCanvasPlaybackConnections(context.canvas.connections, context.metadata)
    .filter((connection) => unitIds.has(connection.sourceId) && unitIds.has(connection.targetId))
    .map((connection) =>
      toPlaybackTransition(connection, connection.sourceId, connection.targetId, context),
    );
}

function createCanvasPlaybackRouteCandidates(
  context: PlaybackProjectionContext,
  projection: Pick<AdapterProjection, 'units' | 'transitions' | 'entryUnitIds'>,
): readonly CanvasPlaybackRouteCandidate[] {
  if (projection.units.length === 0) return [];
  const unitById = new Map(projection.units.map((unit) => [unit.id, unit]));
  const playableUnitIds = new Set(projection.units.map((unit) => unit.id));
  const explicitEntryUnitIds = new Set(
    context.metadata.entryIds
      .map((entryId) =>
        resolveExplicitPlaybackEntryUnitId(context, projection.units, playableUnitIds, entryId),
      )
      .filter((entryId): entryId is string => Boolean(entryId)),
  );
  const candidates: CanvasPlaybackRouteCandidate[] = [];
  const seenRouteKeys = new Set<string>();

  const addRoute = (
    sourceKind: CanvasPlaybackRouteSourceKind,
    entryUnitId: string | undefined,
    routeId: string,
    title?: string,
    sourceNodeId?: string,
  ) => {
    if (!entryUnitId || !unitById.has(entryUnitId)) return;
    const routePath = buildDefaultCanvasPlaybackRoutePath(projection, entryUnitId);
    const unitIds = routePath.unitIds;
    if (unitIds.length === 0) return;
    const routeKey = `${entryUnitId}:${unitIds.join('>')}`;
    const semanticRouteKey = sourceKind === 'selection' ? `${sourceKind}:${routeKey}` : routeKey;
    if (seenRouteKeys.has(semanticRouteKey)) return;
    seenRouteKeys.add(semanticRouteKey);
    const entryUnit = unitById.get(entryUnitId);
    candidates.push({
      id: routeId,
      title: title ?? entryUnit?.label ?? entryUnitId,
      entryUnitId,
      unitIds,
      sourceKind,
      ...((sourceNodeId ?? entryUnit?.sourceNodeId)
        ? { sourceNodeId: sourceNodeId ?? entryUnit?.sourceNodeId }
        : {}),
      totalDurationMs: resolveRouteDurationMs(unitIds, projection),
      ...(routePath.cycleUnitId
        ? {
            diagnostics: [
              playbackRouteDiagnostic(
                context,
                'playback-route-cycle',
                'warning',
                `Playback route "${routeId}" stopped before repeated unit "${routePath.cycleUnitId}".`,
                sourceNodeId ?? entryUnit?.sourceNodeId,
              ),
            ],
          }
        : {}),
    });
  };

  for (const entryUnitId of projection.entryUnitIds) {
    const sourceKind: CanvasPlaybackRouteSourceKind = explicitEntryUnitIds.has(entryUnitId)
      ? 'entry'
      : 'auto-entry';
    addRoute(sourceKind, entryUnitId, `${sourceKind}:${entryUnitId}`);
  }

  if (context.selectedNodeId) {
    const selectedNode = context.nodeById.get(context.selectedNodeId);
    const selectedUnit =
      projection.units.find(
        (unit) =>
          unit.sourceNodeId === context.selectedNodeId || unit.id === context.selectedNodeId,
      ) ??
      (selectedNode && isContainerNode(selectedNode)
        ? findFirstPlaybackUnitForContainer(context, selectedNode, projection.units)
        : undefined);
    addRoute(
      'selection',
      selectedUnit?.id,
      `selection:${selectedUnit?.id ?? context.selectedNodeId}`,
      selectedNode ? readNodeLabel(selectedNode) : selectedUnit?.label,
      context.selectedNodeId,
    );
  }

  for (const sourceNode of context.canvas.nodes) {
    if (!isContainerNode(sourceNode)) continue;
    const unit = findFirstPlaybackUnitForContainer(context, sourceNode, projection.units);
    if (!unit) continue;
    const sourceKind: CanvasPlaybackRouteSourceKind =
      sourceNode.type === 'scene' ? 'scene' : 'container';
    addRoute(
      sourceKind,
      unit.id,
      `${sourceKind}:${sourceNode.id}`,
      readNodeLabel(sourceNode) ?? unit.label,
      sourceNode.id,
    );
  }

  for (const entryUnitId of findConnectedComponentEntryUnitIds(projection)) {
    addRoute('component', entryUnitId, `component:${entryUnitId}`);
  }

  if (projection.units.length === 1) {
    const unit = projection.units[0];
    if (unit) {
      addRoute('single-unit', unit.id, `single-unit:${unit.id}`);
    }
  }

  return candidates;
}

function findFirstPlaybackUnitForContainer(
  context: PlaybackProjectionContext,
  container: CanvasNode,
  units: readonly CanvasPlaybackUnit[],
): CanvasPlaybackUnit | undefined {
  const childIds = new Set(collectContainerDescendantNodeIds(context, container));
  return units.find((unit) => childIds.has(unit.sourceNodeId));
}

function collectContainerDescendantNodeIds(
  context: PlaybackProjectionContext,
  container: CanvasNode,
  visited: ReadonlySet<string> = new Set(),
): readonly string[] {
  if (visited.has(container.id)) return [];
  const nextVisited = new Set(visited);
  nextVisited.add(container.id);
  const output: string[] = [];
  for (const childId of getContainerChildIds(container)) {
    output.push(childId);
    const child = context.nodeById.get(childId);
    if (child && isContainerNode(child)) {
      output.push(...collectContainerDescendantNodeIds(context, child, nextVisited));
    }
  }
  return output;
}

function buildDefaultCanvasPlaybackRoutePath(
  graph: CanvasPlaybackRouteGraph,
  entryUnitId: string,
): { readonly unitIds: readonly string[]; readonly cycleUnitId?: string } {
  const unitIds: string[] = [];
  const visited = new Set<string>();
  const playableUnitIds = new Set(graph.units.map((unit) => unit.id));
  let current: string | undefined = entryUnitId;
  while (current && !visited.has(current) && unitIds.length <= graph.units.length) {
    if (!playableUnitIds.has(current)) break;
    unitIds.push(current);
    visited.add(current);
    const next: CanvasPlaybackTransition | undefined = getSortedOutgoingPlaybackTransitions(
      graph,
      current,
    )[0];
    current = next?.targetUnitId;
  }
  return current && visited.has(current) ? { unitIds, cycleUnitId: current } : { unitIds };
}

function getSortedOutgoingPlaybackTransitions(
  graph: Pick<CanvasPlaybackRouteGraph, 'transitions'>,
  unitId: string,
): readonly CanvasPlaybackTransition[] {
  return graph.transitions
    .filter((transition) => transition.sourceUnitId === unitId && transition.enabled !== false)
    .slice()
    .sort(compareCanvasPlaybackTransitions);
}

function findConnectedComponentEntryUnitIds(
  projection: Pick<AdapterProjection, 'units' | 'transitions'>,
): readonly string[] {
  const unitIds = new Set(projection.units.map((unit) => unit.id));
  const visited = new Set<string>();
  const adjacency = new Map<string, Set<string>>();
  for (const unitId of unitIds) {
    adjacency.set(unitId, new Set());
  }
  for (const transition of projection.transitions) {
    if (!unitIds.has(transition.sourceUnitId) || !unitIds.has(transition.targetUnitId)) continue;
    adjacency.get(transition.sourceUnitId)?.add(transition.targetUnitId);
    adjacency.get(transition.targetUnitId)?.add(transition.sourceUnitId);
  }

  const entries: string[] = [];
  for (const unit of projection.units) {
    if (visited.has(unit.id)) continue;
    const component = collectPlaybackComponent(unit.id, adjacency, visited);
    const componentSet = new Set(component);
    const zeroIncoming = component.find(
      (unitId) =>
        !projection.transitions.some(
          (transition) =>
            transition.targetUnitId === unitId && componentSet.has(transition.sourceUnitId),
        ),
    );
    entries.push(zeroIncoming ?? component[0] ?? unit.id);
  }
  return entries;
}

function collectPlaybackComponent(
  startUnitId: string,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  visited: Set<string>,
): readonly string[] {
  const output: string[] = [];
  const queue = [startUnitId];
  while (queue.length > 0) {
    const unitId = queue.shift();
    if (!unitId || visited.has(unitId)) continue;
    visited.add(unitId);
    output.push(unitId);
    for (const next of adjacency.get(unitId) ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }
  return output;
}

function validateAndSortCanvasPlaybackRouteCandidates(
  routes: readonly CanvasPlaybackRouteCandidate[],
  plan: CanvasPlaybackPlan,
): CanvasPlaybackRouteResolution {
  const unitIds = new Set(plan.units.map((unit) => unit.id));
  const diagnostics: CanvasPlaybackDiagnostic[] = [];
  const seenRouteIds = new Set<string>();
  const validRoutes: Array<{
    readonly route: CanvasPlaybackRouteCandidate;
    readonly index: number;
  }> = [];

  for (const [index, route] of routes.entries()) {
    const routeDiagnostics: CanvasPlaybackDiagnostic[] = [];
    if (!route.id) {
      routeDiagnostics.push(
        playbackRouteDiagnostic(
          plan,
          'playback-invalid-route',
          'warning',
          'Playback route candidate is missing an id.',
          route.sourceNodeId,
        ),
      );
    } else if (seenRouteIds.has(route.id)) {
      routeDiagnostics.push(
        playbackRouteDiagnostic(
          plan,
          'playback-invalid-route',
          'warning',
          `Playback route candidate "${route.id}" is duplicated.`,
          route.sourceNodeId,
        ),
      );
    }
    if (!unitIds.has(route.entryUnitId)) {
      routeDiagnostics.push(
        playbackRouteDiagnostic(
          plan,
          'playback-missing-entry',
          'warning',
          `Playback route "${route.id || route.entryUnitId}" entry "${route.entryUnitId}" is not a playable unit.`,
          route.sourceNodeId,
        ),
      );
    }
    const usableUnitIds = route.unitIds.filter((unitId) => unitIds.has(unitId));
    if (usableUnitIds.length === 0) {
      routeDiagnostics.push(
        playbackRouteDiagnostic(
          plan,
          'playback-missing-unit',
          'warning',
          `Playback route "${route.id || route.entryUnitId}" has no playable units.`,
          route.sourceNodeId,
        ),
      );
    }
    diagnostics.push(...routeDiagnostics, ...(route.diagnostics ?? []));
    if (routeDiagnostics.length > 0 || !route.id || seenRouteIds.has(route.id)) {
      continue;
    }
    seenRouteIds.add(route.id);
    validRoutes.push({
      index,
      route: {
        ...route,
        unitIds: usableUnitIds,
        totalDurationMs: route.totalDurationMs ?? resolveRouteDurationMs(usableUnitIds, plan),
      },
    });
  }

  return {
    routes: validRoutes
      .slice()
      .sort(compareIndexedCanvasPlaybackRouteCandidates)
      .map((entry) => entry.route),
    diagnostics,
  };
}

function limitCanvasPlaybackRouteCandidates(
  resolution: CanvasPlaybackRouteResolution,
  plan: CanvasPlaybackPlan,
  maxRoutes: number,
): CanvasPlaybackRouteResolution {
  if (resolution.routes.length <= maxRoutes) return resolution;
  const truncatedCount = resolution.routes.length - maxRoutes;
  return {
    routes: resolution.routes.slice(0, maxRoutes),
    diagnostics: [
      ...resolution.diagnostics,
      playbackRouteDiagnostic(
        plan,
        'playback-route-truncated',
        'info',
        `Playback route candidates exceeded the limit of ${maxRoutes}; ${truncatedCount} routes were omitted.`,
      ),
    ],
  };
}

function compareCanvasPlaybackTransitions(
  left: CanvasPlaybackTransition,
  right: CanvasPlaybackTransition,
): number {
  return firstNonZero([left.priority - right.priority, left.id.localeCompare(right.id)]);
}

function compareIndexedCanvasPlaybackRouteCandidates(
  left: { readonly route: CanvasPlaybackRouteCandidate; readonly index: number },
  right: { readonly route: CanvasPlaybackRouteCandidate; readonly index: number },
): number {
  return firstNonZero([
    routeSourceKindOrder(left.route.sourceKind) - routeSourceKindOrder(right.route.sourceKind),
    left.index - right.index,
    left.route.title.localeCompare(right.route.title),
    left.route.entryUnitId.localeCompare(right.route.entryUnitId),
    left.route.id.localeCompare(right.route.id),
  ]);
}

function routeSourceKindOrder(kind: CanvasPlaybackRouteSourceKind): number {
  switch (kind) {
    case 'entry':
      return 0;
    case 'auto-entry':
      return 1;
    case 'selection':
      return 2;
    case 'scene':
      return 3;
    case 'container':
      return 4;
    case 'component':
      return 5;
    case 'single-unit':
      return 6;
  }
}

function resolveRouteDurationMs(
  unitIds: readonly string[],
  graph: Pick<CanvasPlaybackRouteGraph, 'units'>,
): number | undefined {
  let total = 0;
  let hasDuration = false;
  for (const unitId of unitIds) {
    const durationMs = graph.units.find((unit) => unit.id === unitId)?.durationMs;
    if (typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= 0) {
      total += durationMs;
      hasDuration = true;
    }
  }
  return hasDuration ? total : undefined;
}

function normalizeRouteCandidateCap(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : DEFAULT_CANVAS_PLAYBACK_ROUTE_CANDIDATE_CAP;
}

function finalizeProjectionEntries(
  context: PlaybackProjectionContext,
  projection: AdapterProjection,
): AdapterProjection {
  const unitIds = new Set(projection.units.map((unit) => unit.id));
  const explicitEntry = context.metadata.entryIds
    .map((entryId) =>
      resolveExplicitPlaybackEntryUnitId(context, projection.units, unitIds, entryId),
    )
    .find((entryId): entryId is string => Boolean(entryId));
  const roleStart = projection.units.find((unit) => {
    const node = context.nodeById.get(unit.sourceNodeId);
    return node && getCanvasPlaybackNodeOverride(context.metadata, node).role === 'start';
  });
  const zeroIncoming = projection.units.find(
    (unit) => !projection.transitions.some((transition) => transition.targetUnitId === unit.id),
  );
  const selected =
    context.selectedNodeId && unitIds.has(context.selectedNodeId)
      ? context.selectedNodeId
      : undefined;
  const fallback = projection.units[0]?.id;
  const entryUnitIds = explicitEntry
    ? [explicitEntry]
    : projection.entryUnitIds.length > 0
      ? projection.entryUnitIds.filter((entryId) => unitIds.has(entryId))
      : [roleStart?.id ?? zeroIncoming?.id ?? selected ?? fallback].filter(
          (entryId): entryId is string => Boolean(entryId),
        );

  return {
    ...projection,
    entryUnitIds,
    diagnostics: [
      ...(projection.diagnostics ?? []),
      ...(entryUnitIds.length === 0 && projection.units.length > 0
        ? [
            diagnostic(
              context,
              'playback-missing-entry',
              'warning',
              'Playback plan has no resolved entry unit.',
            ),
          ]
        : []),
      ...(projection.units.length === 0
        ? [
            diagnostic(
              context,
              'playback-missing-unit',
              'warning',
              'Playback plan has no playable units.',
            ),
          ]
        : []),
    ],
  };
}

function resolveExplicitPlaybackEntryUnitId(
  context: PlaybackProjectionContext,
  units: readonly CanvasPlaybackUnit[],
  unitIds: ReadonlySet<string>,
  entryId: string,
): string | undefined {
  if (unitIds.has(entryId)) {
    return entryId;
  }
  const directUnit = units.find((unit) => unit.sourceNodeId === entryId);
  if (directUnit) {
    return directUnit.id;
  }
  const node = context.nodeById.get(entryId);
  if (node && isContainerNode(node)) {
    return findFirstPlaybackUnitForContainer(context, node, units)?.id;
  }
  return undefined;
}

function syntheticSequenceTransitions(
  units: readonly CanvasPlaybackUnit[],
): readonly CanvasPlaybackTransition[] {
  const transitions: CanvasPlaybackTransition[] = [];
  for (let index = 0; index < units.length - 1; index += 1) {
    const source = units[index];
    const target = units[index + 1];
    if (!source || !target) continue;
    transitions.push({
      id: `synthetic-sequence:${source.id}:${target.id}`,
      sourceUnitId: source.id,
      targetUnitId: target.id,
      type: 'sequence',
      priority: index,
      sourceNodeId: source.sourceNodeId,
      targetNodeId: target.sourceNodeId,
    });
  }
  return transitions;
}

function toPlaybackUnit(node: CanvasNode, context: PlaybackProjectionContext): CanvasPlaybackUnit {
  const override = getCanvasPlaybackNodeOverride(context.metadata, node);
  const productionBindingPreview = createNarrativeProductionBindingPlaybackPreview(node);
  const metadata = {
    ...copyPlaybackMetadata(node.data),
    ...(productionBindingPreview.metadata ?? {}),
  };
  const durationMs = resolvePlaybackUnitDurationMs(node, override);
  const assetPath =
    node.type === 'media' ? readDurablePlaybackString(node.data.assetPath) : undefined;
  return {
    id: node.id,
    sourceNodeId: node.id,
    kind: playbackUnitKindForNode(node),
    renderMode: renderModeForNode(node),
    label: readNodeLabel(node),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(override.role === 'end' ? { terminal: true } : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    ...(assetPath ? { assetPath } : {}),
    ...(productionBindingPreview.resourceRef
      ? { resourceRef: productionBindingPreview.resourceRef }
      : {}),
    ...(node.type === 'media' && node.data.resourceRef
      ? { resourceRef: node.data.resourceRef }
      : {}),
  };
}

function createNarrativeProductionBindingPlaybackPreview(node: CanvasNode): {
  readonly resourceRef?: ResourceRef;
  readonly metadata?: CanvasSerializableRecord;
} {
  if (node.type !== 'narrative-scene') return {};
  const productionRefs: NarrativeProductionBinding[] = Array.isArray(node.data.productionRefs)
    ? (node.data.productionRefs as readonly unknown[]).filter(isNarrativeProductionBinding)
    : [];
  const binding =
    productionRefs.find(
      (candidate) => candidate.role === 'primary' && candidate.target.kind === 'generated-video',
    ) ??
    productionRefs.find(
      (candidate) => candidate.role === 'fallback' && candidate.target.kind === 'generated-video',
    );
  if (!binding || binding.target.kind !== 'generated-video') return {};
  const ref = binding.target.ref;
  const resourceRef =
    ref.kind === 'generated-asset'
      ? ref.resourceRef
      : ref.kind === 'resource'
        ? ref.resource
        : ref.kind === 'tool-result' || ref.kind === 'perception-card'
          ? ref.resourceRef
          : undefined;
  return {
    ...(resourceRef ? { resourceRef } : {}),
    metadata: {
      previewMediaType: 'video',
      productionBindingId: binding.bindingId,
      productionBindingRole: binding.role,
      productionTargetKind: binding.target.kind,
    },
  };
}

function resolvePlaybackUnitDurationMs(
  node: CanvasNode,
  override: CanvasPlaybackNodeOverride,
): number | undefined {
  if (override.durationMs !== undefined) return override.durationMs;
  const data = isRecord(node.data) ? (node.data as Readonly<Record<string, unknown>>) : undefined;
  const durationSeconds = data?.['duration'];
  return typeof durationSeconds === 'number' &&
    Number.isFinite(durationSeconds) &&
    durationSeconds >= 0
    ? Math.round(durationSeconds * 1000)
    : undefined;
}

function copyPlaybackMetadata(value: unknown): CanvasSerializableRecord {
  if (!isRecord(value)) return {};
  const result: Record<string, CanvasSerializableValue> = {};
  for (const [key, field] of Object.entries(value)) {
    if (isRuntimeOnlyMetadataKey(key)) continue;
    const copied = copyPlaybackMetadataValue(field);
    if (copied !== undefined) {
      result[key] = copied;
    }
  }
  return result;
}

function copyPlaybackMetadataValue(value: unknown): CanvasSerializableValue | undefined {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return typeof value === 'string' && isRuntimePlaybackUrl(value) ? undefined : value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    return value
      .map(copyPlaybackMetadataValue)
      .filter((item): item is CanvasSerializableValue => item !== undefined);
  }
  if (isRecord(value)) {
    const record = copyPlaybackMetadata(value);
    return Object.keys(record).length > 0 ? record : undefined;
  }
  return undefined;
}

function readDurablePlaybackString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 && !isRuntimePlaybackUrl(value)
    ? value
    : undefined;
}

function isRuntimeOnlyMetadataKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized.startsWith('runtime') ||
    normalized === 'webviewuri' ||
    normalized === 'webviewurl' ||
    normalized === 'previewuri' ||
    normalized === 'previewurl' ||
    normalized === 'previewsessionid' ||
    normalized === 'activerouteid' ||
    normalized === 'branchselections' ||
    normalized === 'routecandidates' ||
    normalized === 'mediahandles' ||
    normalized === 'activemediasurfaceid' ||
    normalized === 'proxypath' ||
    normalized.endsWith('token')
  );
}

function isRuntimePlaybackUrl(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith('blob:') ||
    normalized.startsWith('data:') ||
    normalized.startsWith('vscode-webview-resource:') ||
    normalized.startsWith('vscode-resource:') ||
    normalized.startsWith('webview:') ||
    normalized.startsWith('vscode://') ||
    normalized.includes('vscode-resource.vscode-cdn.net')
  );
}

function toPlaybackTransition(
  connection: CanvasConnection,
  sourceUnitId: string,
  targetUnitId: string,
  context: PlaybackProjectionContext,
): CanvasPlaybackTransition {
  const override = getCanvasPlaybackEdgeOverride(context.metadata, connection);
  const type: CanvasPlaybackTransitionType =
    connection.type === 'choice'
      ? 'choice'
      : connection.type === 'sequence'
        ? 'sequence'
        : 'default';
  return {
    id: connection.id,
    sourceUnitId,
    targetUnitId,
    type,
    priority: override.order ?? connection.priority ?? 0,
    label: override.branchLabel ?? connection.choiceText ?? connection.label,
    condition: override.condition ?? connection.condition,
    sourceConnectionId: connection.id,
    sourceNodeId: connection.sourceId,
    targetNodeId: connection.targetId,
    ...(override.enabled !== undefined ? { enabled: override.enabled } : {}),
  };
}

function resolveTerminalUnitIds(
  units: readonly CanvasPlaybackUnit[],
  transitions: readonly CanvasPlaybackTransition[],
): ReadonlySet<string> {
  const sourceIds = new Set(transitions.map((transition) => transition.sourceUnitId));
  return new Set(units.filter((unit) => !sourceIds.has(unit.id)).map((unit) => unit.id));
}

function validateProjectionReferences(
  context: PlaybackProjectionContext,
  projection: AdapterProjection,
): readonly CanvasPlaybackDiagnostic[] {
  const diagnostics: CanvasPlaybackDiagnostic[] = [];
  const unitIds = new Set(projection.units.map((unit) => unit.id));
  for (const entryUnitId of projection.entryUnitIds) {
    if (!unitIds.has(entryUnitId)) {
      diagnostics.push(
        diagnostic(
          context,
          'playback-missing-entry',
          'warning',
          `Playback entry "${entryUnitId}" is not a playable unit.`,
        ),
      );
    }
  }
  for (const transition of projection.transitions) {
    if (!unitIds.has(transition.sourceUnitId) || !unitIds.has(transition.targetUnitId)) {
      diagnostics.push(
        diagnostic(
          context,
          'playback-dangling-connection',
          'warning',
          `Playback transition "${transition.id}" references missing units.`,
          transition.sourceNodeId,
          transition.sourceConnectionId,
        ),
      );
    }
  }
  for (const entryId of context.metadata.entryIds) {
    if (!context.nodeById.has(entryId)) {
      diagnostics.push(
        diagnostic(
          context,
          'playback-dangling-node',
          'warning',
          `Playback entry node "${entryId}" is missing.`,
          entryId,
        ),
      );
    }
  }
  return diagnostics;
}

function emptyProjection(
  context: PlaybackProjectionContext,
  message: string,
  code: CanvasPlaybackDiagnosticCode = 'playback-unsupported-graph',
): AdapterProjection {
  return {
    units: [],
    transitions: [],
    entryUnitIds: [],
    diagnostics: [diagnostic(context, code, 'warning', message)],
  };
}

function mediaDiagnostics(
  context: PlaybackProjectionContext,
  nodes: readonly MediaCanvasNode[],
): readonly CanvasPlaybackDiagnostic[] {
  return nodes
    .filter(
      (node) => !node.data.assetPath && !node.data.resourceRef && !node.data.documentResourceRef,
    )
    .map((node) =>
      diagnostic(
        context,
        'playback-missing-media-source',
        'warning',
        `Media node "${node.id}" has no durable playback source.`,
        node.id,
      ),
    );
}

function collectReachableNodes<T extends CanvasNode>(
  context: PlaybackProjectionContext,
  start: CanvasNode,
  predicate: (node: CanvasNode) => node is T,
): readonly T[] {
  const result: T[] = [];
  const queue = [start.id];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || visited.has(nodeId)) continue;
    visited.add(nodeId);
    const node = context.nodeById.get(nodeId);
    if (node && predicate(node)) result.push(node);
    for (const connection of sortCanvasPlaybackConnections(
      context.canvas.connections,
      context.metadata,
    )) {
      if (connection.sourceId === nodeId) queue.push(connection.targetId);
    }
  }
  return result;
}

function resolveStoryboardStartScene(
  context: PlaybackProjectionContext,
  selected: CanvasNode | undefined,
): SceneGroupCanvasNode | undefined {
  if (selected?.type === 'scene') return selected;
  if (selected?.type === 'shot') {
    const parentId = getNodeParentId(selected);
    const parent = parentId ? context.nodeById.get(parentId) : undefined;
    if (parent?.type === 'scene') return parent;
    return context.canvas.nodes.find(
      (node): node is SceneGroupCanvasNode =>
        node.type === 'scene' && getContainerChildIds(node).includes(selected.id),
    );
  }
  return context.canvas.nodes.find((node): node is SceneGroupCanvasNode => node.type === 'scene');
}

function resolveStoryboardExplicitEntry(
  context: PlaybackProjectionContext,
): CanvasNode | undefined {
  for (const entryId of context.metadata.entryIds) {
    const node = context.nodeById.get(entryId);
    if (node && (node.type === 'scene' || node.type === 'shot')) {
      return node;
    }
  }
  return undefined;
}

function comparePlaybackNodes(
  left: CanvasNode,
  right: CanvasNode,
  container: CanvasNode,
  childIds: readonly string[],
  metadata: Pick<NormalizedCanvasPlaybackMetadata, 'nodeOverrides'>,
): number {
  return firstNonZero([
    compareOptionalNumber(
      getCanvasPlaybackNodeOverride(metadata, left).order,
      getCanvasPlaybackNodeOverride(metadata, right).order,
    ),
    compareOptionalNumber(
      container.container?.childPlacements?.[left.id]?.order,
      container.container?.childPlacements?.[right.id]?.order,
    ),
    childIds.indexOf(left.id) - childIds.indexOf(right.id),
    compareOptionalNumber(readDomainOrder(left), readDomainOrder(right)),
    left.position.y - right.position.y,
    left.position.x - right.position.x,
    left.id.localeCompare(right.id),
  ]);
}

function comparePlaybackConnections(
  left: { readonly connection: CanvasConnection; readonly index: number },
  right: { readonly connection: CanvasConnection; readonly index: number },
  metadata: Pick<NormalizedCanvasPlaybackMetadata, 'edgeOverrides'>,
): number {
  return firstNonZero([
    compareOptionalNumber(
      getCanvasPlaybackEdgeOverride(metadata, left.connection).order,
      getCanvasPlaybackEdgeOverride(metadata, right.connection).order,
    ),
    compareOptionalNumber(left.connection.priority, right.connection.priority),
    left.index - right.index,
    left.connection.id.localeCompare(right.connection.id),
  ]);
}

function compareOptionalNumber(
  left: number | undefined,
  right: number | undefined,
): number | undefined {
  if (left === undefined && right === undefined) return undefined;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  return left - right;
}

function firstNonZero(values: readonly (number | undefined)[]): number {
  return values.find((value) => value !== undefined && value !== 0) ?? 0;
}

function readDomainOrder(node: CanvasNode): number | undefined {
  if (node.type === 'shot') return node.data.shotNumber;
  if (node.type === 'scene') return node.data.sceneNumber;
  return undefined;
}

function playbackUnitKindForNode(node: CanvasNode): CanvasPlaybackUnitKind {
  if (node.type === 'media') return 'media';
  if (node.type === 'shot') return 'shot';
  if (node.type === 'scene') return 'scene';
  if (isNarrativeRuntimeNode(node)) return 'narrative';
  if (isContainerNode(node)) return 'container';
  return 'node';
}

function renderModeForNode(node: CanvasNode): CanvasPlaybackRenderMode {
  if (node.type === 'media') return 'media-playback';
  if (node.type === 'shot' || node.type === 'scene') return 'story-preview';
  if (isNarrativeRuntimeNode(node)) return 'narrative-preview';
  return 'select-node';
}

function isNarrativeRuntimeNode(node: Pick<CanvasNode, 'type'>): boolean {
  return NARRATIVE_RUNTIME_NODE_TYPE_SET.has(node.type);
}

function isCanvasPlaybackNode(node: CanvasNode): node is CanvasNode {
  return Boolean(node.id);
}

function readNodeLabel(node: CanvasNode): string | undefined {
  const data = isRecord(node.data) ? (node.data as CanvasSerializableRecord) : {};
  const candidate =
    data['label'] ??
    data['title'] ??
    data['name'] ??
    (node.type === 'scene' ? node.data.sceneTitle : undefined) ??
    (node.type === 'shot' ? `Shot ${node.data.shotNumber}` : undefined);
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

function defaultBehaviorModeForAdapter(
  adapterId: ResolvedCanvasPlaybackAdapterId,
): ResolvedCanvasPlaybackBehaviorMode {
  return adapterId === 'narrative' ? 'interactive' : 'linear';
}

function defaultAdvancePolicyForAdapter(
  adapterId: ResolvedCanvasPlaybackAdapterId,
  behaviorMode: ResolvedCanvasPlaybackBehaviorMode,
): CanvasPlaybackAdvancePolicy {
  if (adapterId === 'media-sequence') return 'media-ended';
  if (adapterId === 'narrative' || behaviorMode === 'interactive' || behaviorMode === 'manual') {
    return 'user-input';
  }
  return 'timer';
}

function diagnostic(
  context: PlaybackProjectionContext,
  code: CanvasPlaybackDiagnosticCode,
  severity: CanvasPlaybackDiagnostic['severity'],
  message: string,
  nodeId?: string,
  connectionId?: string,
): CanvasPlaybackDiagnostic {
  return {
    code,
    severity,
    message,
    adapterId: context.adapterId,
    ...(nodeId ? { nodeId } : {}),
    ...(connectionId ? { connectionId } : {}),
  };
}

function playbackRouteDiagnostic(
  plan: Pick<CanvasPlaybackPlan, 'adapterId'>,
  code: CanvasPlaybackDiagnosticCode,
  severity: CanvasPlaybackDiagnostic['severity'],
  message: string,
  nodeId?: string,
): CanvasPlaybackDiagnostic {
  return {
    code,
    severity,
    message,
    adapterId: plan.adapterId,
    ...(nodeId ? { nodeId } : {}),
  };
}

function readAdapterId(value: unknown): CanvasPlaybackAdapterId | undefined {
  return CANVAS_PLAYBACK_ADAPTER_IDS.includes(value as CanvasPlaybackAdapterId)
    ? (value as CanvasPlaybackAdapterId)
    : undefined;
}

function readBehaviorMode(value: unknown): CanvasPlaybackBehaviorMode | undefined {
  return CANVAS_PLAYBACK_BEHAVIOR_MODES.includes(value as CanvasPlaybackBehaviorMode)
    ? (value as CanvasPlaybackBehaviorMode)
    : undefined;
}

function readNodeOverride(value: unknown): CanvasPlaybackNodeOverride {
  if (!isRecord(value)) return {};
  const role = readNodeRole(value['role']);
  const expand = readExpansion(value['expand']);
  return {
    ...(role ? { role } : {}),
    ...readOptionalNumberField(value, 'order'),
    ...readOptionalNumberField(value, 'durationMs'),
    ...(expand ? { expand } : {}),
  };
}

function readEdgeOverride(value: unknown): CanvasPlaybackEdgeOverride {
  if (!isRecord(value)) return {};
  return {
    ...(typeof value['enabled'] === 'boolean' ? { enabled: value['enabled'] } : {}),
    ...readOptionalNumberField(value, 'order'),
    ...(typeof value['branchLabel'] === 'string' ? { branchLabel: value['branchLabel'] } : {}),
    ...(typeof value['condition'] === 'string' ? { condition: value['condition'] } : {}),
  };
}

function readOptionalNumberField<T extends string>(
  value: Readonly<Record<string, unknown>>,
  field: T,
): Partial<Record<T, number>> {
  const candidate = value[field];
  return typeof candidate === 'number' && Number.isFinite(candidate)
    ? ({ [field]: candidate } as Partial<Record<T, number>>)
    : {};
}

function readOverrideRecord<T>(
  value: unknown,
  read: (entry: unknown) => T,
): Readonly<Record<string, T>> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, read(entry)]));
}

function readNodeRole(value: unknown): CanvasPlaybackNodeRole | undefined {
  return value === 'start' || value === 'end' || value === 'skip' || value === 'step'
    ? value
    : undefined;
}

function readExpansion(value: unknown): CanvasPlaybackExpansion | undefined {
  return value === 'self' || value === 'children' || value === 'recursive' ? value : undefined;
}

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function readExtensionPlaybackRecord(extension: unknown): CanvasSerializableRecord | undefined {
  if (!isRecord(extension)) return undefined;
  const playback = extension['playback'];
  return isRecord(playback) ? (playback as CanvasSerializableRecord) : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const CANVAS_PLAYBACK_ADAPTERS: readonly CanvasPlaybackAdapter[] = [
  {
    id: 'storyboard',
    canHandle: (context) =>
      context.canvas.nodes.some((node) => node.type === 'scene' || node.type === 'shot'),
    project: projectStoryboard,
  },
  {
    id: 'narrative',
    canHandle: (context) => context.canvas.nodes.some(isNarrativeRuntimeNode),
    project: projectNarrative,
  },
  {
    id: 'media-sequence',
    canHandle: (context) => context.canvas.nodes.some((node) => node.type === 'media'),
    project: projectMediaSequence,
  },
  {
    id: 'generic',
    canHandle: () => true,
    project: projectGeneric,
  },
];
