import type {
  WorkspaceStorageInspectionEntry,
  WorkspaceStorageInspectionReport,
} from '../types/storage';

export type StorageMigrationAuthority =
  | 'project-fact'
  | 'user-editable'
  | 'journal-log'
  | 'valuable-local-state'
  | 'rebuildable-projection'
  | 'artifact'
  | 'scratch'
  | 'unknown';

export type StorageMigrationRebuildability = 'rebuildable' | 'not-rebuildable' | 'unknown';
export type StorageMigrationAction = 'migrate' | 'rebuild' | 'promote' | 'quarantine' | 'skip';

export interface StorageMigrationSource {
  readonly sourceId: string;
  readonly sourcePath: string;
  readonly authority: StorageMigrationAuthority;
  readonly rebuildability: StorageMigrationRebuildability;
  readonly proposedAction: StorageMigrationAction;
}

export interface StorageMigrationPlanItem extends StorageMigrationSource {
  readonly requiresApproval: boolean;
  readonly approvedAt: string | null;
  readonly mutationAllowed: boolean;
}

export interface StorageMigrationPlan {
  readonly planId: string;
  readonly createdAt: string;
  readonly status: 'ready' | 'approval-required';
  readonly items: readonly StorageMigrationPlanItem[];
}

export type StorageMigrationPlanErrorCode =
  | 'storage-migration-approval-required'
  | 'storage-migration-source-not-mutable'
  | 'storage-migration-source-not-found';

export class StorageMigrationPlanError extends Error {
  readonly code: StorageMigrationPlanErrorCode;
  readonly sourceId: string;

  constructor(code: StorageMigrationPlanErrorCode, sourceId: string, message: string) {
    super(message);
    this.name = 'StorageMigrationPlanError';
    this.code = code;
    this.sourceId = sourceId;
  }
}

export function inventoryWorkspaceStorageMigrationSources(
  report: WorkspaceStorageInspectionReport,
): readonly StorageMigrationSource[] {
  return report.entries.map((entry) => ({
    sourceId: `${entry.kind}:${entry.relativePath}`,
    sourcePath: entry.relativePath,
    ...classifyWorkspaceInspectionEntry(entry),
  }));
}

export function createStorageMigrationPlan(input: {
  readonly planId: string;
  readonly createdAt: string;
  readonly sources: readonly StorageMigrationSource[];
}): StorageMigrationPlan {
  validateNonEmpty(input.planId, 'planId');
  validateTimestamp(input.createdAt, 'createdAt');
  const sourceIds = new Set<string>();
  const items = input.sources.map((source) => {
    validateNonEmpty(source.sourceId, 'sourceId');
    validateNonEmpty(source.sourcePath, 'sourcePath');
    if (sourceIds.has(source.sourceId)) {
      throw new Error(`Storage migration sourceId must be unique: ${source.sourceId}`);
    }
    sourceIds.add(source.sourceId);
    validateSourceClassification(source);
    const requiresApproval = source.proposedAction !== 'skip' && !isRebuildableMutation(source);
    return {
      ...source,
      requiresApproval,
      approvedAt: null,
      mutationAllowed: source.proposedAction !== 'skip' && !requiresApproval,
    };
  });
  return createPlan(input.planId, input.createdAt, items);
}

export function approveStorageMigrationPlan(
  plan: StorageMigrationPlan,
  approval: { readonly approvedSourceIds: readonly string[]; readonly approvedAt: string },
): StorageMigrationPlan {
  validateTimestamp(approval.approvedAt, 'approvedAt');
  if (new Set(approval.approvedSourceIds).size !== approval.approvedSourceIds.length) {
    throw new Error('Storage migration approvedSourceIds must be unique.');
  }
  const approvedSourceIds = new Set(approval.approvedSourceIds);
  for (const sourceId of approvedSourceIds) {
    const item = plan.items.find((candidate) => candidate.sourceId === sourceId);
    if (!item) {
      throw new StorageMigrationPlanError(
        'storage-migration-source-not-found',
        sourceId,
        `Storage migration source is not in plan ${plan.planId}: ${sourceId}`,
      );
    }
    if (!item.requiresApproval) {
      throw new StorageMigrationPlanError(
        'storage-migration-source-not-mutable',
        sourceId,
        `Storage migration source does not accept approval: ${sourceId}`,
      );
    }
  }
  const items = plan.items.map((item) =>
    approvedSourceIds.has(item.sourceId)
      ? { ...item, approvedAt: approval.approvedAt, mutationAllowed: true }
      : item,
  );
  return createPlan(plan.planId, plan.createdAt, items);
}

export function assertStorageMigrationMutationAllowed(
  plan: StorageMigrationPlan,
  sourceId: string,
): void {
  const item = plan.items.find((candidate) => candidate.sourceId === sourceId);
  if (!item) {
    throw new StorageMigrationPlanError(
      'storage-migration-source-not-found',
      sourceId,
      `Storage migration source is not in plan ${plan.planId}: ${sourceId}`,
    );
  }
  if (item.proposedAction === 'skip') {
    throw new StorageMigrationPlanError(
      'storage-migration-source-not-mutable',
      sourceId,
      `Storage migration source is classified as non-mutating: ${sourceId}`,
    );
  }
  if (!item.mutationAllowed) {
    throw new StorageMigrationPlanError(
      'storage-migration-approval-required',
      sourceId,
      `Storage migration source requires explicit approval: ${sourceId}`,
    );
  }
}

function createPlan(
  planId: string,
  createdAt: string,
  items: readonly StorageMigrationPlanItem[],
): StorageMigrationPlan {
  return {
    planId,
    createdAt,
    status: items.some((item) => item.requiresApproval && !item.mutationAllowed)
      ? 'approval-required'
      : 'ready',
    items,
  };
}

function isRebuildableMutation(source: StorageMigrationSource): boolean {
  return (
    source.rebuildability === 'rebuildable' &&
    (source.authority === 'rebuildable-projection' || source.authority === 'scratch')
  );
}

function classifyWorkspaceInspectionEntry(
  entry: WorkspaceStorageInspectionEntry,
): Pick<StorageMigrationSource, 'authority' | 'rebuildability' | 'proposedAction'> {
  switch (entry.kind) {
    case 'legacy-database':
      return {
        authority: 'unknown',
        rebuildability: 'unknown',
        proposedAction: 'quarantine',
      };
    case 'legacy-manifest':
      return entry.relativePath.endsWith('/tasks.json')
        ? {
            authority: 'valuable-local-state',
            rebuildability: 'not-rebuildable',
            proposedAction: 'migrate',
          }
        : {
            authority: 'rebuildable-projection',
            rebuildability: 'rebuildable',
            proposedAction: 'rebuild',
          };
    case 'legacy-projection':
    case 'large-cache':
      return {
        authority: 'rebuildable-projection',
        rebuildability: 'rebuildable',
        proposedAction: 'rebuild',
      };
    case 'misplaced-project-fact':
      return {
        authority: 'project-fact',
        rebuildability: 'not-rebuildable',
        proposedAction: 'promote',
      };
    case 'misplaced-personal-content':
    case 'deprecated-directory':
      return {
        authority: 'user-editable',
        rebuildability: 'not-rebuildable',
        proposedAction: 'migrate',
      };
    case 'raw-logs':
      return {
        authority: 'journal-log',
        rebuildability: 'not-rebuildable',
        proposedAction: 'skip',
      };
    case 'preview-recordings':
    case 'import-staging':
      return {
        authority: 'artifact',
        rebuildability: 'unknown',
        proposedAction: 'promote',
      };
    case 'temporary-storage':
      return {
        authority: 'scratch',
        rebuildability: 'rebuildable',
        proposedAction: 'quarantine',
      };
  }
}

function validateSourceClassification(source: StorageMigrationSource): void {
  if (source.proposedAction === 'rebuild' && !isRebuildableMutation(source)) {
    throw new Error(
      `Storage migration rebuild source is not classified as rebuildable: ${source.sourceId}`,
    );
  }
  if (source.authority === 'journal-log' && source.proposedAction !== 'skip') {
    throw new Error(
      `Storage migration Journal/log authority must remain non-mutating: ${source.sourceId}`,
    );
  }
}

function validateNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`Storage migration ${field} is required.`);
}

function validateTimestamp(value: string, field: string): void {
  if (!value.trim() || Number.isNaN(Date.parse(value))) {
    throw new Error(`Storage migration ${field} must be an ISO-compatible timestamp.`);
  }
}
