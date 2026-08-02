import {
  createNodeHostContentReadService,
  NodeAuthorizedWorkspaceWriter,
} from '@neko/content/node';
import { listWorkspaceLinkedMediaLibraries } from '@neko-assets/node';
import {
  type ContentIoDiagnostic,
  type ContentLocator,
  type ContentReadService,
  type WorkspaceFileContentLocator,
} from '@neko/content';
import {
  isCanvasMediaLibraryCopyRequest,
  type CanvasMediaLibraryCopyRequest,
} from '@neko-canvas/domain';
import type { CanvasHostRuntimeIdentity } from '@neko-canvas/domain';
import {
  MediaLibraryCopyService,
  type MediaLibraryCopyResult,
} from '@neko-assets/domain/media-library-copy';
import type { AssetWorkspaceResolution } from '@neko-assets/domain/contracts';
import {
  copyDesktopGlobalMediaLibraryContent,
  listGlobalMediaLibraryConnections,
  type GlobalMediaLibraryCopyResult,
} from '@neko-assets/node';

export type CanvasMediaLibraryCopyResult =
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

export class CanvasMediaLibraryCopyService {
  constructor(
    private readonly options: {
      readonly globalMediaLibraryRoot: string;
      readonly createReader?: (workspaceRoot: string) => ContentReadService;
    },
  ) {}

  async resolveAvailability(workspace: AssetWorkspaceResolution): Promise<{
    readonly projectLinked: boolean;
    readonly global: boolean;
  }> {
    const [projectLibraries, globalLibraries] = await Promise.all([
      listWorkspaceLinkedMediaLibraries(workspace.workspacePath),
      listGlobalMediaLibraryConnections(this.options.globalMediaLibraryRoot),
    ]);
    return {
      projectLinked: projectLibraries.some((library) => library.availability === 'available'),
      global: globalLibraries.some((library) => library.availability === 'available'),
    };
  }

  async copy(input: {
    readonly runtimeIdentity: CanvasHostRuntimeIdentity;
    readonly workspace: AssetWorkspaceResolution;
    readonly request: CanvasMediaLibraryCopyRequest | unknown;
  }): Promise<CanvasMediaLibraryCopyResult> {
    if (!isCanvasMediaLibraryCopyRequest(input.request)) {
      throw new CanvasMediaLibraryCopyContractError(
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

class CanvasMediaLibraryCopyContractError extends Error {
  constructor(
    readonly code: 'migration-required' | 'canvas-media-library-identity-mismatch',
    message: string,
  ) {
    super(message);
    this.name = 'CanvasMediaLibraryCopyContractError';
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
    throw new CanvasMediaLibraryCopyContractError(
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

function mapProjectResult(result: MediaLibraryCopyResult): CanvasMediaLibraryCopyResult {
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

function mapGlobalResult(result: GlobalMediaLibraryCopyResult): CanvasMediaLibraryCopyResult {
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
