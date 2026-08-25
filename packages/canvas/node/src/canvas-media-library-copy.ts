import {
  type ContentIoDiagnostic,
  type ContentLocator,
  type ContentReadService,
  type WorkspaceFileContentLocator,
} from '@neko/content-domain';
import {
  isCanvasMediaLibraryCopyRequest,
  type CanvasMediaLibraryCopyRequest,
} from '@neko/canvas-domain';
import type { CanvasHostRuntimeIdentity } from '@neko/canvas-domain';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import {
  copyDesktopGlobalMediaLibraryContent,
  createProjectContentReadService,
  listGlobalMediaLibraryConnections,
  ProjectMediaLibraryBindingRepository,
  resolveGlobalMediaLibraryTarget,
  type GlobalMediaLibraryCopyResult,
} from '@neko/assets-node';

export async function listAvailableProjectMediaLibraryDestinations(input: {
  readonly projectId: string;
  readonly workspace: AssetWorkspaceResolution;
  readonly globalMediaLibraryRoot: string;
}): Promise<readonly { readonly libraryName: string; readonly targetRoot: string }[]> {
  const bindingResult = await new ProjectMediaLibraryBindingRepository(
    input.workspace.workspacePath,
    input.projectId,
  ).list();
  return (
    await Promise.all(
      bindingResult.bindings.map(async (binding) => {
        try {
          return {
            libraryName: binding.libraryName,
            targetRoot: await resolveGlobalMediaLibraryTarget({
              mediaLibraryRoot: input.globalMediaLibraryRoot,
              libraryId: binding.connectionId,
            }),
          };
        } catch {
          return undefined;
        }
      }),
    )
  ).filter(
    (destination): destination is { readonly libraryName: string; readonly targetRoot: string } =>
      destination !== undefined,
  );
}

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
      readonly createReader?: (input: {
        readonly projectId: string;
        readonly workspaceRoot: string;
        readonly globalMediaLibraryRoot: string;
      }) => ContentReadService;
    },
  ) {}

  async resolveAvailability(
    projectId: string,
    workspace: AssetWorkspaceResolution,
  ): Promise<{
    readonly projectLinked: boolean;
    readonly global: boolean;
  }> {
    const [projectBindings, globalLibraries] = await Promise.all([
      new ProjectMediaLibraryBindingRepository(workspace.workspacePath, projectId).list(),
      listGlobalMediaLibraryConnections(this.options.globalMediaLibraryRoot),
    ]);
    const availableConnectionIds = new Set(
      globalLibraries
        .filter((library) => library.availability === 'available')
        .map((library) => library.libraryId),
    );
    return {
      projectLinked: projectBindings.bindings.some((binding) =>
        availableConnectionIds.has(binding.connectionId),
      ),
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
        'invalid-request',
        'Canvas Media Library copy requires an explicit project-linked or global destination.',
      );
    }
    assertRequestIdentity(input.runtimeIdentity, input.request);
    const reader =
      this.options.createReader?.({
        projectId: input.runtimeIdentity.projectId,
        workspaceRoot: input.workspace.workspacePath,
        globalMediaLibraryRoot: this.options.globalMediaLibraryRoot,
      }) ??
      createProjectContentReadService({
        projectId: input.runtimeIdentity.projectId,
        workspaceRoot: input.workspace.workspacePath,
        globalMediaLibraryRoot: this.options.globalMediaLibraryRoot,
      });
    if (input.request.kind === 'copy-to-project-media-library') {
      const binding = await new ProjectMediaLibraryBindingRepository(
        input.workspace.workspacePath,
        input.runtimeIdentity.projectId,
      ).read(input.request.libraryName);
      if (binding.status !== 'available') {
        return unavailable(input.request.source, 'content-unauthorized');
      }
      return mapProjectResult(
        input.request.libraryName,
        await copyDesktopGlobalMediaLibraryContent({
          mediaLibraryRoot: this.options.globalMediaLibraryRoot,
          globalLibraryId: binding.binding.connectionId,
          source: input.request.source,
          destinationDirectory: projectDestinationDirectory(input.request),
          fileName: input.request.fileName,
          conflict: input.request.conflictPolicy,
          reader,
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
    readonly code: 'invalid-request' | 'canvas-media-library-identity-mismatch',
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
  return request.destinationDirectory;
}

function mapProjectResult(
  libraryName: string,
  result: GlobalMediaLibraryCopyResult,
): CanvasMediaLibraryCopyResult {
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
    destination: {
      file: {
        authority: 'workspace',
        path: `neko/assets/${libraryName}/${result.entryId}`,
      },
    },
    byteLength: result.byteLength,
  };
}

function unavailable(
  source: ContentLocator,
  code: ContentIoDiagnostic['code'],
): CanvasMediaLibraryCopyResult {
  return { status: 'unavailable', source, diagnostic: { code } };
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
