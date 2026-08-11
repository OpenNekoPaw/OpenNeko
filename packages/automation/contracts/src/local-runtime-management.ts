export const AUTOMATION_LOCAL_RUNTIME_MANAGEMENT_HOST_CHANNEL =
  'neko:automation:local-runtime-management' as const;

export type AutomationLocalRuntimeAssetKey = 'provider-runtime' | 'browser-executable';

export type AutomationLocalRuntimeDiagnosticCode =
  | 'authorization-invalid'
  | 'asset-missing'
  | 'asset-invalid'
  | 'asset-changed'
  | 'provider-unavailable'
  | 'provider-mismatch'
  | 'operation-unreviewed'
  | 'operation-schema-changed'
  | 'operation-annotations-contradictory';

export interface AutomationLocalRuntimeAssetProjection {
  readonly key: AutomationLocalRuntimeAssetKey;
  readonly label: string;
  readonly authorized: boolean;
  /** Opaque Host authorization identity. This is never a filesystem path. */
  readonly runtimeId: string;
  readonly displayName: string;
  readonly status: 'missing' | 'valid' | 'invalid' | 'changed';
}

export interface AutomationLocalRuntimeProjection {
  readonly sourceId: string;
  readonly displayName: string;
  readonly providerKind: 'browser' | 'computer';
  readonly installationGuideUrl: string;
  readonly installationCommand: string;
  readonly authorized: boolean;
  /** Opaque identity for the complete provider authorization. */
  readonly runtimeId: string;
  readonly state: 'not-configured' | 'ready' | 'error';
  readonly assets: readonly AutomationLocalRuntimeAssetProjection[];
  readonly diagnostics: readonly AutomationLocalRuntimeDiagnosticCode[];
}

export interface AutomationLocalRuntimeManagementProjection {
  readonly identity: { readonly windowId: string };
  readonly runtimes: readonly AutomationLocalRuntimeProjection[];
}

export interface AutomationLocalRuntimeManagementRuntime {
  readonly identity: { readonly windowId: string };
  getSnapshot(): Promise<AutomationLocalRuntimeManagementProjection>;
  openInstallationGuide(sourceId: string): Promise<AutomationLocalRuntimeManagementProjection>;
  copyInstallationCommand(sourceId: string): Promise<AutomationLocalRuntimeManagementProjection>;
  authorizeAsset(
    sourceId: string,
    assetKey: AutomationLocalRuntimeAssetKey,
  ): Promise<AutomationLocalRuntimeManagementProjection>;
  recheck(sourceId: string, runtimeId: string): Promise<AutomationLocalRuntimeManagementProjection>;
  disconnect(
    sourceId: string,
    runtimeId: string,
  ): Promise<AutomationLocalRuntimeManagementProjection>;
  dispose(): void;
}

interface RequestBase {
  readonly requestId: string;
  readonly identity: { readonly windowId: string };
}

export type AutomationLocalRuntimeManagementHostRequest =
  | (RequestBase & { readonly route: 'snapshot.get' })
  | (RequestBase & { readonly route: 'guide.open'; readonly sourceId: string })
  | (RequestBase & { readonly route: 'command.copy'; readonly sourceId: string })
  | (RequestBase & {
      readonly route: 'asset.authorize';
      readonly sourceId: string;
      readonly assetKey: AutomationLocalRuntimeAssetKey;
    })
  | (RequestBase & {
      readonly route: 'runtime.recheck';
      readonly sourceId: string;
      readonly runtimeId: string;
    })
  | (RequestBase & {
      readonly route: 'runtime.disconnect';
      readonly sourceId: string;
      readonly runtimeId: string;
    });

export interface AutomationLocalRuntimeManagementHostResult {
  readonly requestId: string;
  readonly route: AutomationLocalRuntimeManagementHostRequest['route'];
  readonly projection: AutomationLocalRuntimeManagementProjection;
}

export interface OpenNekoAutomationLocalRuntimeManagementBridge {
  readonly automationLocalRuntimes: {
    execute(
      request: AutomationLocalRuntimeManagementHostRequest,
    ): Promise<AutomationLocalRuntimeManagementHostResult>;
  };
}

export function parseAutomationLocalRuntimeManagementHostRequest(
  value: unknown,
): AutomationLocalRuntimeManagementHostRequest {
  const record = recordValue(value, 'Automation local runtime management request');
  const route = record['route'];
  const base = {
    requestId: identity(record['requestId'], 'Automation local runtime management request'),
    identity: parseOwner(record['identity']),
  } as const;
  switch (route) {
    case 'snapshot.get':
      exactRecord(
        record,
        ['requestId', 'identity', 'route'],
        'Automation local runtime management request',
      );
      return { ...base, route };
    case 'guide.open':
    case 'command.copy':
      exactRecord(
        record,
        ['requestId', 'identity', 'route', 'sourceId'],
        'Automation local runtime management request',
      );
      return {
        ...base,
        route,
        sourceId: identity(record['sourceId'], 'Automation local runtime source'),
      };
    case 'asset.authorize':
      exactRecord(
        record,
        ['requestId', 'identity', 'route', 'sourceId', 'assetKey'],
        'Automation local runtime management request',
      );
      return {
        ...base,
        route,
        sourceId: identity(record['sourceId'], 'Automation local runtime source'),
        assetKey: assetKey(record['assetKey']),
      };
    case 'runtime.recheck':
    case 'runtime.disconnect':
      exactRecord(
        record,
        ['requestId', 'identity', 'route', 'sourceId', 'runtimeId'],
        'Automation local runtime management request',
      );
      return {
        ...base,
        route,
        sourceId: identity(record['sourceId'], 'Automation local runtime source'),
        runtimeId: identity(record['runtimeId'], 'Automation local runtime authorization'),
      };
    default:
      throw new Error('Automation local runtime management route is invalid.');
  }
}

export function parseAutomationLocalRuntimeManagementHostResult(
  value: unknown,
  request: AutomationLocalRuntimeManagementHostRequest,
): AutomationLocalRuntimeManagementHostResult {
  const record = exactRecord(
    value,
    ['requestId', 'route', 'projection'],
    'Automation local runtime management result',
  );
  if (record['requestId'] !== request.requestId || record['route'] !== request.route) {
    throw new Error('Automation local runtime management result identity is stale.');
  }
  return {
    requestId: request.requestId,
    route: request.route,
    projection: parseAutomationLocalRuntimeManagementProjection(record['projection']),
  };
}

export function parseAutomationLocalRuntimeManagementProjection(
  value: unknown,
): AutomationLocalRuntimeManagementProjection {
  const record = exactRecord(
    value,
    ['identity', 'runtimes'],
    'Automation local runtime management projection',
  );
  if (!Array.isArray(record['runtimes'])) {
    throw new Error('Automation local runtime projections are invalid.');
  }
  const runtimes = record['runtimes'].map(parseRuntimeProjection);
  requireUnique(
    runtimes.map((runtime) => runtime.sourceId),
    'Automation local runtime sources',
  );
  return { identity: parseOwner(record['identity']), runtimes };
}

function parseRuntimeProjection(value: unknown): AutomationLocalRuntimeProjection {
  const record = exactRecord(
    value,
    [
      'sourceId',
      'displayName',
      'providerKind',
      'installationGuideUrl',
      'installationCommand',
      'authorized',
      'runtimeId',
      'state',
      'assets',
      'diagnostics',
    ],
    'Automation local runtime projection',
  );
  if (!Array.isArray(record['assets']) || !Array.isArray(record['diagnostics'])) {
    throw new Error('Automation local runtime projection collections are invalid.');
  }
  const assets = record['assets'].map(parseAssetProjection);
  requireUnique(
    assets.map((asset) => asset.key),
    'Automation local runtime assets',
  );
  const diagnostics = record['diagnostics'].map(diagnosticCode);
  requireUnique(diagnostics, 'Automation local runtime diagnostics');
  const authorized = booleanValue(record['authorized'], 'Automation local runtime authorization');
  const runtimeId = stringValue(record['runtimeId'], 'Automation local runtime authorization');
  const state = oneOf(
    record['state'],
    ['not-configured', 'ready', 'error'] as const,
    'Automation local runtime state',
  );
  if (authorized !== runtimeId.length > 0 || (!authorized && state !== 'not-configured')) {
    throw new Error('Automation local runtime projection state is inconsistent.');
  }
  return {
    sourceId: identity(record['sourceId'], 'Automation local runtime source'),
    displayName: nonEmptyString(record['displayName'], 'Automation local runtime display name'),
    providerKind: oneOf(
      record['providerKind'],
      ['browser', 'computer'] as const,
      'Automation local runtime provider kind',
    ),
    installationGuideUrl: httpsUrl(record['installationGuideUrl']),
    installationCommand: nonEmptyString(
      record['installationCommand'],
      'Automation local runtime installation command',
    ),
    authorized,
    runtimeId,
    state,
    assets,
    diagnostics,
  };
}

function parseAssetProjection(value: unknown): AutomationLocalRuntimeAssetProjection {
  const record = exactRecord(
    value,
    ['key', 'label', 'authorized', 'runtimeId', 'displayName', 'status'],
    'Automation local runtime asset projection',
  );
  const authorized = booleanValue(
    record['authorized'],
    'Automation local runtime asset authorization',
  );
  const runtimeId = stringValue(
    record['runtimeId'],
    'Automation local runtime asset authorization',
  );
  const displayName = stringValue(
    record['displayName'],
    'Automation local runtime asset display name',
  );
  const status = oneOf(
    record['status'],
    ['missing', 'valid', 'invalid', 'changed'] as const,
    'Automation local runtime asset status',
  );
  if (
    authorized !== (runtimeId.length > 0 && displayName.length > 0) ||
    (!authorized && status !== 'missing')
  ) {
    throw new Error('Automation local runtime asset projection state is inconsistent.');
  }
  return {
    key: assetKey(record['key']),
    label: nonEmptyString(record['label'], 'Automation local runtime asset label'),
    authorized,
    runtimeId,
    displayName,
    status,
  };
}

function assetKey(value: unknown): AutomationLocalRuntimeAssetKey {
  return oneOf(
    value,
    ['provider-runtime', 'browser-executable'] as const,
    'Automation local runtime asset key',
  );
}

function diagnosticCode(value: unknown): AutomationLocalRuntimeDiagnosticCode {
  return oneOf(
    value,
    [
      'authorization-invalid',
      'asset-missing',
      'asset-invalid',
      'asset-changed',
      'provider-unavailable',
      'provider-mismatch',
      'operation-unreviewed',
      'operation-schema-changed',
      'operation-annotations-contradictory',
    ] as const,
    'Automation local runtime diagnostic code',
  );
}

function parseOwner(value: unknown): { readonly windowId: string } {
  const record = exactRecord(value, ['windowId'], 'Automation local runtime management owner');
  return { windowId: identity(record['windowId'], 'Automation local runtime Window') };
}

function httpsUrl(value: unknown): string {
  const source = nonEmptyString(value, 'Automation local runtime installation guide URL');
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new Error('Automation local runtime installation guide URL is invalid.');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error(
      'Automation local runtime installation guide URL requires credential-free HTTPS.',
    );
  }
  return url.toString();
}

function identity(value: unknown, label: string): string {
  const parsed = nonEmptyString(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(parsed)) {
    throw new Error(`${label} is invalid.`);
  }
  return parsed;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string.`);
  return value;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} is invalid.`);
  return value;
}

function recordValue(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  const record = recordValue(value, label);
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw new Error(`${label} contains unsupported or missing fields.`);
  }
  return record;
}

function requireUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} are duplicated.`);
}

function oneOf<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value as T[number];
}
