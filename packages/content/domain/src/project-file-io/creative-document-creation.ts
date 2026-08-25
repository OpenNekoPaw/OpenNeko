import { isPortablePathSegment } from '@neko/shared/path';
import {
  normalizeWorkspaceContentPath,
  type AuthorizedWorkspaceWriter,
  type ContentIoDiagnostic,
  type WorkspaceFileContentLocator,
} from '../contracts';

export type CreativeDocumentKind = 'canvas' | 'cut';

export interface CreativeDocumentOwner {
  readonly extension: '.nkc' | '.otio';
  createBytes(name: string): Uint8Array;
  validateBytes(bytes: Uint8Array): boolean;
}

export interface CreativeDocumentCreateRequest {
  readonly kind: CreativeDocumentKind;
  readonly targetDirectory: string;
  readonly name: string;
}

export class CreativeDocumentContractError extends Error {
  constructor(
    readonly code: 'invalid-creative-document-create-request',
    message: string,
  ) {
    super(message);
    this.name = 'CreativeDocumentContractError';
  }
}

export type CreativeDocumentCreateResult =
  | {
      readonly status: 'created';
      readonly kind: CreativeDocumentKind;
      readonly path: string;
    }
  | {
      readonly status: 'unavailable';
      readonly kind: CreativeDocumentKind;
      readonly path: string;
      readonly diagnostic: ContentIoDiagnostic;
    };

export class CreativeDocumentCreationService {
  constructor(
    private readonly options: {
      readonly writer: AuthorizedWorkspaceWriter;
      readonly owners: Readonly<Record<CreativeDocumentKind, CreativeDocumentOwner>>;
    },
  ) {}

  async create(
    value: CreativeDocumentCreateRequest | unknown,
  ): Promise<CreativeDocumentCreateResult> {
    const request = parseCreativeDocumentCreateRequest(value);
    const owner = this.options.owners[request.kind];
    const targetDirectory = requireTargetDirectory(request.targetDirectory);
    const requestedName = requireName(request.name);
    const { fileName, documentName } = resolveDocumentName(requestedName, owner.extension);
    const entryPath = targetDirectory ? `${targetDirectory}/${fileName}` : fileName;
    const bytes = owner.createBytes(documentName);
    if (!owner.validateBytes(bytes)) {
      throw new Error(`${request.kind} document owner produced invalid bytes.`);
    }
    const locator: WorkspaceFileContentLocator = {
      file: { authority: 'workspace', path: entryPath },
    };
    const result = await this.options.writer.write(locator, bytes, {
      conflict: 'fail-if-exists',
    });
    return result.status === 'written'
      ? { status: 'created', kind: request.kind, path: result.locator.file.path }
      : {
          status: 'unavailable',
          kind: request.kind,
          path: result.locator.file.path,
          diagnostic: result.diagnostic,
        };
  }
}

export function parseCreativeDocumentCreateRequest(value: unknown): CreativeDocumentCreateRequest {
  if (!isRecord(value) || !hasOnlyKeys(value, ['kind', 'targetDirectory', 'name'])) {
    throw invalidRequest('Creative document create request must contain only canonical fields.');
  }
  if (value['kind'] !== 'canvas' && value['kind'] !== 'cut') {
    throw invalidRequest('Creative document kind must be canvas or cut.');
  }
  if (typeof value['targetDirectory'] !== 'string') {
    throw invalidRequest('Creative document target directory is required.');
  }
  if (typeof value['name'] !== 'string') {
    throw invalidRequest('Creative document name is required.');
  }
  return {
    kind: value['kind'],
    targetDirectory: requireTargetDirectory(value['targetDirectory']),
    name: requireName(value['name']),
  };
}

function requireTargetDirectory(value: string): string {
  if (value === '') return value;
  if (normalizeWorkspaceContentPath(value) !== value) {
    throw invalidRequest('Creative document target directory must be canonical and relative.');
  }
  return value;
}

function requireName(value: string): string {
  const normalized = value.normalize('NFC');
  if (!isPortablePathSegment(normalized)) {
    throw invalidRequest('Creative document name must be one visible portable path segment.');
  }
  return normalized;
}

function resolveDocumentName(
  requestedName: string,
  extension: CreativeDocumentOwner['extension'],
): { readonly fileName: string; readonly documentName: string } {
  const dot = requestedName.lastIndexOf('.');
  if (dot < 0) return { fileName: `${requestedName}${extension}`, documentName: requestedName };
  const requestedExtension = requestedName.slice(dot).toLocaleLowerCase('en-US');
  if (requestedExtension !== extension) {
    throw invalidRequest(`Creative document name must use ${extension}.`);
  }
  const documentName = requestedName.slice(0, dot);
  if (!documentName) {
    throw invalidRequest('Creative document name is required before its extension.');
  }
  return { fileName: `${documentName}${extension}`, documentName };
}

function invalidRequest(message: string): CreativeDocumentContractError {
  return new CreativeDocumentContractError('invalid-creative-document-create-request', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}
