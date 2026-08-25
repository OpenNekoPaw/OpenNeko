export const CHARACTER_AVATAR_HOST_CHANNEL = 'neko:character:avatar' as const;

export type CharacterAvatarHostRequest =
  | {
      readonly requestId: string;
      readonly operation: 'open';
      readonly rendererSessionId: string;
      readonly workbenchInstanceId: string;
      readonly characterRunId: string;
      readonly representationId: string;
      readonly surface: 'avatar' | 'portrait';
    }
  | {
      readonly requestId: string;
      readonly operation: 'release';
      readonly rendererSessionId: string;
      readonly avatarResourceLeaseId: string;
    };

interface CharacterAvatarResourceDescriptorBase {
  readonly avatarResourceLeaseId: string;
  readonly characterRunId: string;
  readonly representationId: string;
  readonly url: string;
  readonly displayName: string;
  readonly byteLength: number;
  readonly sourceFingerprint: string;
}

export type CharacterAvatarResourceDescriptor = CharacterAvatarResourceDescriptorBase &
  (
    | { readonly kind: 'vrm'; readonly mediaType: 'model/gltf-binary' }
    | {
        readonly kind: 'portrait';
        readonly mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
      }
  );

export type CharacterAvatarHostDiagnosticCode =
  | 'character-avatar-scene-mismatch'
  | 'character-avatar-run-unavailable'
  | 'character-avatar-representation-unavailable'
  | 'character-avatar-renderer-unavailable'
  | 'character-avatar-resource-unavailable';

export type CharacterAvatarHostResult =
  | {
      readonly requestId: string;
      readonly status: 'ready';
      readonly descriptor: CharacterAvatarResourceDescriptor;
    }
  | {
      readonly requestId: string;
      readonly status: 'unavailable';
      readonly diagnostic: {
        readonly code: CharacterAvatarHostDiagnosticCode;
        readonly message: string;
      };
    }
  | {
      readonly requestId: string;
      readonly status: 'released';
      readonly avatarResourceLeaseId: string;
    };

export interface OpenNekoDesktopCharacterAvatarBridge {
  readonly characterAvatar: {
    openSurface(input: {
      readonly workbenchInstanceId: string;
      readonly characterRunId: string;
      readonly representationId: string;
      readonly surface: 'avatar' | 'portrait';
    }): Promise<CharacterAvatarHostResult>;
    releaseSurface(avatarResourceLeaseId: string): Promise<void>;
  };
}

export function createCharacterAvatarOpenRequest(input: {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly workbenchInstanceId: string;
  readonly characterRunId: string;
  readonly representationId: string;
  readonly surface: 'avatar' | 'portrait';
}): Extract<CharacterAvatarHostRequest, { readonly operation: 'open' }> {
  return parseCharacterAvatarHostRequest({ ...input, operation: 'open' }) as Extract<
    CharacterAvatarHostRequest,
    { readonly operation: 'open' }
  >;
}

export function createCharacterAvatarReleaseRequest(input: {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly avatarResourceLeaseId: string;
}): Extract<CharacterAvatarHostRequest, { readonly operation: 'release' }> {
  return parseCharacterAvatarHostRequest({ ...input, operation: 'release' }) as Extract<
    CharacterAvatarHostRequest,
    { readonly operation: 'release' }
  >;
}

export function parseCharacterAvatarHostRequest(value: unknown): CharacterAvatarHostRequest {
  const record = recordValue(value, 'Character Avatar request');
  const operation = record['operation'];
  if (operation === 'open') {
    exactKeys(
      record,
      [
        'requestId',
        'operation',
        'rendererSessionId',
        'workbenchInstanceId',
        'characterRunId',
        'representationId',
        'surface',
      ],
      'Character Avatar open request',
    );
    return {
      requestId: identity(record['requestId'], 'request'),
      operation,
      rendererSessionId: identity(record['rendererSessionId'], 'renderer session'),
      workbenchInstanceId: identity(record['workbenchInstanceId'], 'Workbench instance'),
      characterRunId: identity(record['characterRunId'], 'CharacterRun'),
      representationId: identity(record['representationId'], 'representation'),
      surface: characterSurface(record['surface']),
    };
  }
  if (operation === 'release') {
    exactKeys(
      record,
      ['requestId', 'operation', 'rendererSessionId', 'avatarResourceLeaseId'],
      'Character Avatar release request',
    );
    return {
      requestId: identity(record['requestId'], 'request'),
      operation,
      rendererSessionId: identity(record['rendererSessionId'], 'renderer session'),
      avatarResourceLeaseId: identity(record['avatarResourceLeaseId'], 'Avatar resource lease'),
    };
  }
  throw new Error(`Unknown Character Avatar operation '${String(operation)}'.`);
}

export function parseCharacterAvatarHostResult(
  value: unknown,
  requestId: string,
): CharacterAvatarHostResult {
  const record = recordValue(value, 'Character Avatar result');
  if (identity(record['requestId'], 'request') !== requestId) {
    throw new Error('Character Avatar response request identity does not match.');
  }
  if (record['status'] === 'ready') {
    exactKeys(record, ['requestId', 'status', 'descriptor'], 'Character Avatar ready result');
    return { requestId, status: 'ready', descriptor: parseDescriptor(record['descriptor']) };
  }
  if (record['status'] === 'unavailable') {
    exactKeys(record, ['requestId', 'status', 'diagnostic'], 'Character Avatar unavailable result');
    const diagnostic = recordValue(record['diagnostic'], 'Character Avatar diagnostic');
    exactKeys(diagnostic, ['code', 'message'], 'Character Avatar diagnostic');
    const code = diagnostic['code'];
    const codes: readonly CharacterAvatarHostDiagnosticCode[] = [
      'character-avatar-scene-mismatch',
      'character-avatar-run-unavailable',
      'character-avatar-representation-unavailable',
      'character-avatar-renderer-unavailable',
      'character-avatar-resource-unavailable',
    ];
    if (!codes.includes(code as CharacterAvatarHostDiagnosticCode)) {
      throw new Error(`Unknown Character Avatar diagnostic '${String(code)}'.`);
    }
    return {
      requestId,
      status: 'unavailable',
      diagnostic: {
        code: code as CharacterAvatarHostDiagnosticCode,
        message: identity(diagnostic['message'], 'Character Avatar diagnostic message'),
      },
    };
  }
  if (record['status'] === 'released') {
    exactKeys(
      record,
      ['requestId', 'status', 'avatarResourceLeaseId'],
      'Character Avatar release result',
    );
    return {
      requestId,
      status: 'released',
      avatarResourceLeaseId: identity(record['avatarResourceLeaseId'], 'Avatar resource lease'),
    };
  }
  throw new Error(`Unknown Character Avatar result status '${String(record['status'])}'.`);
}

function parseDescriptor(value: unknown): CharacterAvatarResourceDescriptor {
  const record = recordValue(value, 'Character Avatar descriptor');
  exactKeys(
    record,
    [
      'avatarResourceLeaseId',
      'characterRunId',
      'representationId',
      'kind',
      'url',
      'displayName',
      'mediaType',
      'byteLength',
      'sourceFingerprint',
    ],
    'Character Avatar descriptor',
  );
  const kind = record['kind'];
  const mediaType = record['mediaType'];
  if (!(
    (kind === 'vrm' && mediaType === 'model/gltf-binary') ||
    (kind === 'portrait' &&
      (mediaType === 'image/png' ||
        mediaType === 'image/jpeg' ||
        mediaType === 'image/webp' ||
        mediaType === 'image/gif'))
  )) {
    throw new Error('Character Avatar descriptor kind and media type do not match.');
  }
  const url = identity(record['url'], 'Character Avatar URL');
  if (!url.startsWith('openneko://resource/')) {
    throw new Error('Character Avatar URL must use an authorized OpenNeko resource.');
  }
  const byteLength = record['byteLength'];
  if (!Number.isSafeInteger(byteLength) || (byteLength as number) < 0) {
    throw new Error('Character Avatar byteLength must be a non-negative integer.');
  }
  const base = {
    avatarResourceLeaseId: identity(record['avatarResourceLeaseId'], 'Avatar resource lease'),
    characterRunId: identity(record['characterRunId'], 'CharacterRun'),
    representationId: identity(record['representationId'], 'representation'),
    url,
    displayName: identity(record['displayName'], 'Character Avatar display name'),
    byteLength: byteLength as number,
    sourceFingerprint: identity(record['sourceFingerprint'], 'Character Avatar fingerprint'),
  };
  if (kind === 'vrm') return { ...base, kind, mediaType: 'model/gltf-binary' };
  if (
    mediaType !== 'image/png' &&
    mediaType !== 'image/jpeg' &&
    mediaType !== 'image/webp' &&
    mediaType !== 'image/gif'
  ) {
    throw new Error('Character portrait descriptor requires an image media type.');
  }
  return { ...base, kind: 'portrait', mediaType };
}

function characterSurface(value: unknown): 'avatar' | 'portrait' {
  if (value === 'avatar' || value === 'portrait') return value;
  throw new Error(`Unknown Character Avatar surface '${String(value)}'.`);
}

function recordValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[], label: string): void {
  const allowed = new Set(keys);
  const extras = Object.keys(record).filter((key) => !allowed.has(key));
  if (extras.length > 0)
    throw new Error(`${label} contains unsupported fields: ${extras.join(', ')}.`);
}

function identity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}
