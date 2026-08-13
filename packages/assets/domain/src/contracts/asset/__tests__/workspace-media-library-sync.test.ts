import { describe, expect, it } from 'vitest';
import {
  aggregateWorkspaceMediaLibraryRequirements,
  parsePortableMediaLibrarySnapshotCheckpointPayload,
  parsePortableMediaLibrarySnapshotPlan,
  parsePortableMediaLibrarySnapshotProgress,
  parsePortableMediaLibrarySnapshotTaskPayload,
} from '../workspace-media-library-sync';

describe('Workspace Media Library sync contracts', () => {
  it('aggregates deterministic requirements and deduplicates one owner locator', () => {
    const snapshot = aggregateWorkspaceMediaLibraryRequirements({
      owners: [
        {
          ownerKind: 'canvas',
          ownerId: 'board-a',
          sourceFingerprint: 'sourceFingerprint-2',
          references: [
            {
              kind: 'media-library',
              libraryName: 'Footage',
              relativePath: 'shots/a.mov',
            },
            {
              kind: 'media-library',
              libraryName: 'Footage',
              relativePath: 'shots/a.mov',
            },
            {
              kind: 'media-library',
              libraryName: 'Documents',
              relativePath: 'book.epub',
            },
            { kind: 'workspace-file', path: 'media/project-owned.png' },
          ],
        },
        {
          ownerKind: 'cut',
          ownerId: 'timeline-a',
          sourceFingerprint: 'sourceFingerprint-1',
          references: [
            {
              kind: 'media-library',
              libraryName: 'Footage',
              relativePath: 'audio/a.wav',
            },
          ],
        },
      ],
      coverage: {
        expectedOwnerKinds: ['canvas', 'cut', 'entity-representation'],
        coveredOwnerKinds: ['canvas', 'cut'],
      },
    });

    expect(snapshot).toMatchObject({
      fingerprint: expect.stringMatching(/^requirements:[a-f0-9]+$/),
      coverage: 'incomplete',
      missingOwnerKinds: ['entity-representation'],
    });
    expect(
      snapshot.requirements.map(({ libraryName, descendants, references }) => ({
        libraryName,
        descendants,
        referenceCount: references.length,
      })),
    ).toEqual([
      {
        libraryName: 'Documents',
        descendants: ['book.epub'],
        referenceCount: 1,
      },
      {
        libraryName: 'Footage',
        descendants: ['audio/a.wav', 'shots/a.mov'],
        referenceCount: 2,
      },
    ]);
  });

  it('rejects malformed Media Library locators instead of guessing', () => {
    expect(() =>
      aggregateWorkspaceMediaLibraryRequirements({
        owners: [
          {
            ownerKind: 'canvas',
            ownerId: 'board-a',
            sourceFingerprint: 'sourceFingerprint-1',
            references: [{ kind: 'media-library', libraryName: 'Footage', relativePath: '' }],
          },
        ],
        coverage: { expectedOwnerKinds: ['canvas'], coveredOwnerKinds: ['canvas'] },
      }),
    ).toThrow('invalid ContentLocator');
  });

  it.each([
    { workspaceId: '/absolute/workspace' },
    { targetDirectory: '/Volumes/Media' },
    { libraryJson: { Footage: '/Volumes/Media' } },
    { globalLibraryId: 'media-library:local:Footage' },
    { runtimeUrl: 'file:///Volumes/Media' },
    { activeWorkspace: true },
  ])('rejects target-bearing task payload fields: %o', (extra) => {
    expect(() =>
      parsePortableMediaLibrarySnapshotTaskPayload({
        workspaceId: 'workspace-a',
        snapshotId: 'snapshot-a',
        requirementFingerprint: 'sourceFingerprint-a',
        status: 'planned',
        completedEntryCount: 0,
        totalEntryCount: 1,
        ...extra,
      }),
    ).toThrow();
  });

  it('rejects unknown durable task states and diagnostics', () => {
    const payload = {
      workspaceId: 'workspace-a',
      snapshotId: 'snapshot-a',
      requirementFingerprint: 'sourceFingerprint-a',
      completedEntryCount: 0,
      totalEntryCount: 1,
    };
    expect(() =>
      parsePortableMediaLibrarySnapshotTaskPayload({
        ...payload,
        status: 'recovering',
      }),
    ).toThrow('status is invalid');
    expect(() =>
      parsePortableMediaLibrarySnapshotTaskPayload({
        ...payload,
        status: 'failed',
        diagnosticCode: 'unknown-recovery-state',
      }),
    ).toThrow('diagnostic code is invalid');
  });

  it.each([
    { sourcePath: '/Users/example/project' },
    { destinationPath: '/Volumes/Export/Portable' },
    { stagingPath: '/Volumes/Export/.Portable.staging' },
    { target: '\\\\server\\share' },
    { runtimeUrl: 'file:///Volumes/Export/Portable' },
    { credentials: { token: 'secret' } },
  ])('rejects target-bearing portable plan fields: %o', (extra) => {
    expect(() =>
      parsePortableMediaLibrarySnapshotPlan({
        snapshotId: 'snapshot-a',
        workspaceId: 'workspace-a',
        requirementFingerprint: 'requirements:abc',
        operationFingerprint: 'operation-a',
        entryCount: 1,
        totalByteLength: 12,
        libraries: [
          {
            libraryName: 'Footage',
            entryCount: 1,
            totalByteLength: 12,
          },
        ],
        ...extra,
      }),
    ).toThrow('unsupported fields');
  });

  it('validates portable plan totals and progress bounds', () => {
    expect(
      parsePortableMediaLibrarySnapshotPlan({
        snapshotId: 'snapshot-a',
        workspaceId: 'workspace-a',
        requirementFingerprint: 'requirements:abc',
        operationFingerprint: 'operation-a',
        entryCount: 1,
        totalByteLength: 12,
        libraries: [
          {
            libraryName: 'Footage',
            entryCount: 1,
            totalByteLength: 12,
          },
        ],
      }),
    ).toMatchObject({ entryCount: 1, totalByteLength: 12 });

    expect(() =>
      parsePortableMediaLibrarySnapshotPlan({
        snapshotId: 'snapshot-a',
        workspaceId: 'workspace-a',
        requirementFingerprint: 'requirements:abc',
        operationFingerprint: 'operation-a',
        entryCount: 2,
        totalByteLength: 12,
        libraries: [
          {
            libraryName: 'Footage',
            entryCount: 1,
            totalByteLength: 12,
          },
        ],
      }),
    ).toThrow('entry counts do not match');

    expect(() =>
      parsePortableMediaLibrarySnapshotProgress({
        snapshotId: 'snapshot-a',
        workspaceId: 'workspace-a',
        requirementFingerprint: 'requirements:abc',
        status: 'running',
        completedEntryCount: 1,
        totalEntryCount: 1,
        completedByteLength: 13,
        totalByteLength: 12,
      }),
    ).toThrow('completed byte length exceeds its total');

    expect(() =>
      parsePortableMediaLibrarySnapshotProgress({
        snapshotId: 'snapshot-a',
        workspaceId: 'workspace-a',
        requirementFingerprint: 'requirements:abc',
        status: 'running',
        completedEntryCount: 0,
        totalEntryCount: 1,
        completedByteLength: 0,
        totalByteLength: 12,
        destinationPath: '/Volumes/Export/Portable',
      }),
    ).toThrow('unsupported fields');
  });

  it('accepts only portable minimal checkpoint entry keys', () => {
    expect(
      parsePortableMediaLibrarySnapshotCheckpointPayload({
        workspaceId: 'workspace-a',
        snapshotId: 'snapshot-a',
        requirementFingerprint: 'sourceFingerprint-a',
        completedEntryKeys: ['media/collected/Footage/a.mov'],
      }),
    ).toMatchObject({ completedEntryKeys: ['media/collected/Footage/a.mov'] });

    expect(() =>
      parsePortableMediaLibrarySnapshotCheckpointPayload({
        workspaceId: 'workspace-a',
        snapshotId: 'snapshot-a',
        requirementFingerprint: 'sourceFingerprint-a',
        completedEntryKeys: ['/Volumes/Media/a.mov'],
      }),
    ).toThrow('entry key is invalid');
  });
});
