import { parsePreviewMediaDescriptor, type PreviewMediaDescriptor } from './index.js';

export const AUTHORIZED_PREVIEW_SESSION_VERSION = 1 as const;

export interface AuthorizedPreviewSessionIdentity {
  readonly previewSessionId: string;
  readonly windowId: string;
  readonly owner:
    | {
        readonly kind: 'asset-center';
        readonly assetCenterSessionId: string;
        readonly resourceOwner: 'global-asset-library' | 'media-library';
        readonly itemId: string;
      }
    | {
        readonly kind: 'assistant-scratch';
        readonly assistantSpaceId: string;
        readonly conversationId: string;
        readonly scratchArtifactId: string;
      };
  readonly revision: number;
}

export type AuthorizedPreviewSessionProjection =
  | {
      readonly schemaVersion: typeof AUTHORIZED_PREVIEW_SESSION_VERSION;
      readonly identity: AuthorizedPreviewSessionIdentity;
      readonly status: 'ready';
      readonly descriptor: PreviewMediaDescriptor;
    }
  | {
      readonly schemaVersion: typeof AUTHORIZED_PREVIEW_SESSION_VERSION;
      readonly identity: AuthorizedPreviewSessionIdentity;
      readonly status: 'unavailable';
      readonly diagnostic: AuthorizedPreviewDiagnostic;
    };

export interface AuthorizedPreviewDiagnostic {
  readonly code: 'preview-unsupported-kind' | 'preview-source-unavailable';
  readonly message: string;
}

export interface AuthorizedPreviewSessionRuntime {
  readonly identity: AuthorizedPreviewSessionIdentity;
  getSnapshot(): Promise<AuthorizedPreviewSessionProjection>;
  subscribe(listener: (projection: AuthorizedPreviewSessionProjection) => void): () => void;
}

export function parseAuthorizedPreviewSessionProjection(
  value: unknown,
): AuthorizedPreviewSessionProjection {
  const record = requireRecord(value, 'Authorized Preview projection must be an object.');
  requireExactKeys(
    record,
    ['schemaVersion', 'identity', 'status', 'descriptor', 'diagnostic'],
    'Authorized Preview projection',
  );
  if (record['schemaVersion'] !== AUTHORIZED_PREVIEW_SESSION_VERSION) {
    throw new Error(`Unsupported Authorized Preview version '${String(record['schemaVersion'])}'.`);
  }
  const identity = parseAuthorizedPreviewSessionIdentity(record['identity']);
  if (record['status'] === 'ready') {
    if (record['diagnostic'] !== undefined) {
      throw new Error('Ready Authorized Preview cannot include a diagnostic.');
    }
    const descriptorRecord = requireRecord(
      record['descriptor'],
      'Authorized Preview descriptor must be an object.',
    );
    requireExactKeys(
      descriptorRecord,
      [
        'descriptorId',
        'revision',
        'contentLocator',
        'url',
        'resourceUris',
        'contentKind',
        'mediaType',
        'displayName',
        'byteLength',
      ],
      'Authorized Preview descriptor',
    );
    return {
      schemaVersion: AUTHORIZED_PREVIEW_SESSION_VERSION,
      identity,
      status: 'ready',
      descriptor: parsePreviewMediaDescriptor(descriptorRecord),
    };
  }
  if (record['status'] !== 'unavailable' || record['descriptor'] !== undefined) {
    throw new Error(`Unknown Authorized Preview status '${String(record['status'])}'.`);
  }
  const diagnostic = requireRecord(
    record['diagnostic'],
    'Authorized Preview unavailable diagnostic must be an object.',
  );
  requireExactKeys(diagnostic, ['code', 'message'], 'Authorized Preview diagnostic');
  if (
    diagnostic['code'] !== 'preview-unsupported-kind' &&
    diagnostic['code'] !== 'preview-source-unavailable'
  ) {
    throw new Error('Authorized Preview diagnostic code is invalid.');
  }
  return {
    schemaVersion: AUTHORIZED_PREVIEW_SESSION_VERSION,
    identity,
    status: 'unavailable',
    diagnostic: {
      code: diagnostic['code'],
      message: requireIdentity(diagnostic['message'], 'Authorized Preview diagnostic message'),
    },
  };
}

export function parseAuthorizedPreviewSessionIdentity(
  value: unknown,
): AuthorizedPreviewSessionIdentity {
  const record = requireRecord(value, 'Authorized Preview identity must be an object.');
  requireExactKeys(
    record,
    ['previewSessionId', 'windowId', 'owner', 'revision'],
    'Authorized Preview identity',
  );
  const owner = requireRecord(valueOf(record, 'owner'), 'Authorized Preview owner is required.');
  let parsedOwner: AuthorizedPreviewSessionIdentity['owner'];
  if (owner['kind'] === 'asset-center') {
    requireExactKeys(
      owner,
      ['kind', 'assetCenterSessionId', 'resourceOwner', 'itemId'],
      'Authorized Preview Asset Center owner',
    );
    if (
      owner['resourceOwner'] !== 'global-asset-library' &&
      owner['resourceOwner'] !== 'media-library'
    ) {
      throw new Error('Authorized Preview resource owner is invalid.');
    }
    parsedOwner = {
      kind: 'asset-center',
      assetCenterSessionId: requireIdentity(
        owner['assetCenterSessionId'],
        'Authorized Preview Asset Center session',
      ),
      resourceOwner: owner['resourceOwner'],
      itemId: requireIdentity(owner['itemId'], 'Authorized Preview resource'),
    };
  } else if (owner['kind'] === 'assistant-scratch') {
    requireExactKeys(
      owner,
      ['kind', 'assistantSpaceId', 'conversationId', 'scratchArtifactId'],
      'Authorized Preview Assistant Scratch owner',
    );
    parsedOwner = {
      kind: 'assistant-scratch',
      assistantSpaceId: requireIdentity(owner['assistantSpaceId'], 'Assistant Space'),
      conversationId: requireIdentity(owner['conversationId'], 'Agent Conversation'),
      scratchArtifactId: requireIdentity(owner['scratchArtifactId'], 'Agent Scratch artifact'),
    };
  } else {
    throw new Error(`Unknown Authorized Preview owner '${String(owner['kind'])}'.`);
  }
  return {
    previewSessionId: requireIdentity(record['previewSessionId'], 'Authorized Preview session'),
    windowId: requireIdentity(record['windowId'], 'Authorized Preview Window'),
    owner: parsedOwner,
    revision: requireRevision(record['revision']),
  };
}

function valueOf(record: Readonly<Record<string, unknown>>, key: string): unknown {
  return record[key];
}

function requireRecord(value: unknown, message: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  return value as Readonly<Record<string, unknown>>;
}

function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  owner: string,
): void {
  if (Object.keys(record).some((key) => !keys.includes(key))) {
    throw new Error(`${owner} contains unsupported fields.`);
  }
}

function requireIdentity(value: unknown, owner: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${owner} is required.`);
  return value;
}

function requireRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Authorized Preview revision must be a non-negative integer.');
  }
  return value;
}
