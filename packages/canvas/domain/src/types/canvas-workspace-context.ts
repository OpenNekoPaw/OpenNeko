import {
  CANVAS_CREATIVE_SCOPE_KINDS,
  projectCanvasBoardSummaryForIndex,
  type CanvasBoardIndexEntry,
  type CanvasBoardSummary,
} from './canvas-creative-scope';

export const CANVAS_WORKSPACE_BOARD_TARGET_ID = 'workspace-board' as const;

/**
 * Composer-facing Canvas turn target.
 *
 * The logical Workspace Board is the canonical default option; an exact Canvas is
 * an explicit user selection. This contract never reads or creates files.
 */
export type CanvasWorkspaceTurnTarget =
  | {
      readonly kind: 'workspace-board';
      readonly workspaceId: string;
    }
  | {
      readonly kind: 'exact-canvas';
      readonly workspaceId: string;
      readonly canvasId: string;
    };

export interface CanvasWorkspaceContextCatalogOption {
  readonly target: CanvasWorkspaceTurnTarget;
  readonly label: string;
  /**
   * Light index entry for an exact Canvas. The logical Board option is allowed to
   * omit this; it must never trigger file access or `workspace.nkc` creation.
   */
  readonly index?: CanvasBoardIndexEntry;
  readonly summary?: CanvasWorkspaceTurnSummary;
  readonly disabled?: boolean;
  readonly diagnostic?: string;
}

export interface CanvasWorkspaceContextCatalog {
  readonly workspaceId: string;
  readonly defaultTarget: Extract<CanvasWorkspaceTurnTarget, { readonly kind: 'workspace-board' }>;
  readonly options: readonly CanvasWorkspaceContextCatalogOption[];
  readonly diagnostics: readonly string[];
}

export interface CanvasWorkspaceTurnSummary {
  readonly canvasId?: string;
  readonly name: string;
  readonly nodeTypeSummary?: Readonly<Record<string, number>>;
  readonly updatedAt?: string;
}

export interface CanvasWorkspaceTurnContext {
  readonly target: CanvasWorkspaceTurnTarget;
  /** Light summary for an exact Canvas only; full Canvas content must be read on demand. */
  readonly summary?: CanvasWorkspaceTurnSummary;
}

export function createCanvasWorkspaceBoardTarget(
  workspaceId: string,
): Extract<CanvasWorkspaceTurnTarget, { readonly kind: 'workspace-board' }> {
  return Object.freeze({
    kind: 'workspace-board' as const,
    workspaceId: requireIdentity(workspaceId, 'Workspace'),
  });
}

export function createExactCanvasTarget(
  workspaceId: string,
  canvasId: string,
): Extract<CanvasWorkspaceTurnTarget, { readonly kind: 'exact-canvas' }> {
  return Object.freeze({
    kind: 'exact-canvas' as const,
    workspaceId: requireIdentity(workspaceId, 'Workspace'),
    canvasId: requireIdentity(canvasId, 'Canvas'),
  });
}

export function isCanvasWorkspaceTurnTarget(value: unknown): value is CanvasWorkspaceTurnTarget {
  if (!isRecord(value)) return false;
  if (value['kind'] !== 'workspace-board' && value['kind'] !== 'exact-canvas') return false;
  if (!isNonEmptyString(value['workspaceId'])) return false;
  if (value['kind'] === 'exact-canvas') return isNonEmptyString(value['canvasId']);
  return Object.keys(value).every((key) => key === 'kind' || key === 'workspaceId');
}

export function parseCanvasWorkspaceTurnTarget(value: unknown): CanvasWorkspaceTurnTarget {
  if (!isRecord(value)) {
    throw new Error('Canvas workspace turn target must be an object.');
  }
  if (value['kind'] === 'workspace-board') {
    requireExactKeys(value, ['kind', 'workspaceId'], 'Canvas workspace Board target');
    return createCanvasWorkspaceBoardTarget(requireIdentity(value['workspaceId'], 'Workspace'));
  }
  if (value['kind'] === 'exact-canvas') {
    requireExactKeys(value, ['kind', 'workspaceId', 'canvasId'], 'Canvas exact target');
    return createExactCanvasTarget(
      requireIdentity(value['workspaceId'], 'Workspace'),
      requireIdentity(value['canvasId'], 'Canvas'),
    );
  }
  throw new Error(`Unknown Canvas workspace turn target '${String(value['kind'])}'.`);
}

export function createCanvasWorkspaceContextCatalog(input: {
  readonly workspaceId: string;
  readonly options: readonly CanvasWorkspaceContextCatalogOption[];
  readonly diagnostics?: readonly string[];
}): CanvasWorkspaceContextCatalog {
  const workspaceId = requireIdentity(input.workspaceId, 'Workspace');
  const defaultTarget = createCanvasWorkspaceBoardTarget(workspaceId);
  const catalog: CanvasWorkspaceContextCatalog = {
    workspaceId,
    defaultTarget,
    options: input.options.map((option) => freezeCatalogOption(parseCatalogOption(option))),
    diagnostics: input.diagnostics ?? [],
  };
  const defaultOption = catalog.options.find(
    (option) =>
      option.target.kind === 'workspace-board' && option.target.workspaceId === workspaceId,
  );
  if (!defaultOption) {
    throw new Error('Canvas workspace context catalog requires the logical Board option.');
  }
  if (catalog.options.some((option) => option.target.workspaceId !== workspaceId)) {
    throw new Error('Canvas workspace context catalog options must match its Workspace.');
  }
  if (
    catalog.options.some(
      (option, index) =>
        catalog.options.findIndex((candidate) => sameTarget(candidate.target, option.target)) !==
        index,
    )
  ) {
    throw new Error('Canvas workspace context catalog contains duplicate targets.');
  }
  return Object.freeze(catalog);
}

export function createCanvasWorkspaceContextCatalogOption(input: {
  readonly target: CanvasWorkspaceTurnTarget;
  readonly label: string;
  readonly index?: CanvasBoardIndexEntry;
  readonly disabled?: boolean;
  readonly diagnostic?: string;
}): CanvasWorkspaceContextCatalogOption {
  return parseCatalogOption(input);
}

export function parseCanvasWorkspaceContextCatalog(value: unknown): CanvasWorkspaceContextCatalog {
  if (!isRecord(value)) {
    throw new Error('Canvas workspace context catalog must be an object.');
  }
  requireExactKeys(
    value,
    ['workspaceId', 'defaultTarget', 'options', 'diagnostics'],
    'Canvas workspace context catalog',
  );
  const workspaceId = requireIdentity(value['workspaceId'], 'Workspace');
  const defaultTarget = parseCanvasWorkspaceTurnTarget(value['defaultTarget']);
  if (defaultTarget.kind !== 'workspace-board' || defaultTarget.workspaceId !== workspaceId) {
    throw new Error('Canvas workspace context catalog default target must be its logical Board.');
  }
  if (!Array.isArray(value['options'])) {
    throw new Error('Canvas workspace context catalog options must be an array.');
  }
  if (!Array.isArray(value['diagnostics'])) {
    throw new Error('Canvas workspace context catalog diagnostics must be an array.');
  }
  return createCanvasWorkspaceContextCatalog({
    workspaceId,
    options: value['options'].map(parseCanvasWorkspaceContextCatalogOption),
    diagnostics: value['diagnostics'].map((entry) => requireIdentity(entry, 'Catalog diagnostic')),
  });
}

export function parseCanvasWorkspaceContextCatalogOption(
  value: unknown,
): CanvasWorkspaceContextCatalogOption {
  if (!isRecord(value)) {
    throw new Error('Canvas workspace context catalog option must be an object.');
  }
  requireAllowedKeys(
    value,
    ['target', 'label', 'index', 'summary', 'disabled', 'diagnostic'],
    ['target', 'label'],
    'Canvas workspace context catalog option',
  );
  const target = parseCanvasWorkspaceTurnTarget(value['target']);
  const option = {
    target,
    label: requireIdentity(value['label'], 'Canvas option label'),
    ...(value['index'] === undefined ? {} : { index: parseCanvasBoardIndexEntry(value['index']) }),
    ...(value['summary'] === undefined
      ? {}
      : { summary: parseCanvasWorkspaceTurnSummary(value['summary']) }),
    ...(value['disabled'] === undefined
      ? {}
      : { disabled: requireBoolean(value['disabled'], 'Canvas option disabled') }),
    ...(value['diagnostic'] === undefined
      ? {}
      : { diagnostic: requireIdentity(value['diagnostic'], 'Canvas option diagnostic') }),
  };
  if (target.kind === 'workspace-board' && option.index) {
    throw new Error('The logical Board option must not carry a file-backed index entry.');
  }
  if (target.kind === 'workspace-board' && option.disabled === true) {
    throw new Error('The logical Board option cannot be disabled.');
  }
  return option;
}

export function parseCanvasWorkspaceTurnContext(value: unknown): CanvasWorkspaceTurnContext {
  if (!isRecord(value)) {
    throw new Error('Canvas workspace turn context must be an object.');
  }
  requireAllowedKeys(value, ['target', 'summary'], ['target'], 'Canvas workspace turn context');
  const target = parseCanvasWorkspaceTurnTarget(value['target']);
  if (target.kind === 'workspace-board') {
    if (value['summary'] !== undefined) {
      throw new Error('The logical Board turn context must not carry a Canvas summary.');
    }
    return Object.freeze({ target });
  }
  if (value['summary'] === undefined) {
    throw new Error('Exact Canvas turn context requires its light summary.');
  }
  const summary = parseCanvasWorkspaceTurnSummary(value['summary']);
  if (summary.canvasId !== target.canvasId) {
    throw new Error('Canvas turn summary must match the exact Canvas target.');
  }
  return Object.freeze({ target, summary });
}

export function projectCanvasWorkspaceContextOptionIndex(
  summary: CanvasBoardSummary,
): CanvasBoardIndexEntry {
  return projectCanvasBoardSummaryForIndex(summary);
}

export function projectCanvasWorkspaceTurnSummary(input: {
  readonly canvasId: string;
  readonly name: string;
  readonly nodes: readonly { readonly type: string }[];
  readonly updatedAt?: string;
}): CanvasWorkspaceTurnSummary {
  const nodeTypeSummary: Record<string, number> = {};
  for (const node of input.nodes) {
    const type = requireIdentity(node.type, 'Canvas node type');
    nodeTypeSummary[type] = (nodeTypeSummary[type] ?? 0) + 1;
  }
  return Object.freeze({
    canvasId: requireIdentity(input.canvasId, 'Canvas identity'),
    name: requireIdentity(input.name, 'Canvas name'),
    nodeTypeSummary: Object.freeze(nodeTypeSummary),
    ...(input.updatedAt === undefined
      ? {}
      : { updatedAt: requireIdentity(input.updatedAt, 'Canvas updatedAt') }),
  });
}

function freezeCatalogOption(
  option: CanvasWorkspaceContextCatalogOption,
): CanvasWorkspaceContextCatalogOption {
  return Object.freeze({
    ...option,
    ...(option.index === undefined ? {} : { index: Object.freeze({ ...option.index }) }),
  });
}

function parseCatalogOption(
  input: CanvasWorkspaceContextCatalogOption,
): CanvasWorkspaceContextCatalogOption {
  const target = parseCanvasWorkspaceTurnTarget(input.target);
  if (target.kind === 'workspace-board' && input.index) {
    throw new Error('The logical Board option must not carry a file-backed index entry.');
  }
  if (target.kind === 'workspace-board' && input.summary) {
    throw new Error('The logical Board option must not carry a Canvas summary.');
  }
  if (target.kind === 'workspace-board' && input.disabled === true) {
    throw new Error('The logical Board option cannot be disabled.');
  }
  return {
    target,
    label: requireIdentity(input.label, 'Canvas option label'),
    ...(input.index === undefined ? {} : { index: input.index }),
    ...(input.summary === undefined
      ? {}
      : { summary: parseCanvasWorkspaceTurnSummary(input.summary) }),
    ...(input.disabled === undefined ? {} : { disabled: input.disabled }),
    ...(input.diagnostic === undefined ? {} : { diagnostic: input.diagnostic }),
  };
}

function parseCanvasWorkspaceTurnSummary(value: unknown): CanvasWorkspaceTurnSummary {
  if (!isRecord(value)) {
    throw new Error('Canvas workspace turn summary must be an object.');
  }
  requireAllowedKeys(
    value,
    ['canvasId', 'name', 'nodeTypeSummary', 'updatedAt'],
    ['name'],
    'Canvas workspace turn summary',
  );
  const canvasId =
    value['canvasId'] === undefined
      ? undefined
      : requireIdentity(value['canvasId'], 'Canvas summary id');
  return Object.freeze({
    ...(canvasId === undefined ? {} : { canvasId }),
    name: requireIdentity(value['name'], 'Canvas summary name'),
    ...(value['nodeTypeSummary'] === undefined
      ? {}
      : { nodeTypeSummary: parseNodeTypeSummary(value['nodeTypeSummary']) }),
    ...(value['updatedAt'] === undefined
      ? {}
      : { updatedAt: requireIdentity(value['updatedAt'], 'Canvas summary updatedAt') }),
  });
}

function parseCanvasBoardIndexEntry(value: unknown): CanvasBoardIndexEntry {
  if (!isRecord(value)) {
    throw new Error('Canvas Board index entry must be an object.');
  }
  requireAllowedKeys(
    value,
    [
      'canvasId',
      'name',
      'scopeKind',
      'workId',
      'title',
      'episodeId',
      'sequenceId',
      'sceneIds',
      'shotIds',
      'relatedBoardCount',
      'nodeTypeSummary',
      'updatedAt',
    ],
    ['name', 'scopeKind', 'relatedBoardCount'],
    'Canvas Board index entry',
  );
  const scopeKind = parseScopeKind(value['scopeKind']);
  return {
    ...(value['canvasId'] === undefined
      ? {}
      : { canvasId: requireIdentity(value['canvasId'], 'Canvas id') }),
    name: requireIdentity(value['name'], 'Canvas Board index name'),
    scopeKind,
    ...(value['workId'] === undefined ? {} : { workId: requireIdentity(value['workId'], 'Work') }),
    ...(value['title'] === undefined ? {} : { title: requireIdentity(value['title'], 'Title') }),
    ...(value['episodeId'] === undefined
      ? {}
      : { episodeId: requireIdentity(value['episodeId'], 'Episode') }),
    ...(value['sequenceId'] === undefined
      ? {}
      : { sequenceId: requireIdentity(value['sequenceId'], 'Sequence') }),
    ...(value['sceneIds'] === undefined
      ? {}
      : { sceneIds: requireIdentityArray(value['sceneIds'], 'Scene') }),
    ...(value['shotIds'] === undefined
      ? {}
      : { shotIds: requireIdentityArray(value['shotIds'], 'Shot') }),
    relatedBoardCount: requireFiniteNonNegativeNumber(
      value['relatedBoardCount'],
      'relatedBoardCount',
    ),
    ...(value['nodeTypeSummary'] === undefined
      ? {}
      : { nodeTypeSummary: parseNodeTypeSummary(value['nodeTypeSummary']) }),
    ...(value['updatedAt'] === undefined
      ? {}
      : { updatedAt: requireIdentity(value['updatedAt'], 'Canvas Board updatedAt') }),
  };
}

function parseNodeTypeSummary(value: unknown): Readonly<Record<string, number>> {
  if (!isRecord(value)) {
    throw new Error('Canvas node type summary must be an object.');
  }
  const summary: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    if (key.trim().length === 0) {
      throw new Error('Canvas node type summary keys must not be empty.');
    }
    summary[key] = requireFiniteNonNegativeInteger(count, `Canvas node type summary '${key}'`);
  }
  return Object.freeze(summary);
}

function parseScopeKind(value: unknown): CanvasBoardIndexEntry['scopeKind'] {
  if (value === 'unknown') return 'unknown';
  if (
    typeof value === 'string' &&
    (CANVAS_CREATIVE_SCOPE_KINDS as readonly string[]).includes(value)
  ) {
    return value as CanvasBoardIndexEntry['scopeKind'];
  }
  throw new Error(`Unknown Canvas creative scope kind '${String(value)}'.`);
}

function requireFiniteNonNegativeInteger(value: unknown, label: string): number {
  const number = requireFiniteNonNegativeNumber(value, label);
  if (!Number.isInteger(number)) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return number;
}

function requireFiniteNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number.`);
  }
  return value;
}

function sameTarget(left: CanvasWorkspaceTurnTarget, right: CanvasWorkspaceTurnTarget): boolean {
  return (
    left.kind === right.kind &&
    left.workspaceId === right.workspaceId &&
    (left.kind === 'workspace-board'
      ? right.kind === 'workspace-board'
      : right.kind === 'exact-canvas' && left.canvasId === right.canvasId)
  );
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} identity is required.`);
  }
  return value;
}

function requireIdentityArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${label} identities must be an array.`);
  return value.map((entry) => requireIdentity(entry, label));
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean.`);
  return value;
}

function requireExactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  requireAllowedKeys(record, keys, keys, label);
}

function requireAllowedKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  label: string,
): void {
  const unknown = Object.keys(record).find((key) => !allowedKeys.includes(key));
  if (unknown) throw new Error(`${label} contains unsupported field '${unknown}'.`);
  const missing = requiredKeys.find((key) => !(key in record));
  if (missing) throw new Error(`${label} is missing field '${missing}'.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
