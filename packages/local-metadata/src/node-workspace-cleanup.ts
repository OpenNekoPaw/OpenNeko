import { lstat, readdir, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import {
  createStorageMaintenanceReport,
  type StorageMaintenanceOutcome,
  type StorageMaintenanceReport,
} from './maintenance-report';

export type WorkspaceCleanupStorageClass =
  'rebuildable' | 'scratch' | 'valuable-state' | 'project-fact' | 'retained-artifact';

export interface WorkspaceCleanupCandidate {
  readonly path: string;
  readonly storageClass: WorkspaceCleanupStorageClass;
  readonly pinned?: boolean;
  readonly sessionActive?: boolean;
  readonly promoted?: boolean;
  readonly debugRetained?: boolean;
}

export type WorkspaceCleanupSkipReason =
  | 'valuable-state'
  | 'project-fact'
  | 'retained-artifact'
  | 'pinned'
  | 'session-active'
  | 'promoted'
  | 'debug-retained'
  | 'outside-allowed-root'
  | 'managed-root'
  | 'missing';

export type WorkspaceCleanupEntry =
  | {
      readonly path: string;
      readonly storageClass: WorkspaceCleanupStorageClass;
      readonly outcome: 'deleted';
      readonly sizeBytes: number;
    }
  | {
      readonly path: string;
      readonly storageClass: WorkspaceCleanupStorageClass;
      readonly outcome: 'skipped';
      readonly sizeBytes: number | null;
      readonly reason: WorkspaceCleanupSkipReason;
    };

export interface WorkspaceCleanupReport {
  readonly deletedCount: number;
  readonly deletedBytes: number;
  readonly skippedCount: number;
  readonly entries: readonly WorkspaceCleanupEntry[];
  readonly maintenanceReport: StorageMaintenanceReport;
}

export interface CleanupWorkspaceStorageOptions {
  readonly allowedRoots: readonly string[];
  readonly candidates: readonly WorkspaceCleanupCandidate[];
  readonly now?: () => string;
}

export async function cleanupWorkspaceStorage(
  options: CleanupWorkspaceStorageOptions,
): Promise<WorkspaceCleanupReport> {
  const now = options.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const allowedRoots = validateAbsoluteUniquePaths(options.allowedRoots, 'allowed root');
  if (allowedRoots.length === 0) {
    throw new Error('Workspace cleanup requires at least one allowed root.');
  }
  const candidatePaths = validateAbsoluteUniquePaths(
    options.candidates.map((candidate) => candidate.path),
    'candidate',
  );
  const entries: WorkspaceCleanupEntry[] = [];

  for (let index = 0; index < options.candidates.length; index += 1) {
    const candidate = options.candidates[index];
    const candidatePath = candidatePaths[index];
    if (!candidate || !candidatePath) {
      throw new Error('Workspace cleanup candidate validation lost input ordering.');
    }
    const protectedReason = readProtectionReason(candidate);
    if (protectedReason) {
      entries.push({
        path: candidatePath,
        storageClass: candidate.storageClass,
        outcome: 'skipped',
        sizeBytes: null,
        reason: protectedReason,
      });
      continue;
    }
    const owningRoot = allowedRoots.find((root) => isPathInsideOrEqual(candidatePath, root));
    if (!owningRoot) {
      entries.push({
        path: candidatePath,
        storageClass: candidate.storageClass,
        outcome: 'skipped',
        sizeBytes: null,
        reason: 'outside-allowed-root',
      });
      continue;
    }
    if (candidatePath === owningRoot) {
      entries.push({
        path: candidatePath,
        storageClass: candidate.storageClass,
        outcome: 'skipped',
        sizeBytes: null,
        reason: 'managed-root',
      });
      continue;
    }
    const sizeBytes = await readPathSize(candidatePath);
    if (sizeBytes === null) {
      entries.push({
        path: candidatePath,
        storageClass: candidate.storageClass,
        outcome: 'skipped',
        sizeBytes: null,
        reason: 'missing',
      });
      continue;
    }
    await rm(candidatePath, { force: true, recursive: true });
    entries.push({
      path: candidatePath,
      storageClass: candidate.storageClass,
      outcome: 'deleted',
      sizeBytes,
    });
  }

  const deletedEntries = entries.filter(
    (entry): entry is Extract<WorkspaceCleanupEntry, { outcome: 'deleted' }> =>
      entry.outcome === 'deleted',
  );
  return {
    deletedCount: deletedEntries.length,
    deletedBytes: deletedEntries.reduce((total, entry) => total + entry.sizeBytes, 0),
    skippedCount: entries.length - deletedEntries.length,
    entries,
    maintenanceReport: createStorageMaintenanceReport({
      operation: 'cleanup',
      startedAt,
      completedAt: now(),
      entries: entries.map((entry) => ({
        outcome: maintenanceOutcome(entry),
        subject: `${entry.storageClass}:${entry.path}`,
        sourcePath: entry.path,
        ...(entry.outcome === 'deleted'
          ? { sizeBytes: entry.sizeBytes }
          : { reason: entry.reason }),
      })),
    }),
  };
}

function maintenanceOutcome(entry: WorkspaceCleanupEntry): StorageMaintenanceOutcome {
  if (entry.outcome === 'deleted') return 'deleted';
  return entry.reason === 'valuable-state' ||
    entry.reason === 'project-fact' ||
    entry.reason === 'retained-artifact' ||
    entry.reason === 'outside-allowed-root'
    ? 'user-action-required'
    : 'skipped';
}

function readProtectionReason(
  candidate: WorkspaceCleanupCandidate,
): WorkspaceCleanupSkipReason | null {
  if (candidate.storageClass === 'valuable-state') return 'valuable-state';
  if (candidate.storageClass === 'project-fact') return 'project-fact';
  if (candidate.storageClass === 'retained-artifact') return 'retained-artifact';
  if (candidate.pinned) return 'pinned';
  if (candidate.sessionActive) return 'session-active';
  if (candidate.promoted) return 'promoted';
  if (candidate.debugRetained) return 'debug-retained';
  return null;
}

function validateAbsoluteUniquePaths(paths: readonly string[], label: string): readonly string[] {
  const normalized = paths.map((path) => {
    if (!isAbsolute(path)) throw new Error(`Workspace cleanup ${label} must be absolute: ${path}`);
    return resolve(path);
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`Workspace cleanup ${label} paths must be unique.`);
  }
  return normalized;
}

function isPathInsideOrEqual(path: string, root: string): boolean {
  const relativePath = relative(root, path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

async function readPathSize(path: string): Promise<number | null> {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    if (isErrorWithCode(error) && error.code === 'ENOENT') return null;
    throw error;
  }
  if (metadata.isSymbolicLink()) return 0;
  if (!metadata.isDirectory()) return metadata.size;
  let total = 0;
  for (const child of await readdir(path)) total += (await readPathSize(join(path, child))) ?? 0;
  return total;
}

function isErrorWithCode(value: unknown): value is { readonly code: string } {
  return (
    typeof value === 'object' && value !== null && 'code' in value && typeof value.code === 'string'
  );
}
