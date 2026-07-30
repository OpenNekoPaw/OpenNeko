import {
  createNodeHostContentReadService,
  NodeAuthorizedWorkspaceWriter,
} from '@neko/shared/content-access';
import { listWorkspaceLinkedMediaLibraries } from '@neko/shared/node/workspace-linked-media-libraries';
import {
  isCanvasMediaLibraryCopyRequest,
  type CanvasMediaLibraryCopyRequest,
  type ContentIoDiagnostic,
  type ContentLocator,
  type ContentReadService,
  type WorkspaceFileContentLocator,
} from '@neko/shared';
import type { CanvasHostRuntimeIdentity } from '@neko-canvas/domain';
import {
  MediaLibraryCopyService,
  type MediaLibraryCopyResult,
} from 'neko-assets/media-library-copy';
import type { DesktopWorkspaceResolution } from './desktop-workspace-registry';
import {
  copyDesktopGlobalMediaLibraryContent,
  listDesktopGlobalMediaLibraryConnections,
  type DesktopGlobalMediaLibraryCopyResult,
} from './desktop-global-media-library-files';

export type DesktopCanvasMediaLibraryCopyResult =
  | {
      readonly status: 'copied';
      readonly destinationKind: 'project-media-library';
      readonly source: ContentLocator;
      readonly destination: WorkspaceFileContentLocator;
      readonly byteLength: number;
    }
  | {
      readonly status: 'copied';
      readonly destinationKind: 'global-media-library';
      readonly source: ContentLocator;
      readonly globalLibraryId: string;
      readonly entryId: string;
      readonly byteLength: number;
    }
  | {
      readonly status: 'unavailable';
      readonly source: ContentLocator;
      readonly diagnostic: ContentIoDiagnostic;
    };

export class DesktopCanvasMediaLibraryCopyService {
  constructor(
    private readonly options: {
      readonly globalMediaLibraryRoot: string;
      readonly createReader?: (workspaceRoot: string) => ContentReadService;
    },
  ) {}

  async resolveAvailability(workspace: DesktopWorkspaceResolution): Promise<{
    readonly projectLinked: boolean;
    readonly global: boolean;
  }> {
    const [projectLibraries, globalLibraries] = await Promise.all([
      listWorkspaceLinkedMediaLibraries(workspace.workspacePath),
      listDesktopGlobalMediaLibraryConnections(this.options.globalMediaLibraryRoot),
    ]);
    return {
      projectLinked: projectLibraries.some((library) => library.availability === 'available'),
      global: globalLibraries.some((library) => library.availability === 'available'),
    };
  }

  async copy(input: {
    readonly runtimeIdentity: CanvasHostRuntimeIdentity;
    readonly workspace: DesktopWorkspaceResolution;
    readonly request: CanvasMediaLibraryCopyRequest | unknown;
  }): Promise<DesktopCanvasMediaLibraryCopyResult> {
    if (!isCanvasMediaLibraryCopyRequest(input.request)) {
      throw new DesktopCanvasMediaLibraryCopyContractError(
        'migration-required',
        'Canvas Media Library copy requires an explicit project-linked or global destination.',
      );
    }
    assertRequestIdentity(input.runtimeIdentity, input.request);
    const reader =
      this.options.createReader?.(input.workspace.workspacePath) ??
      createNodeHostContentReadService({ workspaceRoot: input.workspace.workspacePath });
    if (input.request.kind === 'copy-to-project-media-library') {
      return mapProjectResult(
        await new MediaLibraryCopyService(
          {
            list: () => listWorkspaceLinkedMediaLibraries(input.workspace.workspacePath),
          },
          reader,
          new NodeAuthorizedWorkspaceWriter({
            workspaceRoot: input.workspace.workspacePath,
          }),
        ).copy({
          source: input.request.source,
          libraryName: input.request.libraryName,
          destinationDirectory: projectDestinationDirectory(input.request),
          fileName: input.request.fileName,
          conflict: input.request.conflictPolicy,
        }),
      );
    }
    return mapGlobalResult(
      await copyDesktopGlobalMediaLibraryContent({
        mediaLibraryRoot: this.options.globalMediaLibraryRoot,
        globalLibraryId: input.request.globalLibraryId,
        source: input.request.source,
        destinationDirectory: input.request.destinationDirectory,
        fileName: input.request.fileName,
        conflict: input.request.conflictPolicy,
        reader,
      }),
    );
  }
}

class DesktopCanvasMediaLibraryCopyContractError extends Error {
  constructor(
    readonly code: 'migration-required' | 'canvas-media-library-identity-mismatch',
    message: string,
  ) {
    super(message);
    this.name = 'DesktopCanvasMediaLibraryCopyContractError';
  }
}

function assertRequestIdentity(
  runtimeIdentity: CanvasHostRuntimeIdentity,
  request: CanvasMediaLibraryCopyRequest,
): void {
  if (
    request.identity.projectId !== runtimeIdentity.projectId ||
    request.identity.canvasId !== runtimeIdentity.documentId ||
    request.identity.canvasSessionId !== runtimeIdentity.sessionId
  ) {
    throw new DesktopCanvasMediaLibraryCopyContractError(
      'canvas-media-library-identity-mismatch',
      'Canvas Media Library copy identity does not match the active Canvas session.',
    );
  }
}

function projectDestinationDirectory(
  request: Extract<CanvasMediaLibraryCopyRequest, { kind: 'copy-to-project-media-library' }>,
): string {
  const root = `neko/assets/${request.libraryName}`;
  return request.destinationDirectory ? `${root}/${request.destinationDirectory}` : root;
}

function mapProjectResult(result: MediaLibraryCopyResult): DesktopCanvasMediaLibraryCopyResult {
  if (result.status === 'unavailable') {
    return {
      status: 'unavailable',
      source: result.source,
      diagnostic: result.diagnostic,
    };
  }
  return {
    status: 'copied',
    destinationKind: 'project-media-library',
    source: result.source,
    destination: result.destination,
    byteLength: result.byteLength,
  };
}

function mapGlobalResult(
  result: DesktopGlobalMediaLibraryCopyResult,
): DesktopCanvasMediaLibraryCopyResult {
  if (result.status === 'unavailable') {
    return {
      status: 'unavailable',
      source: result.source,
      diagnostic: result.diagnostic,
    };
  }
  return {
    status: 'copied',
    destinationKind: 'global-media-library',
    source: result.source,
    globalLibraryId: result.globalLibraryId,
    entryId: result.entryId,
    byteLength: result.byteLength,
  };
}
