export const STORAGE_MAINTENANCE_OUTCOMES = [
  'deleted',
  'migrated',
  'rebuilt',
  'promoted',
  'skipped',
  'quarantined',
  'user-action-required',
] as const;

export type StorageMaintenanceOutcome = (typeof STORAGE_MAINTENANCE_OUTCOMES)[number];
export type StorageMaintenanceOperation =
  'cleanup' | 'migration' | 'rebuild' | 'promotion' | 'repair';

export interface StorageMaintenanceReportEntry {
  readonly outcome: StorageMaintenanceOutcome;
  readonly subject: string;
  readonly sourcePath?: string;
  readonly targetPath?: string;
  readonly reason?: string;
  readonly diagnosticCode?: string;
  readonly sizeBytes?: number;
}

export interface StorageMaintenanceReport {
  readonly operation: StorageMaintenanceOperation;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly counts: Readonly<Record<StorageMaintenanceOutcome, number>>;
  readonly entries: readonly StorageMaintenanceReportEntry[];
}

export function createStorageMaintenanceReport(input: {
  readonly operation: StorageMaintenanceOperation;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly entries: readonly StorageMaintenanceReportEntry[];
}): StorageMaintenanceReport {
  validateTimestamp(input.startedAt, 'startedAt');
  validateTimestamp(input.completedAt, 'completedAt');
  if (Date.parse(input.completedAt) < Date.parse(input.startedAt)) {
    throw new Error('Storage maintenance report completedAt cannot precede startedAt.');
  }
  const counts = createEmptyCounts();
  for (const entry of input.entries) {
    if (!entry.subject.trim()) throw new Error('Storage maintenance report subject is required.');
    validateOptionalText(entry.sourcePath, 'sourcePath');
    validateOptionalText(entry.targetPath, 'targetPath');
    validateOptionalText(entry.reason, 'reason');
    validateOptionalText(entry.diagnosticCode, 'diagnosticCode');
    if (
      entry.sizeBytes !== undefined &&
      (!Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes < 0)
    ) {
      throw new Error('Storage maintenance report sizeBytes must be a non-negative safe integer.');
    }
    counts[entry.outcome] += 1;
  }
  return { ...input, counts, entries: [...input.entries] };
}

function createEmptyCounts(): Record<StorageMaintenanceOutcome, number> {
  return {
    deleted: 0,
    migrated: 0,
    rebuilt: 0,
    promoted: 0,
    skipped: 0,
    quarantined: 0,
    'user-action-required': 0,
  };
}

function validateTimestamp(value: string, field: string): void {
  if (!value.trim() || Number.isNaN(Date.parse(value))) {
    throw new Error(`Storage maintenance report ${field} must be an ISO-compatible timestamp.`);
  }
}

function validateOptionalText(value: string | undefined, field: string): void {
  if (value !== undefined && !value.trim()) {
    throw new Error(`Storage maintenance report ${field} cannot be empty.`);
  }
}
