import type { StorageMaintenanceReport } from './maintenance-report';
import type { StorageMigrationPlan } from './migration-planner';

export type LocalMetadataUserAction =
  | 'update-runtime'
  | 'choose-clone-or-rebind'
  | 'choose-workspace-identity'
  | 'review-migration-plan'
  | 'retry-migration'
  | 'inspect-backup'
  | 'restore-backup'
  | 'run-integrity-check'
  | 'rebuild-projection'
  | 'review-cleanup-report';

export interface LocalMetadataUserDiagnostic {
  readonly code:
    | 'local-metadata-unsupported-runtime'
    | 'local-metadata-workspace-identity-conflict'
    | 'local-metadata-workspace-locator-ambiguous'
    | 'local-metadata-migration-approval-required'
    | 'local-metadata-migration-failed'
    | 'local-metadata-backup-failed'
    | 'local-metadata-recovery-failed'
    | 'local-metadata-corrupt'
    | 'local-metadata-unavailable'
    | 'local-metadata-rebuild-required'
    | 'local-metadata-cleanup-report';
  readonly severity: 'info' | 'warning' | 'error';
  readonly summary: string;
  readonly guidance: string;
  readonly actions: readonly LocalMetadataUserAction[];
}

export function projectLocalMetadataUserDiagnostic(
  error: unknown,
): LocalMetadataUserDiagnostic | null {
  const code = readErrorCode(error);
  switch (code) {
    case 'metadata-unsupported-runtime':
      return diagnostic(
        'local-metadata-unsupported-runtime',
        'error',
        'Local metadata is unavailable in this runtime.',
        'Update to a supported VS Code, Node, or Bun version and restart Neko.',
        ['update-runtime'],
      );
    case 'duplicate-workspace-identity':
      return diagnostic(
        'local-metadata-workspace-identity-conflict',
        'error',
        'This workspace identity is already bound to another location.',
        'Choose Clone for a copied checkout or Rebind for a moved or recovered checkout.',
        ['choose-clone-or-rebind'],
      );
    case 'ambiguous-workspace-locator':
      return diagnostic(
        'local-metadata-workspace-locator-ambiguous',
        'error',
        'This workspace location is registered to multiple identities.',
        'Choose the canonical identity for this checkout. Other identity partitions will remain recoverable as orphaned data.',
        ['choose-workspace-identity'],
      );
    case 'storage-migration-approval-required':
      return diagnostic(
        'local-metadata-migration-approval-required',
        'warning',
        'Legacy local metadata requires explicit migration approval.',
        'Review and approve the affected source separately before retrying migration.',
        ['review-migration-plan'],
      );
    case 'metadata-migration-failed':
    case 'metadata-migration-checksum-mismatch':
    case 'agent-task-state-migration-failed':
      return diagnostic(
        'local-metadata-migration-failed',
        'error',
        'Local metadata migration did not complete.',
        'The legacy source was preserved. Review the migration report and retry after resolving its diagnostic.',
        ['inspect-backup', 'retry-migration'],
      );
    case 'metadata-backup-failed':
      return diagnostic(
        'local-metadata-backup-failed',
        'error',
        'The safety backup could not be created.',
        'No destructive migration was applied. Fix the backup destination and retry.',
        ['inspect-backup', 'retry-migration'],
      );
    case 'metadata-restore-failed':
      return diagnostic(
        'local-metadata-recovery-failed',
        'error',
        'Local metadata recovery did not complete.',
        'Keep the source backup unchanged, run an integrity check, and retry recovery.',
        ['run-integrity-check', 'restore-backup'],
      );
    case 'metadata-integrity-failed':
      return diagnostic(
        'local-metadata-corrupt',
        'error',
        'Local metadata failed its integrity check.',
        'Preserve the current data, inspect available backups, and rebuild only cache-owned projections.',
        ['run-integrity-check', 'restore-backup', 'rebuild-projection'],
      );
    case 'metadata-stale-projection':
      return diagnostic(
        'local-metadata-rebuild-required',
        'warning',
        'A local metadata projection is stale.',
        'Authoritative data remains saved. Rebuild the affected projection before relying on its list or search results.',
        ['rebuild-projection'],
      );
    case 'metadata-store-open-failed':
    case 'metadata-store-not-open':
    case 'metadata-store-disposed':
    case 'metadata-transaction-failed':
      return diagnostic(
        'local-metadata-unavailable',
        'error',
        'Local metadata is temporarily unavailable.',
        'Restart the current Host. If the problem continues, run an integrity check before changing local data.',
        ['run-integrity-check'],
      );
    default:
      return null;
  }
}

export function projectStorageMigrationPlanUserDiagnostic(
  plan: StorageMigrationPlan,
): LocalMetadataUserDiagnostic | null {
  const pendingCount = plan.items.filter(
    (item) => item.requiresApproval && !item.mutationAllowed,
  ).length;
  if (pendingCount === 0) return null;
  return diagnostic(
    'local-metadata-migration-approval-required',
    'warning',
    `${pendingCount} legacy local metadata source(s) require migration approval.`,
    'Review each source separately. No backup, import, rename, or deletion occurs before approval.',
    ['review-migration-plan'],
  );
}

export function projectStorageMaintenanceUserDiagnostic(
  report: StorageMaintenanceReport,
): LocalMetadataUserDiagnostic {
  const changed =
    report.counts.deleted +
    report.counts.migrated +
    report.counts.rebuilt +
    report.counts.promoted +
    report.counts.quarantined;
  const attention = report.counts['user-action-required'];
  return diagnostic(
    'local-metadata-cleanup-report',
    attention > 0 ? 'warning' : 'info',
    `Storage maintenance changed ${changed} item(s) and left ${attention} item(s) requiring user action.`,
    'Review the itemized report before deleting, moving, or promoting any remaining valuable data.',
    ['review-cleanup-report'],
  );
}

export function formatLocalMetadataUserDiagnostic(diagnostic: LocalMetadataUserDiagnostic): string {
  return `${diagnostic.summary} ${diagnostic.guidance}`;
}

function diagnostic(
  code: LocalMetadataUserDiagnostic['code'],
  severity: LocalMetadataUserDiagnostic['severity'],
  summary: string,
  guidance: string,
  actions: readonly LocalMetadataUserAction[],
): LocalMetadataUserDiagnostic {
  return { code, severity, summary, guidance, actions };
}

function readErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = Reflect.get(error, 'code');
  return typeof code === 'string' ? code : null;
}
