import { describe, expect, it } from 'vitest';
import { LocalMetadataError } from '../contracts';
import { createStorageMaintenanceReport } from '../maintenance-report';
import {
  formatLocalMetadataUserDiagnostic,
  projectLocalMetadataUserDiagnostic,
  projectStorageMigrationPlanUserDiagnostic,
  projectStorageMaintenanceUserDiagnostic,
} from '../user-diagnostic';

describe('local metadata user diagnostics', () => {
  it.each([
    ['metadata-unsupported-runtime', 'local-metadata-unsupported-runtime'],
    ['metadata-migration-failed', 'local-metadata-migration-failed'],
    ['metadata-backup-failed', 'local-metadata-backup-failed'],
    ['metadata-restore-failed', 'local-metadata-recovery-failed'],
    ['metadata-integrity-failed', 'local-metadata-corrupt'],
    ['metadata-stale-projection', 'local-metadata-rebuild-required'],
  ] as const)('projects %s without exposing raw storage details', (code, expectedCode) => {
    const projected = projectLocalMetadataUserDiagnostic(
      new LocalMetadataError({
        code,
        operation: 'test',
        message: 'SQLITE_CORRUPT at /Users/private/.neko/neko.db table conversations',
      }),
    );

    expect(projected).toMatchObject({ code: expectedCode });
    expect(formatLocalMetadataUserDiagnostic(projected!)).not.toMatch(
      /SQLITE|\/Users\/private|neko\.db|conversations/u,
    );
  });

  it('guides duplicate identity recovery through explicit clone or rebind', () => {
    expect(
      projectLocalMetadataUserDiagnostic({ code: 'duplicate-workspace-identity' }),
    ).toMatchObject({
      code: 'local-metadata-workspace-identity-conflict',
      actions: ['choose-clone-or-rebind'],
    });
  });

  it('guides locator ambiguity through canonical identity selection', () => {
    expect(
      projectLocalMetadataUserDiagnostic({ code: 'ambiguous-workspace-locator' }),
    ).toMatchObject({
      code: 'local-metadata-workspace-locator-ambiguous',
      actions: ['choose-workspace-identity'],
    });
  });

  it('presents a pending migration plan as review-required rather than failed', () => {
    expect(
      projectStorageMigrationPlanUserDiagnostic({
        planId: 'plan-1',
        createdAt: '2026-07-13T00:00:00.000Z',
        status: 'approval-required',
        items: [
          {
            sourceId: 'task:memento',
            sourcePath: 'vscode-globalState:neko.agent.tasks',
            authority: 'valuable-local-state',
            rebuildability: 'not-rebuildable',
            proposedAction: 'migrate',
            requiresApproval: true,
            approvedAt: null,
            mutationAllowed: false,
          },
        ],
      }),
    ).toMatchObject({
      code: 'local-metadata-migration-approval-required',
      severity: 'warning',
      actions: ['review-migration-plan'],
    });
  });

  it('summarizes cleanup without collapsing user-action-required entries', () => {
    const projected = projectStorageMaintenanceUserDiagnostic(
      createStorageMaintenanceReport({
        operation: 'cleanup',
        startedAt: '2026-07-13T00:00:00.000Z',
        completedAt: '2026-07-13T00:00:01.000Z',
        entries: [
          { subject: 'cache', outcome: 'deleted', reason: 'stale' },
          {
            subject: 'recording',
            outcome: 'user-action-required',
            reason: 'valuable',
          },
        ],
      }),
    );

    expect(projected).toMatchObject({ severity: 'warning', actions: ['review-cleanup-report'] });
    expect(projected.summary).toContain('changed 1 item(s)');
    expect(projected.summary).toContain('left 1 item(s)');
  });
});
