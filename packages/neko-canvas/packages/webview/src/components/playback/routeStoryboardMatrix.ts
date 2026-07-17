import {
  getNodeParentId,
  isContainerNode,
  resolveEffectiveCanvasPlaybackRoutes,
  type CanvasData,
  type CanvasNode,
  type CanvasPlaybackDiagnostic,
  type CanvasPlaybackPlan,
  type CanvasPlaybackRouteCandidate,
  type CanvasPlaybackRouteSourceKind,
  type CanvasPlaybackUnit,
  type CanvasPlaybackUnitKind,
} from '@neko/shared';

export interface RouteStoryboardMatrixFilters {
  readonly routeFamilyId?: string;
  readonly routeIds?: readonly string[];
  readonly containerIds?: readonly string[];
  readonly highlightedNodeKinds?: readonly CanvasPlaybackUnitKind[];
  readonly diagnosticSeverity?: CanvasPlaybackDiagnostic['severity'];
  readonly generationStatuses?: readonly string[];
}

export interface RouteStoryboardMatrixProjectInput {
  readonly plan: CanvasPlaybackPlan;
  readonly canvas?: Pick<CanvasData, 'nodes'>;
  readonly routes?: readonly CanvasPlaybackRouteCandidate[];
  readonly selectedRouteId?: string;
  readonly activeRouteFamilyId?: string;
  readonly foldedContainerIds?: ReadonlySet<string> | readonly string[];
  readonly filters?: RouteStoryboardMatrixFilters;
  readonly showAllCandidates?: boolean;
}

export interface RouteStoryboardMatrixViewModel {
  readonly planAdapterId: CanvasPlaybackPlan['adapterId'];
  readonly activeRouteFamilyId?: string;
  readonly selectedRouteId?: string;
  readonly families: readonly RouteStoryboardMatrixFamily[];
  readonly rows: readonly RouteStoryboardMatrixRow[];
  readonly containerGroups: readonly RouteStoryboardMatrixContainerGroup[];
  readonly columns: readonly RouteStoryboardMatrixColumn[];
  readonly diagnostics: readonly RouteStoryboardMatrixDiagnostic[];
}

export interface RouteStoryboardMatrixFamily {
  readonly id: string;
  readonly title: string;
  readonly sourceKind: CanvasPlaybackRouteSourceKind | 'primary';
  readonly sourceNodeId?: string;
  readonly routeIds: readonly string[];
  readonly visibleRouteIds: readonly string[];
  readonly foldedRouteIds: readonly string[];
}

export interface RouteStoryboardMatrixRow {
  readonly id: string;
  readonly routeId: string;
  readonly familyId: string;
  readonly title: string;
  readonly sourceKind: CanvasPlaybackRouteSourceKind;
  readonly sourceNodeId?: string;
  readonly unitIds: readonly string[];
  readonly totalDurationMs: number;
  readonly diagnostics: readonly CanvasPlaybackDiagnostic[];
  readonly cells: readonly RouteStoryboardMatrixCell[];
}

export interface RouteStoryboardMatrixContainerGroup {
  readonly id: string;
  readonly title: string;
  readonly containerNodeId?: string;
  readonly startColumnIndex: number;
  readonly slotCount: number;
  readonly folded: boolean;
  readonly unitCount: number;
}

export interface RouteStoryboardMatrixColumn {
  readonly id: string;
  readonly index: number;
  readonly containerId: string;
  readonly stableIdentity: string;
  readonly title: string;
}

export type RouteStoryboardMatrixCell =
  | RouteStoryboardMatrixPlayableCell
  | RouteStoryboardMatrixEmptyCell
  | RouteStoryboardMatrixSummaryCell;

export interface RouteStoryboardMatrixBaseCell {
  readonly id: string;
  readonly rowId: string;
  readonly routeId: string;
  readonly containerId: string;
  readonly columnStart: number;
  readonly columnSpan: number;
}

export interface RouteStoryboardMatrixPlayableCell extends RouteStoryboardMatrixBaseCell {
  readonly kind: 'playable';
  readonly unitId: string;
  readonly sourceNodeId: string;
  readonly stableIdentity: string;
  readonly label: string;
  readonly thumbnail?: RouteStoryboardMatrixThumbnail;
  readonly sourceRange?: RouteStoryboardMatrixSourceRange;
  readonly unitKind: CanvasPlaybackUnitKind;
  readonly durationMs: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly mediaState: RouteStoryboardMatrixMediaState;
  readonly highlight: boolean;
  readonly diagnostics: readonly CanvasPlaybackDiagnostic[];
}

export interface RouteStoryboardMatrixThumbnail {
  readonly src: string;
  readonly alt: string;
}

export interface RouteStoryboardMatrixSourceRange {
  readonly startMs: number;
  readonly endMs: number;
  readonly durationMs: number;
}

export interface RouteStoryboardMatrixEmptyCell extends RouteStoryboardMatrixBaseCell {
  readonly kind: 'empty';
  readonly stableIdentity: string;
  readonly semanticAnchor: RouteStoryboardMatrixSemanticAnchor;
}

export interface RouteStoryboardMatrixSummaryCell extends RouteStoryboardMatrixBaseCell {
  readonly kind: 'summary';
  readonly containerNodeId?: string;
  readonly label: string;
  readonly unitIds: readonly string[];
  readonly durationMs: number;
  readonly playableCount: number;
}

export interface RouteStoryboardMatrixSemanticAnchor {
  readonly containerNodeId?: string;
  readonly previousUnitId?: string;
  readonly previousSourceNodeId?: string;
  readonly nextUnitId?: string;
  readonly nextSourceNodeId?: string;
}

export type RouteStoryboardMatrixMediaState = 'playable' | 'missing' | 'metadata-only';

export interface RouteStoryboardMatrixDiagnostic {
  readonly code:
    | 'matrix-missing-route'
    | 'matrix-missing-unit'
    | 'matrix-alignment-conflict'
    | 'matrix-playback-diagnostic';
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
  readonly routeId?: string;
  readonly unitId?: string;
  readonly containerId?: string;
}

interface RouteFamilyDraft {
  readonly id: string;
  readonly title: string;
  readonly sourceKind: CanvasPlaybackRouteSourceKind | 'primary';
  readonly sourceNodeId?: string;
  readonly routes: readonly CanvasPlaybackRouteCandidate[];
}

interface MatrixRowDraft {
  readonly id: string;
  readonly route: CanvasPlaybackRouteCandidate;
  readonly familyId: string;
  readonly entries: readonly MatrixUnitEntry[];
}

interface MatrixUnitEntry {
  readonly unit: CanvasPlaybackUnit;
  readonly stableIdentity: string;
  readonly container: MatrixContainerIdentity;
  readonly startMs: number;
  readonly endMs: number;
  readonly durationMs: number;
}

interface MatrixContainerIdentity {
  readonly id: string;
  readonly title: string;
  readonly containerNodeId?: string;
}

interface MatrixContainerDraft extends MatrixContainerIdentity {
  readonly slotIdentities: readonly string[];
}

const ROOT_CONTAINER_ID = 'container:__root__';
const DEFAULT_UNIT_DURATION_MS = 1200;
const PRIMARY_FAMILY_ID = 'family:primary';
const NON_IMAGE_MEDIA_SOURCE_RE =
  /\.(?:mp4|m4v|mov|webm|mkv|avi|wmv|mp3|m4a|wav|flac|aac|ogg|opus)(?:[?#]|$)/i;
const SAFE_IMAGE_SOURCE_RE = /^(?:data:image\/|blob:|https?:)/i;
const PRIMARY_SOURCE_KINDS = new Set<CanvasPlaybackRouteSourceKind>([
  'entry',
  'auto-entry',
  'component',
]);

export function projectRouteStoryboardMatrix(
  input: RouteStoryboardMatrixProjectInput,
): RouteStoryboardMatrixViewModel {
  const routes = input.routes ?? resolveEffectiveCanvasPlaybackRoutes(input.plan).routes;
  const unitById = new Map(input.plan.units.map((unit) => [unit.id, unit]));
  const nodeById = new Map((input.canvas?.nodes ?? []).map((node) => [node.id, node]));
  const diagnostics = collectInitialDiagnostics(input.plan.diagnostics);
  const families = buildRouteFamilies(routes, unitById, nodeById);
  const activeRouteFamilyId = resolveActiveRouteFamilyId({
    families,
    requestedFamilyId: input.activeRouteFamilyId ?? input.filters?.routeFamilyId,
    selectedRouteId: input.selectedRouteId,
  });
  const selectedFamily = activeRouteFamilyId
    ? families.find((family) => family.id === activeRouteFamilyId)
    : undefined;
  const rowRoutes = input.showAllCandidates
    ? routes
    : foldDuplicateRoutes(
        (selectedFamily?.routes ?? families[0]?.routes ?? []).filter((route) =>
          routeMatchesFilters(route, input.filters),
        ),
      );
  const foldedContainerIds = normalizeStringSet(input.foldedContainerIds);
  const rowDrafts = rowRoutes.map((route) =>
    buildRowDraft({
      route,
      familyId: resolveFamilyIdForRoute(route, families),
      unitById,
      nodeById,
      diagnostics,
    }),
  );
  const containers = buildContainerDrafts(rowDrafts);
  const columns = buildColumns(containers);
  const containerColumnStart = new Map(
    containers.map((container) => [container.id, resolveContainerStartColumn(container, columns)]),
  );
  const containerGroups = containers
    .filter((container) => containerMatchesFilters(container, input.filters))
    .map((container) => {
      const startColumnIndex = containerColumnStart.get(container.id) ?? 0;
      return {
        id: container.id,
        title: container.title,
        ...(container.containerNodeId ? { containerNodeId: container.containerNodeId } : {}),
        startColumnIndex,
        slotCount: container.slotIdentities.length,
        folded: foldedContainerIds.has(container.id),
        unitCount: countContainerUnits(rowDrafts, container.id),
      } satisfies RouteStoryboardMatrixContainerGroup;
    });
  const visibleContainerIds = new Set(containerGroups.map((container) => container.id));
  const selectedRouteId = resolveSelectedRouteId(input.selectedRouteId, rowRoutes);
  const rows = rowDrafts.map((row) =>
    buildMatrixRow({
      row,
      containers,
      visibleContainerIds,
      foldedContainerIds,
      containerColumnStart,
      filters: input.filters,
      nodeById,
    }),
  );

  if (routes.length === 0) {
    diagnostics.push({
      code: 'matrix-missing-route',
      severity: 'warning',
      message: 'Canvas playback plan has no route candidates for the storyboard matrix.',
    });
  }

  return {
    planAdapterId: input.plan.adapterId,
    ...(activeRouteFamilyId ? { activeRouteFamilyId } : {}),
    ...(selectedRouteId ? { selectedRouteId } : {}),
    families: families.map((family) => toPublicFamily(family)),
    rows,
    containerGroups,
    columns: columns.filter((column) => visibleContainerIds.has(column.containerId)),
    diagnostics,
  };
}

function buildRouteFamilies(
  routes: readonly CanvasPlaybackRouteCandidate[],
  unitById: ReadonlyMap<string, CanvasPlaybackUnit>,
  nodeById: ReadonlyMap<string, CanvasNode>,
): readonly RouteFamilyDraft[] {
  const familyById = new Map<string, CanvasPlaybackRouteCandidate[]>();
  const familyMetaById = new Map<
    string,
    Pick<RouteFamilyDraft, 'id' | 'title' | 'sourceKind' | 'sourceNodeId'>
  >();

  for (const route of routes) {
    const family = resolveRouteFamily(route, unitById, nodeById);
    familyById.set(family.id, [...(familyById.get(family.id) ?? []), route]);
    if (!familyMetaById.has(family.id)) {
      familyMetaById.set(family.id, family);
    }
  }

  return Array.from(familyById.entries()).map(([id, familyRoutes]) => {
    const meta = familyMetaById.get(id);
    if (!meta) {
      throw new Error(`Route family metadata missing for ${id}.`);
    }
    return {
      ...meta,
      routes: familyRoutes,
    };
  });
}

function resolveRouteFamily(
  route: CanvasPlaybackRouteCandidate,
  unitById: ReadonlyMap<string, CanvasPlaybackUnit>,
  nodeById: ReadonlyMap<string, CanvasNode>,
): Pick<RouteFamilyDraft, 'id' | 'title' | 'sourceKind' | 'sourceNodeId'> {
  if (PRIMARY_SOURCE_KINDS.has(route.sourceKind)) {
    return {
      id: PRIMARY_FAMILY_ID,
      title: 'Primary routes',
      sourceKind: 'primary',
    };
  }
  const sourceNodeId = route.sourceNodeId ?? unitById.get(route.entryUnitId)?.sourceNodeId;
  const title = sourceNodeId
    ? (readNodeTitle(nodeById.get(sourceNodeId)) ?? route.title)
    : route.title;
  return {
    id: `family:${route.sourceKind}:${sourceNodeId ?? route.entryUnitId}`,
    title,
    sourceKind: route.sourceKind,
    ...(sourceNodeId ? { sourceNodeId } : {}),
  };
}

function resolveActiveRouteFamilyId({
  families,
  requestedFamilyId,
  selectedRouteId,
}: {
  readonly families: readonly RouteFamilyDraft[];
  readonly requestedFamilyId?: string;
  readonly selectedRouteId?: string;
}): string | undefined {
  if (requestedFamilyId && families.some((family) => family.id === requestedFamilyId)) {
    return requestedFamilyId;
  }
  if (selectedRouteId) {
    const selectedFamily = families.find((family) =>
      family.routes.some((route) => route.id === selectedRouteId),
    );
    if (selectedFamily) return selectedFamily.id;
  }
  return families[0]?.id;
}

function toPublicFamily(family: RouteFamilyDraft): RouteStoryboardMatrixFamily {
  const visibleRoutes = foldDuplicateRoutes(family.routes);
  const visibleRouteIds = new Set(visibleRoutes.map((route) => route.id));
  return {
    id: family.id,
    title: family.title,
    sourceKind: family.sourceKind,
    ...(family.sourceNodeId ? { sourceNodeId: family.sourceNodeId } : {}),
    routeIds: family.routes.map((route) => route.id),
    visibleRouteIds: visibleRoutes.map((route) => route.id),
    foldedRouteIds: family.routes
      .filter((route) => !visibleRouteIds.has(route.id))
      .map((route) => route.id),
  };
}

function foldDuplicateRoutes(
  routes: readonly CanvasPlaybackRouteCandidate[],
): readonly CanvasPlaybackRouteCandidate[] {
  const seen = new Set<string>();
  const output: CanvasPlaybackRouteCandidate[] = [];
  for (const route of routes) {
    const signature = route.unitIds.join('>');
    if (seen.has(signature)) continue;
    seen.add(signature);
    output.push(route);
  }
  return output;
}

function buildRowDraft({
  route,
  familyId,
  unitById,
  nodeById,
  diagnostics,
}: {
  readonly route: CanvasPlaybackRouteCandidate;
  readonly familyId: string;
  readonly unitById: ReadonlyMap<string, CanvasPlaybackUnit>;
  readonly nodeById: ReadonlyMap<string, CanvasNode>;
  readonly diagnostics: RouteStoryboardMatrixDiagnostic[];
}): MatrixRowDraft {
  let cursor = 0;
  const occurrenceByIdentity = new Map<string, number>();
  const entries: MatrixUnitEntry[] = [];
  for (const unitId of route.unitIds) {
    const unit = unitById.get(unitId);
    if (!unit) {
      diagnostics.push({
        code: 'matrix-missing-unit',
        severity: 'error',
        message: `Route "${route.id}" references missing playback unit "${unitId}".`,
        routeId: route.id,
        unitId,
      });
      continue;
    }
    const baseIdentity = resolveStableUnitIdentity(unit);
    const occurrence = occurrenceByIdentity.get(baseIdentity) ?? 0;
    occurrenceByIdentity.set(baseIdentity, occurrence + 1);
    const durationMs = resolveMatrixUnitDurationMs(unit);
    entries.push({
      unit,
      stableIdentity: occurrence === 0 ? baseIdentity : `${baseIdentity}#${occurrence + 1}`,
      container: resolveUnitContainer(unit, nodeById),
      startMs: cursor,
      endMs: cursor + durationMs,
      durationMs,
    });
    cursor += durationMs;
  }
  return {
    id: `row:${route.id}`,
    route,
    familyId,
    entries,
  };
}

function buildContainerDrafts(rows: readonly MatrixRowDraft[]): readonly MatrixContainerDraft[] {
  const containerOrder: MatrixContainerIdentity[] = [];
  const seenContainers = new Set<string>();

  for (const row of rows) {
    for (const entry of row.entries) {
      if (seenContainers.has(entry.container.id)) continue;
      seenContainers.add(entry.container.id);
      containerOrder.push(entry.container);
    }
  }

  return containerOrder.map((container) => ({
    ...container,
    slotIdentities: alignContainerSlotIdentities(
      rows.map((row) =>
        row.entries
          .filter((entry) => entry.container.id === container.id)
          .map((entry) => entry.stableIdentity),
      ),
      container.id,
    ),
  }));
}

function alignContainerSlotIdentities(
  rowIdentities: readonly (readonly string[])[],
  containerId: string,
): readonly string[] {
  const slots: string[] = [];
  for (const identities of rowIdentities) {
    let cursor = 0;
    for (let index = 0; index < identities.length; index += 1) {
      const identity = identities[index];
      if (!identity) continue;
      const existingIndex = slots.indexOf(identity);
      if (existingIndex >= cursor) {
        cursor = existingIndex + 1;
        continue;
      }
      if (existingIndex >= 0) {
        cursor = existingIndex + 1;
        continue;
      }
      const nextExistingIndex = identities
        .slice(index + 1)
        .map((candidate) => slots.indexOf(candidate))
        .find((slotIndex) => slotIndex >= cursor);
      if (nextExistingIndex === undefined) {
        slots.push(identity);
        cursor = slots.length;
        continue;
      }
      slots.splice(nextExistingIndex, 0, identity);
      cursor = nextExistingIndex + 1;
    }
  }
  if (slots.length === 0) {
    return [`${containerId}:empty`];
  }
  return slots;
}

function buildColumns(
  containers: readonly MatrixContainerDraft[],
): readonly RouteStoryboardMatrixColumn[] {
  const columns: RouteStoryboardMatrixColumn[] = [];
  for (const container of containers) {
    for (const identity of container.slotIdentities) {
      columns.push({
        id: `column:${container.id}:${identity}`,
        index: columns.length,
        containerId: container.id,
        stableIdentity: identity,
        title: identity,
      });
    }
  }
  return columns;
}

function buildMatrixRow({
  row,
  containers,
  visibleContainerIds,
  foldedContainerIds,
  containerColumnStart,
  filters,
  nodeById,
}: {
  readonly row: MatrixRowDraft;
  readonly containers: readonly MatrixContainerDraft[];
  readonly visibleContainerIds: ReadonlySet<string>;
  readonly foldedContainerIds: ReadonlySet<string>;
  readonly containerColumnStart: ReadonlyMap<string, number>;
  readonly filters?: RouteStoryboardMatrixFilters;
  readonly nodeById: ReadonlyMap<string, CanvasNode>;
}): RouteStoryboardMatrixRow {
  const cells: RouteStoryboardMatrixCell[] = [];
  for (const container of containers) {
    if (!visibleContainerIds.has(container.id)) continue;
    const entries = row.entries.filter((entry) => entry.container.id === container.id);
    const columnStart = containerColumnStart.get(container.id) ?? 0;
    if (foldedContainerIds.has(container.id)) {
      cells.push(
        buildSummaryCell({
          row,
          container,
          entries,
          columnStart,
        }),
      );
      continue;
    }
    for (let slotIndex = 0; slotIndex < container.slotIdentities.length; slotIndex += 1) {
      const stableIdentity = container.slotIdentities[slotIndex];
      if (!stableIdentity) continue;
      const entry = entries.find((candidate) => candidate.stableIdentity === stableIdentity);
      cells.push(
        entry
          ? buildPlayableCell({
              row,
              entry,
              columnStart: columnStart + slotIndex,
              filters,
              nodeById,
            })
          : buildEmptyCell({
              row,
              container,
              entries,
              slotIndex,
              stableIdentity,
              columnStart: columnStart + slotIndex,
            }),
      );
    }
  }

  return {
    id: row.id,
    routeId: row.route.id,
    familyId: row.familyId,
    title: row.route.title,
    sourceKind: row.route.sourceKind,
    ...(row.route.sourceNodeId ? { sourceNodeId: row.route.sourceNodeId } : {}),
    unitIds: row.route.unitIds,
    totalDurationMs:
      row.route.totalDurationMs ??
      row.entries.reduce((total, entry) => total + entry.durationMs, 0),
    diagnostics: row.route.diagnostics ?? [],
    cells,
  };
}

function buildPlayableCell({
  row,
  entry,
  columnStart,
  filters,
  nodeById,
}: {
  readonly row: MatrixRowDraft;
  readonly entry: MatrixUnitEntry;
  readonly columnStart: number;
  readonly filters?: RouteStoryboardMatrixFilters;
  readonly nodeById: ReadonlyMap<string, CanvasNode>;
}): RouteStoryboardMatrixPlayableCell {
  const label = entry.unit.label ?? entry.unit.id;
  const thumbnail = resolveMatrixThumbnail({ unit: entry.unit, label, nodeById });
  const sourceRange = resolveMatrixSourceRange(entry.unit);
  return {
    kind: 'playable',
    id: `cell:${row.route.id}:${entry.container.id}:${entry.stableIdentity}`,
    rowId: row.id,
    routeId: row.route.id,
    containerId: entry.container.id,
    columnStart,
    columnSpan: 1,
    unitId: entry.unit.id,
    sourceNodeId: entry.unit.sourceNodeId,
    stableIdentity: entry.stableIdentity,
    label,
    ...(thumbnail ? { thumbnail } : {}),
    ...(sourceRange ? { sourceRange } : {}),
    unitKind: entry.unit.kind,
    durationMs: entry.durationMs,
    startMs: entry.startMs,
    endMs: entry.endMs,
    mediaState: resolveMatrixMediaState(entry.unit),
    highlight: unitMatchesHighlightFilters(entry.unit, filters),
    diagnostics: [],
  };
}

function buildEmptyCell({
  row,
  container,
  entries,
  slotIndex,
  stableIdentity,
  columnStart,
}: {
  readonly row: MatrixRowDraft;
  readonly container: MatrixContainerDraft;
  readonly entries: readonly MatrixUnitEntry[];
  readonly slotIndex: number;
  readonly stableIdentity: string;
  readonly columnStart: number;
}): RouteStoryboardMatrixEmptyCell {
  return {
    kind: 'empty',
    id: `cell:${row.route.id}:${container.id}:${stableIdentity}:empty`,
    rowId: row.id,
    routeId: row.route.id,
    containerId: container.id,
    columnStart,
    columnSpan: 1,
    stableIdentity,
    semanticAnchor: resolveEmptyCellAnchor(container, entries, slotIndex),
  };
}

function buildSummaryCell({
  row,
  container,
  entries,
  columnStart,
}: {
  readonly row: MatrixRowDraft;
  readonly container: MatrixContainerDraft;
  readonly entries: readonly MatrixUnitEntry[];
  readonly columnStart: number;
}): RouteStoryboardMatrixSummaryCell {
  return {
    kind: 'summary',
    id: `cell:${row.route.id}:${container.id}:summary`,
    rowId: row.id,
    routeId: row.route.id,
    containerId: container.id,
    ...(container.containerNodeId ? { containerNodeId: container.containerNodeId } : {}),
    columnStart,
    columnSpan: container.slotIdentities.length,
    label: container.title,
    unitIds: entries.map((entry) => entry.unit.id),
    durationMs: entries.reduce((total, entry) => total + entry.durationMs, 0),
    playableCount: entries.length,
  };
}

function resolveEmptyCellAnchor(
  container: MatrixContainerDraft,
  entries: readonly MatrixUnitEntry[],
  slotIndex: number,
): RouteStoryboardMatrixSemanticAnchor {
  const previous = entries
    .filter((entry) => {
      const entrySlotIndex = container.slotIdentities.indexOf(entry.stableIdentity);
      return entrySlotIndex >= 0 && entrySlotIndex < slotIndex;
    })
    .at(-1);
  const next = entries.find((entry) => {
    const entrySlotIndex = container.slotIdentities.indexOf(entry.stableIdentity);
    return entrySlotIndex > slotIndex;
  });
  return {
    ...(container.containerNodeId ? { containerNodeId: container.containerNodeId } : {}),
    ...(previous
      ? { previousUnitId: previous.unit.id, previousSourceNodeId: previous.unit.sourceNodeId }
      : {}),
    ...(next ? { nextUnitId: next.unit.id, nextSourceNodeId: next.unit.sourceNodeId } : {}),
  };
}

function resolveContainerStartColumn(
  container: MatrixContainerDraft,
  columns: readonly RouteStoryboardMatrixColumn[],
): number {
  return columns.find((column) => column.containerId === container.id)?.index ?? 0;
}

function countContainerUnits(rows: readonly MatrixRowDraft[], containerId: string): number {
  const unitIds = new Set<string>();
  for (const row of rows) {
    for (const entry of row.entries) {
      if (entry.container.id === containerId) {
        unitIds.add(entry.unit.id);
      }
    }
  }
  return unitIds.size;
}

function resolveSelectedRouteId(
  selectedRouteId: string | undefined,
  routes: readonly CanvasPlaybackRouteCandidate[],
): string | undefined {
  if (selectedRouteId && routes.some((route) => route.id === selectedRouteId)) {
    return selectedRouteId;
  }
  return routes[0]?.id;
}

function resolveFamilyIdForRoute(
  route: CanvasPlaybackRouteCandidate,
  families: readonly RouteFamilyDraft[],
): string {
  return (
    families.find((family) => family.routes.some((candidate) => candidate.id === route.id))?.id ??
    PRIMARY_FAMILY_ID
  );
}

function routeMatchesFilters(
  route: CanvasPlaybackRouteCandidate,
  filters: RouteStoryboardMatrixFilters | undefined,
): boolean {
  if (!filters?.routeIds || filters.routeIds.length === 0) return true;
  return filters.routeIds.includes(route.id);
}

function containerMatchesFilters(
  container: MatrixContainerDraft,
  filters: RouteStoryboardMatrixFilters | undefined,
): boolean {
  if (!filters?.containerIds || filters.containerIds.length === 0) return true;
  return (
    filters.containerIds.includes(container.id) ||
    Boolean(container.containerNodeId && filters.containerIds.includes(container.containerNodeId))
  );
}

function unitMatchesHighlightFilters(
  unit: CanvasPlaybackUnit,
  filters: RouteStoryboardMatrixFilters | undefined,
): boolean {
  if (!filters) return false;
  const nodeKindMatch =
    filters.highlightedNodeKinds !== undefined && filters.highlightedNodeKinds.includes(unit.kind);
  const generationStatus = readString(unit.metadata?.['generationStatus']);
  const generationStatusMatch =
    generationStatus !== undefined &&
    filters.generationStatuses !== undefined &&
    filters.generationStatuses.includes(generationStatus);
  return nodeKindMatch || generationStatusMatch;
}

function resolveUnitContainer(
  unit: CanvasPlaybackUnit,
  nodeById: ReadonlyMap<string, CanvasNode>,
): MatrixContainerIdentity {
  const sourceNode = nodeById.get(unit.sourceNodeId);
  if (!sourceNode) {
    return {
      id: ROOT_CONTAINER_ID,
      title: 'Canvas',
    };
  }
  const parentId = getNodeParentId(sourceNode);
  const parent = parentId ? nodeById.get(parentId) : undefined;
  if (parent) {
    return {
      id: `container:${parent.id}`,
      title: readNodeTitle(parent) ?? parent.id,
      containerNodeId: parent.id,
    };
  }
  if (isContainerNode(sourceNode)) {
    return {
      id: `container:${sourceNode.id}`,
      title: readNodeTitle(sourceNode) ?? sourceNode.id,
      containerNodeId: sourceNode.id,
    };
  }
  return {
    id: ROOT_CONTAINER_ID,
    title: 'Canvas',
  };
}

function resolveStableUnitIdentity(unit: CanvasPlaybackUnit): string {
  return (
    readString(unit.metadata?.['sourceShotId']) ??
    readString(unit.metadata?.['sourceSceneId']) ??
    readString(unit.metadata?.['canvasNodeId']) ??
    unit.sourceNodeId ??
    unit.id
  );
}

function resolveMatrixUnitDurationMs(unit: CanvasPlaybackUnit): number {
  return typeof unit.durationMs === 'number' &&
    Number.isFinite(unit.durationMs) &&
    unit.durationMs > 0
    ? unit.durationMs
    : DEFAULT_UNIT_DURATION_MS;
}

function resolveMatrixMediaState(unit: CanvasPlaybackUnit): RouteStoryboardMatrixMediaState {
  if (unit.assetPath || unit.resourceRef || readString(unit.metadata?.['previewUrl'])) {
    return 'playable';
  }
  if (unit.kind === 'media') return 'missing';
  return 'metadata-only';
}

function resolveMatrixSourceRange(
  unit: CanvasPlaybackUnit,
): RouteStoryboardMatrixSourceRange | undefined {
  const metadata = unit.metadata;
  if (!metadata) return undefined;
  return (
    readSourceRangeObject(metadata['sourceRange']) ??
    readSourceRangeObject(metadata['playbackSourceRange']) ??
    readSourceRangeFields(metadata, 'sourceStartMs', 'sourceEndMs') ??
    readSourceRangeFields(metadata, 'sourceInMs', 'sourceOutMs') ??
    readSourceRangeFields(metadata, 'mediaStartMs', 'mediaEndMs') ??
    readSourceRangeFields(metadata, 'rangeStartMs', 'rangeEndMs') ??
    readSourceRangeFields(metadata, 'inMs', 'outMs') ??
    readSourceRangeSecondFields(metadata, 'sourceStartSeconds', 'sourceEndSeconds') ??
    readSourceRangeSecondFields(metadata, 'mediaStartSeconds', 'mediaEndSeconds')
  );
}

function readSourceRangeObject(value: unknown): RouteStoryboardMatrixSourceRange | undefined {
  if (!isRecord(value)) return undefined;
  return (
    normalizeSourceRange(readFiniteNumber(value['startMs']), readFiniteNumber(value['endMs'])) ??
    normalizeSourceRange(readFiniteNumber(value['inMs']), readFiniteNumber(value['outMs'])) ??
    normalizeSourceRange(
      readSecondsAsMs(value['startSeconds']),
      readSecondsAsMs(value['endSeconds']),
    ) ??
    normalizeSourceRange(readSecondsAsMs(value['inSeconds']), readSecondsAsMs(value['outSeconds']))
  );
}

function readSourceRangeFields(
  metadata: Readonly<Record<string, unknown>>,
  startKey: string,
  endKey: string,
): RouteStoryboardMatrixSourceRange | undefined {
  return normalizeSourceRange(
    readFiniteNumber(metadata[startKey]),
    readFiniteNumber(metadata[endKey]),
  );
}

function readSourceRangeSecondFields(
  metadata: Readonly<Record<string, unknown>>,
  startKey: string,
  endKey: string,
): RouteStoryboardMatrixSourceRange | undefined {
  return normalizeSourceRange(
    readSecondsAsMs(metadata[startKey]),
    readSecondsAsMs(metadata[endKey]),
  );
}

function normalizeSourceRange(
  startMs: number | undefined,
  endMs: number | undefined,
): RouteStoryboardMatrixSourceRange | undefined {
  if (startMs === undefined || endMs === undefined || startMs < 0 || endMs <= startMs) {
    return undefined;
  }
  return {
    startMs,
    endMs,
    durationMs: endMs - startMs,
  };
}

function resolveMatrixThumbnail({
  unit,
  label,
  nodeById,
}: {
  readonly unit: CanvasPlaybackUnit;
  readonly label: string;
  readonly nodeById: ReadonlyMap<string, CanvasNode>;
}): RouteStoryboardMatrixThumbnail | undefined {
  const sourceNode = nodeById.get(unit.sourceNodeId);
  const src =
    readFirstSafeImageUrl(unit.metadata, [
      'previewUrl',
      'previewThumbnailUrl',
      'thumbnailUrl',
      'posterUrl',
      'generatedImage',
    ]) ??
    readGeneratedAssetImageUrl(unit.metadata?.['generatedAsset']) ??
    readGeneratedAssetImageUrl(unit.metadata?.['generatedVideoAsset']) ??
    readNodeThumbnailUrl(sourceNode);

  return src ? { src, alt: label } : undefined;
}

function readNodeThumbnailUrl(node: CanvasNode | undefined): string | undefined {
  if (!node) return undefined;
  const data: Readonly<Record<string, unknown>> = isRecord(node.data as unknown)
    ? (node.data as Readonly<Record<string, unknown>>)
    : {};

  return (
    readFirstSafeImageUrl(data, [
      'previewUrl',
      'previewThumbnailUrl',
      'thumbnailUrl',
      'posterUrl',
      'generatedImage',
      'runtimeThumbnailPath',
      'runtimeAssetPath',
      'runtimeReferenceImagePath',
    ]) ??
    readGeneratedAssetImageUrl(data['generatedAsset']) ??
    readThumbnailDataUrl(data['thumbnailData'])
  );
}

function readFirstSafeImageUrl(
  record: Readonly<Record<string, unknown>> | undefined,
  keys: readonly string[],
): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const src = readSafeImageUrl(record[key]);
    if (src) return src;
  }
  return undefined;
}

function readGeneratedAssetImageUrl(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  return readFirstSafeImageUrl(value, ['url', 'path', 'thumbnailUrl', 'previewUrl']);
}

function readThumbnailDataUrl(value: unknown): string | undefined {
  const src = readString(value);
  if (!src) return undefined;
  if (src.startsWith('data:')) {
    return src.startsWith('data:image/') ? src : undefined;
  }
  return /^[a-z0-9+/]+={0,2}$/i.test(src) ? `data:image/png;base64,${src}` : undefined;
}

function readSafeImageUrl(value: unknown): string | undefined {
  const src = readString(value);
  if (!src) return undefined;
  return isAuthorizedImageSource(src) ? src : undefined;
}

function isAuthorizedImageSource(src: string): boolean {
  return (
    (SAFE_IMAGE_SOURCE_RE.test(src) && !NON_IMAGE_MEDIA_SOURCE_RE.test(src)) ||
    ((src.startsWith('vscode-resource:') ||
      src.startsWith('vscode-webview-resource:') ||
      src.includes('vscode-resource.vscode-cdn.net')) &&
      !NON_IMAGE_MEDIA_SOURCE_RE.test(src))
  );
}

function collectInitialDiagnostics(
  diagnostics: readonly CanvasPlaybackDiagnostic[],
): RouteStoryboardMatrixDiagnostic[] {
  return diagnostics.map((diagnostic) => ({
    code: 'matrix-playback-diagnostic',
    severity: diagnostic.severity,
    message: diagnostic.message,
    ...(diagnostic.nodeId ? { unitId: diagnostic.nodeId } : {}),
  }));
}

function normalizeStringSet(
  value: ReadonlySet<string> | readonly string[] | undefined,
): Set<string> {
  if (!value) return new Set();
  return value instanceof Set ? new Set(value) : new Set(value);
}

function readNodeTitle(node: CanvasNode | undefined): string | undefined {
  if (!node) return undefined;
  const data: Readonly<Record<string, unknown>> = isRecord(node.data as unknown)
    ? (node.data as Readonly<Record<string, unknown>>)
    : {};
  return (
    readString(data['sceneTitle']) ??
    readString(data['title']) ??
    readString(data['label']) ??
    readString(data['name']) ??
    readString(data['visualDescription']) ??
    node.id
  );
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readSecondsAsMs(value: unknown): number | undefined {
  const seconds = readFiniteNumber(value);
  return seconds === undefined ? undefined : seconds * 1000;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
