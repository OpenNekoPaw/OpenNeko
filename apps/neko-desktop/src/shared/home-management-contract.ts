import {
  parseDesktopDomainCapabilityProjection,
  type DesktopDomainCapabilityProjection,
} from './shell-contract';

export const DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION = 1 as const;

export const DESKTOP_HOME_MANAGEMENT_CHANNELS = {
  assetsSearch: 'openneko:desktop:home:assets:search',
  pluginsList: 'openneko:desktop:home:plugins:list',
} as const;

export type DesktopHomeAssetFacet = 'files' | 'media' | 'entities';

export interface DesktopHomeManagementRequest {
  readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
  readonly requestId: string;
  readonly projectId: string;
}

export interface DesktopHomeAssetSearchRequest extends DesktopHomeManagementRequest {
  readonly facet: DesktopHomeAssetFacet;
  readonly query: string;
  readonly limit: number;
}

export interface DesktopHomeAssetItem {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly kind: 'directory' | 'content' | 'entity';
  readonly mediaType?: string;
  readonly availability: 'available' | 'unavailable';
}

export type DesktopHomeAssetSearchResult =
  | {
      readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
      readonly requestId: string;
      readonly projectId: string;
      readonly facet: DesktopHomeAssetFacet;
      readonly status: 'ready';
      readonly items: readonly DesktopHomeAssetItem[];
    }
  | {
      readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
      readonly requestId: string;
      readonly projectId: string;
      readonly facet: DesktopHomeAssetFacet;
      readonly status: 'error';
      readonly diagnostic: { readonly message: string };
    };

export interface DesktopHomePluginsRequest extends DesktopHomeManagementRequest {}

export interface DesktopHomeSkillItem {
  readonly name: string;
  readonly description: string;
  readonly source: 'builtin' | 'personal' | 'project';
  readonly trusted: boolean;
  readonly enabled: boolean;
}

export interface DesktopHomePluginsResult {
  readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
  readonly requestId: string;
  readonly projectId: string;
  readonly skills: readonly DesktopHomeSkillItem[];
  readonly extensions: readonly DesktopDomainCapabilityProjection[];
  readonly externalPluginHost: 'unavailable';
}

export interface OpenNekoDesktopHomeManagementBridge {
  readonly home: {
    readonly assets: {
      search(input: {
        readonly projectId: string;
        readonly facet: DesktopHomeAssetFacet;
        readonly query: string;
        readonly limit?: number;
      }): Promise<DesktopHomeAssetSearchResult>;
    };
    readonly plugins: {
      list(projectId: string): Promise<DesktopHomePluginsResult>;
    };
  };
}

export function createDesktopHomeAssetSearchRequest(
  requestId: string,
  input: {
    readonly projectId: string;
    readonly facet: DesktopHomeAssetFacet;
    readonly query: string;
    readonly limit?: number;
  },
): DesktopHomeAssetSearchRequest {
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId: requireNonEmptyString(requestId, 'Desktop Home requestId is required.'),
    projectId: requireNonEmptyString(input.projectId, 'Desktop Home projectId is required.'),
    facet: requireFacet(input.facet),
    query: input.query.trim(),
    limit: requireLimit(input.limit ?? 60),
  };
}

export function parseDesktopHomeAssetSearchRequest(
  value: unknown,
): DesktopHomeAssetSearchRequest {
  const record = requireRecord(value, 'Desktop Home asset request must be an object.');
  requireVersion(record['schemaVersion']);
  return createDesktopHomeAssetSearchRequest(
    requireNonEmptyString(record['requestId'], 'Desktop Home requestId is required.'),
    {
      projectId: requireNonEmptyString(
        record['projectId'],
        'Desktop Home projectId is required.',
      ),
      facet: requireFacet(record['facet']),
      query: requireString(record['query'], 'Desktop Home asset query must be a string.'),
      limit: requireLimit(record['limit']),
    },
  );
}

export function createDesktopHomePluginsRequest(
  requestId: string,
  projectId: string,
): DesktopHomePluginsRequest {
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId: requireNonEmptyString(requestId, 'Desktop Home requestId is required.'),
    projectId: requireNonEmptyString(projectId, 'Desktop Home projectId is required.'),
  };
}

export function parseDesktopHomePluginsRequest(value: unknown): DesktopHomePluginsRequest {
  const record = requireRecord(value, 'Desktop Home plugins request must be an object.');
  requireVersion(record['schemaVersion']);
  return createDesktopHomePluginsRequest(
    requireNonEmptyString(record['requestId'], 'Desktop Home requestId is required.'),
    requireNonEmptyString(record['projectId'], 'Desktop Home projectId is required.'),
  );
}

export function parseDesktopHomeAssetSearchResult(
  value: unknown,
  expectedRequestId: string,
): DesktopHomeAssetSearchResult {
  const record = requireRecord(value, 'Desktop Home asset result must be an object.');
  requireVersion(record['schemaVersion']);
  const requestId = requireRequestId(record['requestId'], expectedRequestId);
  const projectId = requireNonEmptyString(
    record['projectId'],
    'Desktop Home asset result projectId is required.',
  );
  const facet = requireFacet(record['facet']);
  if (record['status'] === 'error') {
    const diagnostic = requireRecord(
      record['diagnostic'],
      'Desktop Home asset diagnostic is required.',
    );
    return {
      schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
      requestId,
      projectId,
      facet,
      status: 'error',
      diagnostic: {
        message: requireNonEmptyString(
          diagnostic['message'],
          'Desktop Home asset diagnostic message is required.',
        ),
      },
    };
  }
  if (record['status'] !== 'ready' || !Array.isArray(record['items'])) {
    throw new Error('Desktop Home asset result status or items are invalid.');
  }
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId,
    projectId,
    facet,
    status: 'ready',
    items: record['items'].map(parseAssetItem),
  };
}

export function parseDesktopHomePluginsResult(
  value: unknown,
  expectedRequestId: string,
): DesktopHomePluginsResult {
  const record = requireRecord(value, 'Desktop Home plugins result must be an object.');
  requireVersion(record['schemaVersion']);
  const requestId = requireRequestId(record['requestId'], expectedRequestId);
  if (
    !Array.isArray(record['skills']) ||
    !Array.isArray(record['extensions']) ||
    record['externalPluginHost'] !== 'unavailable'
  ) {
    throw new Error('Desktop Home plugins result is invalid.');
  }
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId,
    projectId: requireNonEmptyString(
      record['projectId'],
      'Desktop Home plugins projectId is required.',
    ),
    skills: record['skills'].map(parseSkillItem),
    extensions: record['extensions'].map(parseDesktopDomainCapabilityProjection),
    externalPluginHost: 'unavailable',
  };
}

function parseAssetItem(value: unknown): DesktopHomeAssetItem {
  const record = requireRecord(value, 'Desktop Home asset item must be an object.');
  const kind = record['kind'];
  const availability = record['availability'];
  if (kind !== 'directory' && kind !== 'content' && kind !== 'entity') {
    throw new Error('Desktop Home asset item kind is invalid.');
  }
  if (availability !== 'available' && availability !== 'unavailable') {
    throw new Error('Desktop Home asset item availability is invalid.');
  }
  return {
    id: requireNonEmptyString(record['id'], 'Desktop Home asset item id is required.'),
    label: requireNonEmptyString(record['label'], 'Desktop Home asset item label is required.'),
    ...(typeof record['description'] === 'string'
      ? { description: record['description'] }
      : {}),
    kind,
    ...(typeof record['mediaType'] === 'string' ? { mediaType: record['mediaType'] } : {}),
    availability,
  };
}

function parseSkillItem(value: unknown): DesktopHomeSkillItem {
  const record = requireRecord(value, 'Desktop Home Skill item must be an object.');
  const source = record['source'];
  if (source !== 'builtin' && source !== 'personal' && source !== 'project') {
    throw new Error('Desktop Home Skill source is invalid.');
  }
  if (typeof record['trusted'] !== 'boolean' || typeof record['enabled'] !== 'boolean') {
    throw new Error('Desktop Home Skill state is invalid.');
  }
  return {
    name: requireNonEmptyString(record['name'], 'Desktop Home Skill name is required.'),
    description: requireString(
      record['description'],
      'Desktop Home Skill description must be a string.',
    ),
    source,
    trusted: record['trusted'],
    enabled: record['enabled'],
  };
}

function requireVersion(value: unknown): void {
  if (value !== DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION) {
    throw new Error('Desktop Home management contract version is unsupported.');
  }
}

function requireRequestId(value: unknown, expected: string): string {
  const requestId = requireNonEmptyString(value, 'Desktop Home result requestId is required.');
  if (requestId !== expected) {
    throw new Error(`Desktop Home response '${requestId}' does not match '${expected}'.`);
  }
  return requestId;
}

function requireFacet(value: unknown): DesktopHomeAssetFacet {
  if (value !== 'files' && value !== 'media' && value !== 'entities') {
    throw new Error('Desktop Home asset facet is invalid.');
  }
  return value;
}

function requireLimit(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 200
  ) {
    throw new Error('Desktop Home asset limit must be an integer between 1 and 200.');
  }
  return value;
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== 'string') throw new Error(message);
  return value;
}

function requireNonEmptyString(value: unknown, message: string): string {
  const text = requireString(value, message).trim();
  if (!text) throw new Error(message);
  return text;
}
