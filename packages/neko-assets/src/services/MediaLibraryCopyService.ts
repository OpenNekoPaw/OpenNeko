import {
  normalizeWorkspaceContentPath,
  validateWorkspaceLinkedMediaLibraryName,
  type AuthorizedWorkspaceWriter,
  type ContentIoDiagnostic,
  type ContentLocator,
  type ContentReadService,
  type ContentFingerprint,
  type WorkspaceFileContentLocator,
} from '@neko/shared';
import type { WorkspaceLinkedMediaLibraryService } from './WorkspaceLinkedMediaLibraryService';

export interface MediaLibraryCopyRequest {
  readonly source: ContentLocator;
  readonly libraryName: string;
  readonly destinationDirectory: string;
  readonly fileName: string;
  readonly conflict: 'fail-if-exists' | 'replace';
  readonly expectedDestinationFingerprint?: ContentFingerprint;
  readonly maxBytes?: number;
  readonly signal?: AbortSignal;
}

export type MediaLibraryCopyResult =
  | {
      readonly status: 'copied';
      readonly source: ContentLocator;
      readonly destination: WorkspaceFileContentLocator;
      readonly byteLength: number;
      readonly fingerprint?: ContentFingerprint;
    }
  | {
      readonly status: 'unavailable';
      readonly source: ContentLocator;
      readonly destination?: WorkspaceFileContentLocator;
      readonly diagnostic: ContentIoDiagnostic;
    };

export class MediaLibraryCopyService {
  constructor(
    private readonly libraries: Pick<WorkspaceLinkedMediaLibraryService, 'list'>,
    private readonly reader: ContentReadService,
    private readonly writer: AuthorizedWorkspaceWriter,
  ) {}

  async copy(request: MediaLibraryCopyRequest): Promise<MediaLibraryCopyResult> {
    if (request.signal?.aborted) return unavailable(request, 'content-cancelled');
    if (validateWorkspaceLinkedMediaLibraryName(request.libraryName)) {
      return unavailable(request, 'content-unauthorized');
    }
    const library = (await this.libraries.list()).find(
      (candidate) => candidate.name === request.libraryName,
    );
    if (!library || library.availability !== 'available') {
      return unavailable(request, 'content-missing');
    }
    const destination = createDestinationLocator(
      library.workspacePath,
      request.destinationDirectory,
      request.fileName,
    );
    if (!destination) return unavailable(request, 'content-unauthorized');

    const source = await this.reader.read(request.source, {
      ...(request.maxBytes !== undefined ? { maxBytes: request.maxBytes } : {}),
      ...(request.signal ? { signal: request.signal } : {}),
    });
    if (source.status === 'unavailable') {
      return { ...unavailable(request, source.diagnostic.code), destination };
    }
    if (source.offset !== 0) return unavailable(request, 'content-read-failed', destination);

    const written = await this.writer.write(destination, source.bytes, {
      conflict: request.conflict,
      ...(request.expectedDestinationFingerprint
        ? { expectedFingerprint: request.expectedDestinationFingerprint }
        : {}),
      ...(request.maxBytes !== undefined ? { maxBytes: request.maxBytes } : {}),
      ...(request.signal ? { signal: request.signal } : {}),
    });
    if (written.status === 'unavailable') {
      return { ...unavailable(request, written.diagnostic.code), destination };
    }
    return {
      status: 'copied',
      source: request.source,
      destination,
      byteLength: written.byteLength,
      ...(written.fingerprint ? { fingerprint: written.fingerprint } : {}),
    };
  }
}

function createDestinationLocator(
  libraryPath: string,
  destinationDirectory: string,
  fileName: string,
): WorkspaceFileContentLocator | undefined {
  if (
    !fileName ||
    fileName !== fileName.normalize('NFC') ||
    fileName === '.' ||
    fileName === '..' ||
    fileName.includes('/') ||
    fileName.includes('\\')
  ) {
    return undefined;
  }
  const normalizedDirectory = normalizeWorkspaceContentPath(destinationDirectory);
  if (
    normalizedDirectory !== destinationDirectory ||
    (destinationDirectory !== libraryPath && !destinationDirectory.startsWith(`${libraryPath}/`))
  ) {
    return undefined;
  }
  const path = normalizeWorkspaceContentPath(`${destinationDirectory}/${fileName}`);
  return path ? { kind: 'workspace-file', path } : undefined;
}

function unavailable(
  request: MediaLibraryCopyRequest,
  code: ContentIoDiagnostic['code'],
  destination?: WorkspaceFileContentLocator,
): Extract<MediaLibraryCopyResult, { status: 'unavailable' }> {
  return {
    status: 'unavailable',
    source: request.source,
    ...(destination ? { destination } : {}),
    diagnostic: { code },
  };
}
