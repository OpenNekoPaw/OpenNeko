import { describe, expect, it } from 'vitest';
import {
  approveStorageMigrationPlan,
  assertStorageMigrationMutationAllowed,
  createStorageMigrationPlan,
  inventoryWorkspaceStorageMigrationSources,
} from '../migration-planner';
import type {
  WorkspaceStorageInspectionEntry,
  WorkspaceStorageInspectionReport,
} from '../../types/storage';

describe('Storage migration planner', () => {
  it('allows rebuildable work but requires per-source approval for valuable or authoritative mutation', () => {
    const plan = createStorageMigrationPlan({
      planId: 'workspace-migration-1',
      createdAt: '2026-07-13T11:00:00.000Z',
      sources: [
        {
          sourceId: 'legacy-tasks',
          sourcePath: '/workspace/.neko/tasks.json',
          authority: 'valuable-local-state',
          rebuildability: 'not-rebuildable',
          proposedAction: 'migrate',
        },
        {
          sourceId: 'legacy-search',
          sourcePath: '/workspace/.neko/.cache/search-index.json',
          authority: 'rebuildable-projection',
          rebuildability: 'rebuildable',
          proposedAction: 'rebuild',
        },
        {
          sourceId: 'misplaced-fact',
          sourcePath: '/workspace/.neko/entity-bindings.json',
          authority: 'project-fact',
          rebuildability: 'not-rebuildable',
          proposedAction: 'promote',
        },
        {
          sourceId: 'raw-log',
          sourcePath: '/workspace/.neko/logs/events.jsonl',
          authority: 'journal-log',
          rebuildability: 'not-rebuildable',
          proposedAction: 'skip',
        },
      ],
    });

    expect(plan.status).toBe('approval-required');
    expect(plan.items).toEqual([
      expect.objectContaining({ sourceId: 'legacy-tasks', mutationAllowed: false }),
      expect.objectContaining({ sourceId: 'legacy-search', mutationAllowed: true }),
      expect.objectContaining({ sourceId: 'misplaced-fact', mutationAllowed: false }),
      expect.objectContaining({ sourceId: 'raw-log', mutationAllowed: false }),
    ]);
    expect(() => assertStorageMigrationMutationAllowed(plan, 'legacy-search')).not.toThrow();
    expect(() => assertStorageMigrationMutationAllowed(plan, 'legacy-tasks')).toThrowError(
      expect.objectContaining({ code: 'storage-migration-approval-required' }),
    );
    expect(() => assertStorageMigrationMutationAllowed(plan, 'raw-log')).toThrowError(
      expect.objectContaining({ code: 'storage-migration-source-not-mutable' }),
    );

    const partiallyApproved = approveStorageMigrationPlan(plan, {
      approvedSourceIds: ['legacy-tasks'],
      approvedAt: '2026-07-13T11:01:00.000Z',
    });
    expect(partiallyApproved.status).toBe('approval-required');
    expect(() =>
      assertStorageMigrationMutationAllowed(partiallyApproved, 'legacy-tasks'),
    ).not.toThrow();
    expect(() =>
      assertStorageMigrationMutationAllowed(partiallyApproved, 'misplaced-fact'),
    ).toThrowError(expect.objectContaining({ code: 'storage-migration-approval-required' }));

    const approved = approveStorageMigrationPlan(partiallyApproved, {
      approvedSourceIds: ['misplaced-fact'],
      approvedAt: '2026-07-13T11:02:00.000Z',
    });
    expect(approved.status).toBe('ready');
    expect(() => assertStorageMigrationMutationAllowed(approved, 'misplaced-fact')).not.toThrow();
  });

  it('classifies workspace inspection entries before planning mutation', () => {
    const report: WorkspaceStorageInspectionReport = {
      workspaceRoot: '/workspace',
      inspectedRoot: '/workspace/.neko',
      totalCacheBytes: 100,
      largeCacheThresholdBytes: 50,
      entries: [
        inspectionEntry('retired-workspace-database', 'legacy-database', '.neko/neko.db'),
        inspectionEntry('legacy-workspace-metadata', 'legacy-manifest', '.neko/tasks.json'),
        inspectionEntry(
          'legacy-workspace-metadata',
          'legacy-manifest',
          '.neko/.cache/search-index.json',
        ),
        inspectionEntry('legacy-workspace-metadata', 'legacy-projection', '.neko/semantic-index'),
        inspectionEntry(
          'misplaced-project-fact',
          'misplaced-project-fact',
          '.neko/entity-bindings.json',
        ),
        inspectionEntry(
          'misplaced-personal-content',
          'misplaced-personal-content',
          '.neko/prompts/personal.md',
        ),
        inspectionEntry('workspace-logs-present', 'raw-logs', '.neko/logs'),
        inspectionEntry('preview-recordings-present', 'preview-recordings', '.neko/recordings'),
        inspectionEntry('import-staging-present', 'import-staging', '.neko/imports'),
        inspectionEntry('temporary-storage-present', 'temporary-storage', '.neko/tmp'),
        inspectionEntry('deprecated-workspace-directory', 'deprecated-directory', '.neko/skills'),
        inspectionEntry('large-workspace-cache', 'large-cache', '.neko/.cache'),
      ],
    };

    expect(inventoryWorkspaceStorageMigrationSources(report)).toEqual([
      expect.objectContaining({
        authority: 'unknown',
        rebuildability: 'unknown',
        proposedAction: 'quarantine',
      }),
      expect.objectContaining({
        authority: 'valuable-local-state',
        rebuildability: 'not-rebuildable',
        proposedAction: 'migrate',
      }),
      expect.objectContaining({
        authority: 'rebuildable-projection',
        rebuildability: 'rebuildable',
        proposedAction: 'rebuild',
      }),
      expect.objectContaining({
        authority: 'rebuildable-projection',
        rebuildability: 'rebuildable',
        proposedAction: 'rebuild',
      }),
      expect.objectContaining({ authority: 'project-fact', proposedAction: 'promote' }),
      expect.objectContaining({ authority: 'user-editable', proposedAction: 'migrate' }),
      expect.objectContaining({ authority: 'journal-log', proposedAction: 'skip' }),
      expect.objectContaining({ authority: 'artifact', proposedAction: 'promote' }),
      expect.objectContaining({ authority: 'artifact', proposedAction: 'promote' }),
      expect.objectContaining({
        authority: 'scratch',
        rebuildability: 'rebuildable',
        proposedAction: 'quarantine',
      }),
      expect.objectContaining({ authority: 'user-editable', proposedAction: 'migrate' }),
      expect.objectContaining({
        authority: 'rebuildable-projection',
        rebuildability: 'rebuildable',
        proposedAction: 'rebuild',
      }),
    ]);
  });
});

function inspectionEntry(
  code: WorkspaceStorageInspectionEntry['code'],
  kind: WorkspaceStorageInspectionEntry['kind'],
  relativePath: string,
): WorkspaceStorageInspectionEntry {
  return {
    code,
    kind,
    relativePath,
    severity: 'warning' as const,
    sizeBytes: 1,
    requiresExplicitAction: false,
    message: code,
  };
}
