import { createHash } from 'node:crypto';
import type {
  WorkspaceMediaLibraryPortabilityProjection,
  WorkspaceMediaLibraryStatus,
} from '@neko/assets-domain/contracts';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import { ProjectMediaLibraryAvailabilityService } from './project-media-library-availability-service';
import { ProjectMediaLibraryBindingRepository } from './project-media-library-binding-repository';
import {
  listGlobalMediaLibraryConnections,
  type GlobalMediaLibraryConnection,
} from './global-media-library-files';
import {
  readProjectContentReferences,
  type ProjectContentReferenceSnapshot,
} from './project-content-reference-readers';

export interface ProjectMediaLibraryPortabilityInspection {
  readonly references: ProjectContentReferenceSnapshot;
  readonly operationFingerprint: string;
  readonly portability: WorkspaceMediaLibraryPortabilityProjection;
  readonly nestedLinkEscapeCount: number;
}

export async function inspectProjectMediaLibraryPortability(input: {
  readonly projectId: string;
  readonly workspace: AssetWorkspaceResolution;
  readonly globalMediaLibraryRoot: string;
}): Promise<ProjectMediaLibraryPortabilityInspection> {
  const references = await readProjectContentReferences({
    workspacePath: input.workspace.workspacePath,
    projectId: input.projectId,
  });
  const [availability, bindings, connections] = await Promise.all([
    new ProjectMediaLibraryAvailabilityService({
      projectId: input.projectId,
      workspaceRoot: input.workspace.workspacePath,
      globalMediaLibraryRoot: input.globalMediaLibraryRoot,
      readReferences: async () => references,
    }).inspect(),
    new ProjectMediaLibraryBindingRepository(input.workspace.workspacePath, input.projectId).list(),
    listGlobalMediaLibraryConnections(input.globalMediaLibraryRoot),
  ]);
  const operationFingerprint = createOperationFingerprint({
    requirementFingerprint: references.requirements.fingerprint,
    libraries: availability.libraries,
    bindings,
    connections,
  });
  const statuses = availability.libraries.map((library): WorkspaceMediaLibraryStatus => {
    const referenceCount =
      availability.requirements.find((candidate) => candidate.libraryName === library.libraryName)
        ?.referenceCount ?? 0;
    const missingCount =
      availability.unavailableRelativePaths.find(
        (candidate) => candidate.libraryName === library.libraryName,
      )?.relativePaths.length ?? 0;
    const state = projectPortabilityState(library.state);
    return {
      libraryName: library.libraryName,
      state,
      referenceCount,
      missingCount,
      operationFingerprint,
      ...(library.diagnostic
        ? {
            diagnostic: {
              code: projectPortabilityDiagnosticCode(library.state),
              severity: 'error' as const,
              message: library.diagnostic.message,
              missingCount,
            },
          }
        : {}),
    };
  });
  return {
    references,
    operationFingerprint,
    portability: {
      state:
        references.requirements.coverage === 'incomplete'
          ? 'coverage-incomplete'
          : statuses.some((status) => status.referenceCount > 0 && status.state !== 'available')
            ? 'sync-requires-relink'
            : 'linked-ready',
      requirementFingerprint: references.requirements.fingerprint,
      libraries: statuses,
    },
    nestedLinkEscapeCount: availability.nestedLinkEscapes.reduce(
      (count, entry) => count + entry.relativePaths.length,
      0,
    ),
  };
}

function createOperationFingerprint(input: {
  readonly requirementFingerprint: string;
  readonly libraries: readonly {
    readonly libraryName: string;
    readonly state: string;
    readonly requiredRelativePaths: readonly string[];
  }[];
  readonly bindings: Awaited<ReturnType<ProjectMediaLibraryBindingRepository['list']>>;
  readonly connections: readonly GlobalMediaLibraryConnection[];
}): string {
  const relevantConnections = new Set(
    input.bindings.bindings.map((binding) => binding.connectionId),
  );
  const digest = createHash('sha256')
    .update(
      JSON.stringify([
        input.requirementFingerprint,
        input.libraries.map((library) => [
          library.libraryName,
          library.state,
          library.requiredRelativePaths,
        ]),
        input.bindings.bindings.map((binding) => [binding.libraryName, binding.bindingFingerprint]),
        input.bindings.diagnostics.map((diagnostic) => [diagnostic.libraryName, diagnostic.code]),
        input.connections
          .filter((connection) => relevantConnections.has(connection.libraryId))
          .map((connection) => [
            connection.libraryId,
            connection.locationKind,
            connection.availability,
            connection.modifiedAt,
          ]),
      ]),
    )
    .digest('hex');
  return `sha256:${digest}`;
}

function projectPortabilityState(
  state:
    | 'available'
    | 'required-unlinked'
    | 'connection-missing'
    | 'target-unavailable'
    | 'content-incomplete'
    | 'binding-invalid'
    | 'entry-conflict'
    | 'unreferenced-local-binding',
): WorkspaceMediaLibraryStatus['state'] {
  switch (state) {
    case 'available':
      return 'available';
    case 'required-unlinked':
      return 'required-unlinked';
    case 'connection-missing':
      return 'global-connection-missing';
    case 'target-unavailable':
      return 'target-unavailable';
    case 'content-incomplete':
      return 'content-incomplete';
    case 'binding-invalid':
    case 'entry-conflict':
      return 'entry-conflict';
    case 'unreferenced-local-binding':
      return 'unreferenced-linked';
  }
}

function projectPortabilityDiagnosticCode(state: Parameters<typeof projectPortabilityState>[0]) {
  switch (state) {
    case 'required-unlinked':
      return 'global-connection-missing' as const;
    case 'connection-missing':
      return 'global-connection-missing' as const;
    case 'target-unavailable':
      return 'target-unavailable' as const;
    case 'content-incomplete':
      return 'content-incomplete' as const;
    case 'binding-invalid':
    case 'entry-conflict':
      return 'entry-conflict' as const;
    case 'available':
    case 'unreferenced-local-binding':
      throw new Error('Available Media Library state cannot produce an error diagnostic.');
  }
}
