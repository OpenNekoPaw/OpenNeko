import { describe, expect, it } from 'vitest';
import {
  parseDesktopProjectPortabilityExecuteRequest,
  parseDesktopProjectPortabilityInspectResult,
  parseDesktopProjectPortabilityPlanResult,
  parseDesktopProjectPortabilityProgressEvent,
  parseDesktopProjectPortabilityRequest,
} from '../project-portability-contract';

const identity = {
  projectId: 'project-a',
  workspaceId: 'workspace-a',
  windowId: 'window-a',
  rendererSessionId: 'endpoint-a',
} as const;

describe('Desktop project portability contract', () => {
  it.each([
    { sourcePath: '/Users/example/project' },
    { destinationPath: '/Volumes/Export/Portable' },
    { target: '\\\\server\\share' },
    { runtimeUrl: 'file:///Volumes/Export/Portable' },
    { credentials: { token: 'secret' } },
  ])('rejects target-bearing request fields: %o', (extra) => {
    expect(() =>
      parseDesktopProjectPortabilityRequest({
        requestId: 'request-a',
        identity,
        ...extra,
      }),
    ).toThrow('unsupported fields');
  });

  it('parses target-free readiness, plan, and progress projections', () => {
    expect(
      parseDesktopProjectPortabilityInspectResult({
        requestId: 'request-a',
        identity,
        portability: {
          state: 'sync-requires-relink',
          requirementFingerprint: 'requirements:abc',
          libraries: [
            {
              libraryName: 'Footage',
              state: 'required-unlinked',
              referenceCount: 1,
              missingCount: 1,
              operationFingerprint: 'sha256:abc',
              diagnostic: {
                code: 'content-incomplete',
                severity: 'error',
                message: 'Referenced media is incomplete.',
                missingCount: 1,
              },
            },
          ],
        },
      }),
    ).toMatchObject({
      portability: {
        state: 'sync-requires-relink',
        libraries: [{ libraryName: 'Footage', missingCount: 1 }],
      },
    });

    expect(
      parseDesktopProjectPortabilityPlanResult({
        requestId: 'request-a',
        identity,
        status: 'planned',
        plan: {
          snapshotId: 'snapshot-a',
          workspaceId: 'workspace-a',
          requirementFingerprint: 'requirements:abc',
          operationFingerprint: 'sha256:abc',
          entryCount: 1,
          totalByteLength: 12,
          libraries: [
            {
              libraryName: 'Footage',
              entryCount: 1,
              totalByteLength: 12,
            },
          ],
        },
      }),
    ).toMatchObject({ status: 'planned', plan: { snapshotId: 'snapshot-a' } });

    expect(
      parseDesktopProjectPortabilityProgressEvent({
        sequence: 1,
        identity,
        progress: {
          snapshotId: 'snapshot-a',
          workspaceId: 'workspace-a',
          requirementFingerprint: 'requirements:abc',
          status: 'running',
          completedEntryCount: 1,
          totalEntryCount: 2,
          completedByteLength: 12,
          totalByteLength: 24,
        },
      }),
    ).toMatchObject({ sequence: 1, progress: { status: 'running' } });
  });

  it('rejects path-like identities and extra execute fields', () => {
    expect(() =>
      parseDesktopProjectPortabilityExecuteRequest({
        requestId: 'request-a',
        identity: { ...identity, workspaceId: '/absolute/workspace' },
        snapshotId: 'snapshot-a',
        expectedOperationFingerprint: 'sha256:abc',
      }),
    ).toThrow('Workspace identity is invalid');
    expect(() =>
      parseDesktopProjectPortabilityExecuteRequest({
        requestId: 'request-a',
        identity,
        snapshotId: 'snapshot-a',
        expectedOperationFingerprint: 'sha256:abc',
        destinationPath: '/Volumes/Export/Portable',
      }),
    ).toThrow('unsupported fields');
  });
});
