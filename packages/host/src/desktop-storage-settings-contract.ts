export const DESKTOP_STORAGE_SETTINGS_CHANNEL = 'openneko:desktop:storage-settings:execute';

export type DesktopStorageSettingsRequest =
  | { readonly requestId: string; readonly operation: 'get' }
  | { readonly requestId: string; readonly operation: 'open'; readonly entryId: string }
  | { readonly requestId: string; readonly operation: 'select-default-workspace' };

export interface DesktopStorageEntryView {
  readonly id: string;
  readonly kind: 'application-data' | 'project' | 'media-library' | 'default-workspace';
  readonly label: string;
  readonly locator: string;
  readonly bytes?: number;
  readonly diagnostic?: string;
}

export interface DesktopStorageSettingsProjection {
  readonly entries: readonly DesktopStorageEntryView[];
  readonly defaultWorkspaceLocator: string;
}

export interface DesktopStorageSettingsResponse {
  readonly requestId: string;
  readonly status: 'projected' | 'opened' | 'updated' | 'cancelled';
  readonly projection: DesktopStorageSettingsProjection;
}

export interface OpenNekoDesktopStorageSettingsBridge {
  readonly storageSettings: {
    get(): Promise<DesktopStorageSettingsProjection>;
    open(entryId: string): Promise<DesktopStorageSettingsProjection>;
    selectDefaultWorkspace(): Promise<DesktopStorageSettingsResponse>;
  };
}

export function createDesktopStorageSettingsRequest(
  request: DesktopStorageSettingsRequest,
): DesktopStorageSettingsRequest {
  return parseDesktopStorageSettingsRequest(request);
}

export function parseDesktopStorageSettingsRequest(value: unknown): DesktopStorageSettingsRequest {
  const record = requireRecord(value, 'Desktop storage settings request');
  const requestId = requireString(record['requestId'], 'requestId');
  const operation = record['operation'];
  if (operation === 'get' || operation === 'select-default-workspace') {
    requireExactKeys(record, ['requestId', 'operation']);
    return { requestId, operation };
  }
  if (operation === 'open') {
    requireExactKeys(record, ['requestId', 'operation', 'entryId']);
    return { requestId, operation, entryId: requireString(record['entryId'], 'entryId') };
  }
  throw new Error('Desktop storage settings operation is invalid.');
}

export function parseDesktopStorageSettingsResponse(
  value: unknown,
  expectedRequestId: string,
): DesktopStorageSettingsResponse {
  const record = requireRecord(value, 'Desktop storage settings response');
  requireExactKeys(record, ['requestId', 'status', 'projection']);
  const requestId = requireString(record['requestId'], 'requestId');
  if (requestId !== expectedRequestId)
    throw new Error('Desktop storage settings request mismatch.');
  const status = record['status'];
  if (
    status !== 'projected' &&
    status !== 'opened' &&
    status !== 'updated' &&
    status !== 'cancelled'
  ) {
    throw new Error('Desktop storage settings response status is invalid.');
  }
  return {
    requestId,
    status,
    projection: parseDesktopStorageSettingsProjection(record['projection']),
  };
}

export function parseDesktopStorageSettingsProjection(
  value: unknown,
): DesktopStorageSettingsProjection {
  const record = requireRecord(value, 'Desktop storage settings projection');
  requireExactKeys(record, ['entries', 'defaultWorkspaceLocator']);
  if (!Array.isArray(record['entries']))
    throw new Error('Desktop storage entries must be an array.');
  return {
    entries: record['entries'].map((entry) => {
      const item = requireRecord(entry, 'Desktop storage entry');
      requireExactKeys(item, ['id', 'kind', 'label', 'locator', 'bytes', 'diagnostic']);
      const kind = item['kind'];
      if (
        kind !== 'application-data' &&
        kind !== 'project' &&
        kind !== 'media-library' &&
        kind !== 'default-workspace'
      ) {
        throw new Error('Desktop storage entry kind is invalid.');
      }
      const bytes = item['bytes'];
      if (
        bytes !== undefined &&
        (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes < 0)
      ) {
        throw new Error('Desktop storage entry bytes are invalid.');
      }
      const diagnostic = item['diagnostic'];
      if (diagnostic !== undefined && typeof diagnostic !== 'string') {
        throw new Error('Desktop storage diagnostic must be a string.');
      }
      return {
        id: requireString(item['id'], 'entry.id'),
        kind,
        label: requireString(item['label'], 'entry.label'),
        locator: requireString(item['locator'], 'entry.locator'),
        ...(bytes === undefined ? {} : { bytes }),
        ...(diagnostic === undefined ? {} : { diagnostic }),
      };
    }),
    defaultWorkspaceLocator: requireString(
      record['defaultWorkspaceLocator'],
      'defaultWorkspaceLocator',
    ),
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(record: Record<string, unknown>, keys: readonly string[]): void {
  const allowed = new Set(keys);
  const extras = Object.keys(record).filter((key) => !allowed.has(key));
  if (extras.length > 0)
    throw new Error(`Desktop storage payload has unknown fields: ${extras.join(', ')}.`);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value !== value.trim()) {
    throw new Error(`Desktop storage ${label} must be a non-empty trimmed string.`);
  }
  return value;
}
