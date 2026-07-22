import {
  validateWorkspaceLinkedMediaLibraryName,
  type AuthorizedWorkspaceDeleter,
  type ContentFingerprint,
  type ContentIoDiagnostic,
  type WorkspaceFileContentLocator,
} from '@neko/shared';
import type { WorkspaceLinkedMediaLibraryService } from './WorkspaceLinkedMediaLibraryService';

export interface MediaLibraryDeleteRequest {
  readonly libraryName: string;
  readonly locator: WorkspaceFileContentLocator;
  readonly expectedFingerprint: ContentFingerprint;
  readonly signal?: AbortSignal;
}

export type MediaLibraryDeleteResult =
  | {
      readonly status: 'deleted';
      readonly locator: WorkspaceFileContentLocator;
    }
  | {
      readonly status: 'unavailable';
      readonly locator: WorkspaceFileContentLocator;
      readonly diagnostic: ContentIoDiagnostic;
    };

export class MediaLibraryDeleteService {
  constructor(
    private readonly libraries: Pick<WorkspaceLinkedMediaLibraryService, 'list'>,
    private readonly deleter: AuthorizedWorkspaceDeleter,
  ) {}

  async delete(request: MediaLibraryDeleteRequest): Promise<MediaLibraryDeleteResult> {
    if (request.signal?.aborted) return unavailable(request.locator, 'content-cancelled');
    if (validateWorkspaceLinkedMediaLibraryName(request.libraryName)) {
      return unavailable(request.locator, 'content-unauthorized');
    }
    const library = (await this.libraries.list()).find(
      (candidate) => candidate.name === request.libraryName,
    );
    if (!library || library.availability !== 'available') {
      return unavailable(request.locator, 'content-missing');
    }
    if (!isFileInsideLibrary(request.locator.path, library.workspacePath)) {
      return unavailable(request.locator, 'content-unauthorized');
    }

    return this.deleter.delete(request.locator, {
      expectedFingerprint: request.expectedFingerprint,
      ...(request.signal ? { signal: request.signal } : {}),
    });
  }
}

function isFileInsideLibrary(locatorPath: string, libraryPath: string): boolean {
  return locatorPath.startsWith(`${libraryPath}/`) && locatorPath.length > libraryPath.length + 1;
}

function unavailable(
  locator: WorkspaceFileContentLocator,
  code: ContentIoDiagnostic['code'],
): Extract<MediaLibraryDeleteResult, { status: 'unavailable' }> {
  return { status: 'unavailable', locator, diagnostic: { code } };
}
