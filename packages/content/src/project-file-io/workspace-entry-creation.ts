import { isPortablePathSegment } from '@neko/shared/path';
import {
  normalizeWorkspaceContentPath,
  type AuthorizedWorkspaceWriter,
  type ContentIoDiagnostic,
  type WorkspaceFileContentLocator,
} from '../contracts';

export type WorkspaceEntryKind = 'file' | 'directory';

export interface WorkspaceEntryCreateRequest {
  readonly kind: WorkspaceEntryKind;
  readonly targetDirectory: string;
  readonly name: string;
}

export type WorkspaceEntryCreateResult =
  | {
      readonly status: 'created';
      readonly kind: WorkspaceEntryKind;
      readonly path: string;
    }
  | {
      readonly status: 'unavailable';
      readonly kind: WorkspaceEntryKind;
      readonly path: string;
      readonly diagnostic: WorkspaceEntryCreationDiagnostic;
    };

export type WorkspaceEntryCreationDiagnostic =
  | ContentIoDiagnostic
  | {
      readonly code: 'reserved-creative-document-extension';
      readonly requiredKind: 'canvas' | 'cut';
    };

export type WorkspaceDirectoryCreateResult =
  | { readonly status: 'created'; readonly path: string }
  | {
      readonly status: 'unavailable';
      readonly path: string;
      readonly diagnostic: ContentIoDiagnostic;
    };

export interface AuthorizedWorkspaceDirectoryCreator {
  create(path: string): Promise<WorkspaceDirectoryCreateResult>;
}

export interface WorkspaceEntryCreationServiceOptions {
  readonly writer: AuthorizedWorkspaceWriter;
  readonly directoryCreator: AuthorizedWorkspaceDirectoryCreator;
}

export class WorkspaceEntryContractError extends Error {
  constructor(
    readonly code: 'invalid-workspace-entry-create-request',
    message: string,
  ) {
    super(message);
    this.name = 'WorkspaceEntryContractError';
  }
}

export class WorkspaceEntryCreationService {
  constructor(private readonly options: WorkspaceEntryCreationServiceOptions) {}

  async create(value: WorkspaceEntryCreateRequest | unknown): Promise<WorkspaceEntryCreateResult> {
    const request = parseWorkspaceEntryCreateRequest(value);
    const entryPath = request.targetDirectory
      ? `${request.targetDirectory}/${request.name}`
      : request.name;

    if (request.kind === 'directory') {
      const result = await this.options.directoryCreator.create(entryPath);
      return result.status === 'created'
        ? { status: 'created', kind: request.kind, path: result.path }
        : {
            status: 'unavailable',
            kind: request.kind,
            path: result.path,
            diagnostic: result.diagnostic,
          };
    }

    const requiredKind = requiredCreativeDocumentKind(request.name);
    if (requiredKind) {
      return {
        status: 'unavailable',
        kind: request.kind,
        path: entryPath,
        diagnostic: { code: 'reserved-creative-document-extension', requiredKind },
      };
    }
    const locator: WorkspaceFileContentLocator = {
      kind: 'workspace-file',
      path: entryPath,
    };
    const result = await this.options.writer.write(locator, new Uint8Array(), {
      conflict: 'fail-if-exists',
      maxBytes: 1,
    });
    return result.status === 'written'
      ? { status: 'created', kind: request.kind, path: result.locator.path }
      : {
          status: 'unavailable',
          kind: request.kind,
          path: result.locator.path,
          diagnostic: result.diagnostic,
        };
  }
}

export function parseWorkspaceEntryCreateRequest(value: unknown): WorkspaceEntryCreateRequest {
  if (!isRecord(value) || !hasOnlyKeys(value, ['kind', 'targetDirectory', 'name'])) {
    throw invalidRequest('Workspace entry create request must contain only canonical fields.');
  }
  if (value['kind'] !== 'file' && value['kind'] !== 'directory') {
    throw invalidRequest('Workspace entry kind must be file or directory.');
  }
  if (typeof value['targetDirectory'] !== 'string') {
    throw invalidRequest('Workspace entry target directory is required.');
  }
  const targetDirectory = value['targetDirectory'];
  if (
    targetDirectory !== '' &&
    normalizeWorkspaceContentPath(targetDirectory) !== targetDirectory
  ) {
    throw invalidRequest('Workspace entry target directory must be canonical and relative.');
  }
  if (typeof value['name'] !== 'string') {
    throw invalidRequest('Workspace entry name is required.');
  }
  const name = value['name'].normalize('NFC');
  if (!isPortablePathSegment(name)) {
    throw invalidRequest('Workspace entry name must be one visible portable path segment.');
  }
  return { kind: value['kind'], targetDirectory, name };
}

export function hasReservedCreativeDocumentExtension(name: string): boolean {
  return requiredCreativeDocumentKind(name) !== undefined;
}

export function requiredCreativeDocumentKind(name: string): 'canvas' | 'cut' | undefined {
  const normalized = name.normalize('NFC').toLocaleLowerCase('en-US');
  if (normalized.endsWith('.nkc')) return 'canvas';
  if (normalized.endsWith('.otio')) return 'cut';
  return undefined;
}

function invalidRequest(message: string): WorkspaceEntryContractError {
  return new WorkspaceEntryContractError('invalid-workspace-entry-create-request', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}
