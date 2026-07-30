import type {
  ArtifactDiagnostic,
  ArtifactJsonRecord,
  ArtifactMediaItem,
  ArtifactResourceRef,
  CanvasPlaybackDiagnostic,
  CanvasPlaybackPlan,
  CanvasPlaybackRouteCandidate,
  CanvasPlaybackUnit,
  CompositeArtifact,
  CompositeArtifactBlock,
  GenericTable,
  GenericTableCell,
  ResourceRef,
} from '@neko/shared';
import { isResourceRef } from '@neko/shared';

export interface CanvasPlaybackRouteCardOptions {
  readonly routeId?: string;
  readonly includeFullOrder?: boolean;
  readonly maxUnits?: number;
}

export interface CanvasPlaybackRouteCardProjection {
  readonly artifact: CompositeArtifact;
  readonly selectedRoute?: CanvasPlaybackRouteCandidate;
  readonly unitCount: number;
  readonly projectedUnitCount: number;
}

const PROFILE_ID = 'canvas-playback-route';
const PROFILE_VERSION = 1;
const DEFAULT_MAX_UNITS = 12;

export function projectCanvasPlaybackRouteCard(
  plan: CanvasPlaybackPlan,
  options: CanvasPlaybackRouteCardOptions = {},
): CanvasPlaybackRouteCardProjection {
  const selectedRoute = selectRoute(plan, options.routeId);
  const unitById = new Map(plan.units.map((unit) => [unit.id, unit]));
  const orderedUnits = selectedRoute
    ? selectedRoute.unitIds.flatMap((unitId) => findUnit(unitById, unitId))
    : [];
  const maxUnits = options.includeFullOrder
    ? orderedUnits.length
    : (options.maxUnits ?? DEFAULT_MAX_UNITS);
  const displayedUnits = orderedUnits.slice(0, maxUnits);
  const diagnostics = [...plan.diagnostics, ...(selectedRoute?.diagnostics ?? [])];
  const sourceCanvasUri = readStringMetadata(plan.metadata, 'sourceCanvasUri');
  const sourceRevision = readStringOrNumberMetadata(plan.metadata, 'sourceRevision');
  const blocks: CompositeArtifactBlock[] = [
    createSummaryBlock(
      selectedRoute,
      unitById,
      orderedUnits.length,
      sourceCanvasUri,
      sourceRevision,
    ),
    createOrderedUnitsTableBlock(plan, selectedRoute, displayedUnits, orderedUnits.length),
    ...createMediaGalleryBlocks(displayedUnits),
    ...createDiagnosticBlocks(diagnostics),
  ];

  return {
    artifact: {
      schemaVersion: 1,
      kind: 'composite-artifact',
      artifactId: `canvas-playback-route:${selectedRoute?.id ?? 'missing'}`,
      profile: PROFILE_ID,
      profileVersion: PROFILE_VERSION,
      title: selectedRoute?.title ?? 'Canvas Playback Route',
      blocks,
      suggestedActions: [
        {
          actionId: 'canvas.revealPlaybackWorkspace',
          kind: 'view',
          label: 'Reveal in Canvas',
          targetPackageId: 'neko-canvas',
          capabilityId: 'canvas.revealPlaybackWorkspace',
          risk: 'low',
          requiresApproval: false,
          metadata: cleanRecord({
            sourceCanvasUri,
            routeId: selectedRoute?.id,
          }),
        },
        {
          actionId: 'canvas.createCutDraftFromRoute',
          kind: 'execute',
          label: 'Send to Cut',
          targetPackageId: 'neko-canvas',
          capabilityId: 'canvas.createCutDraftFromRoute',
          risk: 'medium',
          requiresApproval: true,
          metadata: cleanRecord({
            sourceCanvasUri,
            routeId: selectedRoute?.id,
            unitCount: orderedUnits.length,
          }),
        },
        {
          actionId: 'canvas.getPlaybackRoutes',
          kind: 'view',
          label: 'View full order',
          targetPackageId: 'neko-canvas',
          capabilityId: 'canvas.getPlaybackPlan',
          risk: 'low',
          requiresApproval: false,
          metadata: cleanRecord({
            sourceCanvasUri,
            routeId: selectedRoute?.id,
            includeFullOrder: true,
          }),
        },
      ],
      extensions: {
        'neko.canvas': cleanRecord({
          routeId: selectedRoute?.id,
          sourceCanvasUri,
          sourceRevision,
          unitCount: orderedUnits.length,
          projectedUnitCount: displayedUnits.length,
          diagnosticsCount: diagnostics.length,
          ownership: 'canvas-playback-order-only',
        }),
      },
    },
    selectedRoute,
    unitCount: orderedUnits.length,
    projectedUnitCount: displayedUnits.length,
  };
}

function selectRoute(
  plan: CanvasPlaybackPlan,
  routeId: string | undefined,
): CanvasPlaybackRouteCandidate | undefined {
  if (routeId) {
    return plan.routeCandidates.find((route) => route.id === routeId);
  }
  return plan.routeCandidates[0];
}

function findUnit(
  unitById: ReadonlyMap<string, CanvasPlaybackUnit>,
  unitId: string,
): readonly CanvasPlaybackUnit[] {
  const unit = unitById.get(unitId);
  return unit ? [unit] : [];
}

function createSummaryBlock(
  route: CanvasPlaybackRouteCandidate | undefined,
  unitById: ReadonlyMap<string, CanvasPlaybackUnit>,
  unitCount: number,
  sourceCanvasUri: string | undefined,
  sourceRevision: string | number | undefined,
): CompositeArtifactBlock {
  const duration = route?.totalDurationMs ?? sumUnitDurations(route, unitById);
  const lines = [
    `Route: ${route?.title ?? 'No route selected'}`,
    `Entry: ${route?.sourceKind ?? 'unknown'}${route?.sourceNodeId ? ` (${route.sourceNodeId})` : ''}`,
    `Units: ${unitCount}`,
    duration !== undefined ? `Duration: ${formatDuration(duration)}` : undefined,
    sourceCanvasUri ? `Canvas: ${sourceCanvasUri}` : undefined,
    sourceRevision !== undefined ? `Revision: ${String(sourceRevision)}` : undefined,
    'Playback stays in Canvas; Agent only displays order and dispatches actions.',
  ].filter((line): line is string => Boolean(line));

  return {
    blockId: 'summary',
    kind: 'text',
    title: 'Route Summary',
    format: 'plain',
    text: lines.join('\n'),
  };
}

function createOrderedUnitsTableBlock(
  plan: CanvasPlaybackPlan,
  route: CanvasPlaybackRouteCandidate | undefined,
  units: readonly CanvasPlaybackUnit[],
  totalUnitCount: number,
): CompositeArtifactBlock {
  return {
    blockId: 'ordered-units',
    kind: 'table',
    title:
      totalUnitCount > units.length
        ? `Ordered Units (${units.length}/${totalUnitCount})`
        : 'Ordered Units',
    table: createOrderedUnitsTable(plan, route, units),
  };
}

function createOrderedUnitsTable(
  plan: CanvasPlaybackPlan,
  route: CanvasPlaybackRouteCandidate | undefined,
  units: readonly CanvasPlaybackUnit[],
): GenericTable {
  return {
    schemaVersion: 1,
    kind: 'generic-table',
    tableId: `canvas-playback-route-units:${route?.id ?? 'missing'}`,
    profile: PROFILE_ID,
    profileVersion: PROFILE_VERSION,
    title: 'Canvas Playback Order',
    columns: [
      { columnId: 'index', label: '#', cellType: 'number' },
      { columnId: 'label', label: 'Unit', cellType: 'string' },
      { columnId: 'kind', label: 'Kind', cellType: 'enum' },
      { columnId: 'duration', label: 'Duration', cellType: 'duration' },
      { columnId: 'sourceNodeId', label: 'Source Node', cellType: 'string' },
      { columnId: 'diagnostics', label: 'Diagnostics', cellType: 'tags' },
    ],
    rows: units.map((unit, index) => ({
      rowId: unit.id,
      cells: cleanCells({
        index: { type: 'number', value: index + 1 },
        label: { type: 'string', value: unit.label ?? unit.id },
        kind: { type: 'enum', value: unit.kind },
        duration:
          unit.durationMs !== undefined
            ? { type: 'duration', valueMs: unit.durationMs }
            : undefined,
        sourceNodeId: { type: 'string', value: unit.sourceNodeId },
        diagnostics: {
          type: 'tags',
          value: diagnosticsForUnit(plan, unit).map((diagnostic) => diagnostic.code),
        },
      }),
      metadata: cleanRecord({
        unitId: unit.id,
        sourceNodeId: unit.sourceNodeId,
        renderMode: unit.renderMode,
      }),
    })),
  };
}

function createMediaGalleryBlocks(
  units: readonly CanvasPlaybackUnit[],
): readonly CompositeArtifactBlock[] {
  const items = units.flatMap(unitToMediaItem);
  if (items.length === 0) return [];
  return [
    {
      blockId: 'posters',
      kind: 'gallery',
      title: 'Available Posters',
      items,
    },
  ];
}

function unitToMediaItem(unit: CanvasPlaybackUnit): readonly ArtifactMediaItem[] {
  const ref = unit.resourceRef;
  if (!ref || !isResourceRef(ref)) return [];
  const mediaType = unit.metadata ? readStringMetadata(unit.metadata, 'mediaType') : undefined;
  return [
    {
      itemId: `${unit.id}:poster`,
      mediaType:
        mediaType === 'video' || mediaType === 'audio' || mediaType === 'image'
          ? mediaType
          : 'unknown',
      resourceRef: resourceRefToArtifactResourceRef(ref),
      label: unit.label ?? unit.id,
      durationMs: unit.durationMs,
      metadata: cleanRecord({
        unitId: unit.id,
        sourceNodeId: unit.sourceNodeId,
        routeCardRole: 'poster-or-source-reference',
      }),
    },
  ];
}

function resourceRefToArtifactResourceRef(resource: ResourceRef): ArtifactResourceRef {
  return {
    kind: 'resource',
    resource,
  };
}

function createDiagnosticBlocks(
  diagnostics: readonly CanvasPlaybackDiagnostic[],
): readonly CompositeArtifactBlock[] {
  if (diagnostics.length === 0) return [];
  return [
    {
      blockId: 'diagnostics',
      kind: 'diagnostic',
      title: 'Diagnostics',
      diagnostics: diagnostics.map(projectDiagnostic),
    },
  ];
}

function projectDiagnostic(diagnostic: CanvasPlaybackDiagnostic): ArtifactDiagnostic {
  return {
    severity: diagnostic.severity === 'error' ? 'error' : diagnostic.severity,
    code: 'invalid-required-field',
    path: diagnostic.nodeId ? ['units', diagnostic.nodeId] : [],
    message: diagnostic.message,
    details: cleanRecord({
      canvasCode: diagnostic.code,
      adapterId: diagnostic.adapterId,
      nodeId: diagnostic.nodeId,
      connectionId: diagnostic.connectionId,
    }),
  };
}

function diagnosticsForUnit(
  plan: CanvasPlaybackPlan,
  unit: CanvasPlaybackUnit,
): readonly CanvasPlaybackDiagnostic[] {
  return plan.diagnostics.filter((diagnostic) => diagnostic.nodeId === unit.sourceNodeId);
}

function sumUnitDurations(
  route: CanvasPlaybackRouteCandidate | undefined,
  unitById: ReadonlyMap<string, CanvasPlaybackUnit>,
): number | undefined {
  if (!route) return undefined;
  let total = 0;
  let hasDuration = false;
  for (const unitId of route.unitIds) {
    const durationMs = unitById.get(unitId)?.durationMs;
    if (durationMs !== undefined) {
      hasDuration = true;
      total += durationMs;
    }
  }
  return hasDuration ? total : undefined;
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function readStringMetadata(
  record: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readStringOrNumberMetadata(
  record: Readonly<Record<string, unknown>>,
  key: string,
): string | number | undefined {
  const value = record[key];
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

function cleanCells(
  cells: Readonly<Record<string, GenericTableCell | undefined>>,
): Readonly<Record<string, GenericTableCell>> {
  return Object.fromEntries(
    Object.entries(cells).filter(
      (entry): entry is [string, GenericTableCell] => entry[1] !== undefined,
    ),
  );
}

function cleanRecord(record: Readonly<Record<string, unknown>>): ArtifactJsonRecord {
  return Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, ArtifactJsonRecord[string]] =>
      isArtifactJsonValue(entry[1]),
    ),
  );
}

function isArtifactJsonValue(value: unknown): value is ArtifactJsonRecord[string] {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isArtifactJsonValue);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).every(isArtifactJsonValue);
  }
  return false;
}
