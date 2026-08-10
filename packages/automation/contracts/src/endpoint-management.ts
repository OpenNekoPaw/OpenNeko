export const AUTOMATION_ENDPOINT_MANAGEMENT_HOST_CHANNEL =
  'neko:automation:endpoint-management' as const;

export type AutomationEndpointAuthorizationInput =
  | { readonly kind: 'none' }
  | { readonly kind: 'bearer'; readonly secret: string }
  | { readonly kind: 'header'; readonly name: string; readonly secret: string };

export interface AutomationEndpointConfigurationInput {
  readonly connectorId: string;
  readonly endpointId: string;
  readonly url: string;
  readonly authorization: AutomationEndpointAuthorizationInput;
}

export type AutomationEndpointDiagnosticCode =
  | 'configuration-invalid'
  | 'endpoint-unreachable'
  | 'provider-mismatch'
  | 'operation-unreviewed'
  | 'operation-schema-changed'
  | 'operation-annotations-contradictory';

export interface AutomationEndpointProjection {
  readonly connectorId: string;
  readonly displayName: string;
  readonly providerKind: 'browser' | 'computer';
  readonly upstreamRelease: string;
  readonly configured: boolean;
  readonly endpointId: string;
  /** A normalized URL without user info, query parameters, or fragments. */
  readonly endpointUrl: string;
  readonly authorizationState: 'not-configured' | 'not-required' | 'configured';
  readonly healthStatus: 'not-checked' | 'reachable' | 'unreachable';
  readonly providerStatus: 'unchecked' | 'matched' | 'mismatched';
  readonly qualificationStatus: 'unqualified' | 'qualified' | 'partial' | 'failed';
  readonly diagnostics: readonly AutomationEndpointDiagnosticCode[];
}

export interface AutomationEndpointManagementProjection {
  readonly identity: { readonly windowId: string };
  readonly endpoints: readonly AutomationEndpointProjection[];
}

export interface AutomationEndpointManagementRuntime {
  readonly identity: { readonly windowId: string };
  getSnapshot(): Promise<AutomationEndpointManagementProjection>;
  configure(
    input: AutomationEndpointConfigurationInput,
  ): Promise<AutomationEndpointManagementProjection>;
  remove(connectorId: string, endpointId: string): Promise<AutomationEndpointManagementProjection>;
  dispose(): void;
}

interface RequestBase {
  readonly requestId: string;
  readonly identity: { readonly windowId: string };
}

export type AutomationEndpointManagementHostRequest =
  | (RequestBase & { readonly route: 'snapshot.get' })
  | (RequestBase & {
      readonly route: 'endpoint.configure';
      readonly configuration: AutomationEndpointConfigurationInput;
    })
  | (RequestBase & {
      readonly route: 'endpoint.remove';
      readonly connectorId: string;
      readonly endpointId: string;
    });

export interface AutomationEndpointManagementHostResult {
  readonly requestId: string;
  readonly route: AutomationEndpointManagementHostRequest['route'];
  readonly projection: AutomationEndpointManagementProjection;
}

export interface OpenNekoAutomationEndpointManagementBridge {
  readonly automationEndpoints: {
    execute(
      request: AutomationEndpointManagementHostRequest,
    ): Promise<AutomationEndpointManagementHostResult>;
  };
}

export function parseAutomationEndpointConfigurationInput(
  value: unknown,
): AutomationEndpointConfigurationInput {
  const record = exactRecord(
    value,
    ['connectorId', 'endpointId', 'url', 'authorization'],
    'Automation endpoint configuration',
  );
  return {
    connectorId: identity(record['connectorId'], 'Automation endpoint connector'),
    endpointId: identity(record['endpointId'], 'Automation endpoint'),
    url: normalizedEndpointUrl(record['url']),
    authorization: parseAuthorization(record['authorization']),
  };
}

export function parseAutomationEndpointManagementHostRequest(
  value: unknown,
): AutomationEndpointManagementHostRequest {
  const record = recordValue(value, 'Automation endpoint management request');
  const route = record['route'];
  const base = {
    requestId: identity(record['requestId'], 'Automation endpoint management request'),
    identity: parseOwner(record['identity']),
  } as const;
  switch (route) {
    case 'snapshot.get':
      exactRecord(
        record,
        ['requestId', 'identity', 'route'],
        'Automation endpoint management request',
      );
      return { ...base, route };
    case 'endpoint.configure':
      exactRecord(
        record,
        ['requestId', 'identity', 'route', 'configuration'],
        'Automation endpoint management request',
      );
      return {
        ...base,
        route,
        configuration: parseAutomationEndpointConfigurationInput(record['configuration']),
      };
    case 'endpoint.remove':
      exactRecord(
        record,
        ['requestId', 'identity', 'route', 'connectorId', 'endpointId'],
        'Automation endpoint management request',
      );
      return {
        ...base,
        route,
        connectorId: identity(record['connectorId'], 'Automation endpoint connector'),
        endpointId: identity(record['endpointId'], 'Automation endpoint'),
      };
    default:
      throw new Error('Automation endpoint management route is invalid.');
  }
}

export function parseAutomationEndpointManagementHostResult(
  value: unknown,
  request: AutomationEndpointManagementHostRequest,
): AutomationEndpointManagementHostResult {
  const record = exactRecord(
    value,
    ['requestId', 'route', 'projection'],
    'Automation endpoint management result',
  );
  if (record['requestId'] !== request.requestId || record['route'] !== request.route) {
    throw new Error('Automation endpoint management result identity is stale.');
  }
  return {
    requestId: request.requestId,
    route: request.route,
    projection: parseAutomationEndpointManagementProjection(record['projection']),
  };
}

export function parseAutomationEndpointManagementProjection(
  value: unknown,
): AutomationEndpointManagementProjection {
  const record = exactRecord(
    value,
    ['identity', 'endpoints'],
    'Automation endpoint management projection',
  );
  if (!Array.isArray(record['endpoints'])) {
    throw new Error('Automation endpoint management endpoints are invalid.');
  }
  const endpoints = record['endpoints'].map(parseEndpointProjection);
  requireUnique(
    endpoints.map((endpoint) => endpoint.connectorId),
    'Automation endpoint connector projections',
  );
  return { identity: parseOwner(record['identity']), endpoints };
}

function parseEndpointProjection(value: unknown): AutomationEndpointProjection {
  const record = exactRecord(
    value,
    [
      'connectorId',
      'displayName',
      'providerKind',
      'upstreamRelease',
      'configured',
      'endpointId',
      'endpointUrl',
      'authorizationState',
      'healthStatus',
      'providerStatus',
      'qualificationStatus',
      'diagnostics',
    ],
    'Automation endpoint projection',
  );
  if (!Array.isArray(record['diagnostics'])) {
    throw new Error('Automation endpoint diagnostics are invalid.');
  }
  const diagnostics = record['diagnostics'].map(diagnosticCode);
  requireUnique(diagnostics, 'Automation endpoint diagnostics');
  const configured = booleanValue(record['configured'], 'Automation endpoint configured state');
  const endpointId = stringValue(record['endpointId'], 'Automation endpoint identity');
  const endpointUrl = stringValue(record['endpointUrl'], 'Automation endpoint URL');
  const authorizationState = oneOf(
    record['authorizationState'],
    ['not-configured', 'not-required', 'configured'] as const,
    'Automation endpoint authorization state',
  );
  if (
    configured !== (endpointId.length > 0 && endpointUrl.length > 0) ||
    (!configured && authorizationState !== 'not-configured') ||
    (configured && authorizationState === 'not-configured')
  ) {
    throw new Error('Automation endpoint projection state is inconsistent.');
  }
  return {
    connectorId: identity(record['connectorId'], 'Automation endpoint connector'),
    displayName: nonEmptyString(record['displayName'], 'Automation endpoint display name'),
    providerKind: oneOf(
      record['providerKind'],
      ['browser', 'computer'] as const,
      'Automation endpoint provider kind',
    ),
    upstreamRelease: nonEmptyString(
      record['upstreamRelease'],
      'Automation endpoint upstream release',
    ),
    configured,
    endpointId,
    endpointUrl,
    authorizationState,
    healthStatus: oneOf(
      record['healthStatus'],
      ['not-checked', 'reachable', 'unreachable'] as const,
      'Automation endpoint health status',
    ),
    providerStatus: oneOf(
      record['providerStatus'],
      ['unchecked', 'matched', 'mismatched'] as const,
      'Automation endpoint provider status',
    ),
    qualificationStatus: oneOf(
      record['qualificationStatus'],
      ['unqualified', 'qualified', 'partial', 'failed'] as const,
      'Automation endpoint qualification status',
    ),
    diagnostics,
  };
}

function parseAuthorization(value: unknown): AutomationEndpointAuthorizationInput {
  const record = recordValue(value, 'Automation endpoint authorization');
  switch (record['kind']) {
    case 'none':
      exactRecord(record, ['kind'], 'Automation endpoint authorization');
      return { kind: 'none' };
    case 'bearer':
      exactRecord(record, ['kind', 'secret'], 'Automation endpoint authorization');
      return { kind: 'bearer', secret: secret(record['secret']) };
    case 'header': {
      exactRecord(record, ['kind', 'name', 'secret'], 'Automation endpoint authorization');
      const name = nonEmptyString(record['name'], 'Automation endpoint authorization header');
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(name) || forbiddenHeader(name)) {
        throw new Error('Automation endpoint authorization header is not allowed.');
      }
      return { kind: 'header', name, secret: secret(record['secret']) };
    }
    default:
      throw new Error('Automation endpoint authorization kind is invalid.');
  }
}

function normalizedEndpointUrl(value: unknown): string {
  const source = nonEmptyString(value, 'Automation endpoint URL');
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new Error('Automation endpoint URL is invalid.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Automation endpoint URL must not contain credentials, query, or fragment.');
  }
  const loopback =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('Automation endpoint URL requires HTTPS or loopback HTTP.');
  }
  return url.toString();
}

function forbiddenHeader(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    normalized === 'authorization' ||
    normalized === 'cookie' ||
    normalized === 'host' ||
    normalized === 'connection' ||
    normalized === 'content-length' ||
    normalized.startsWith('proxy-') ||
    normalized.startsWith('sec-')
  );
}

function diagnosticCode(value: unknown): AutomationEndpointDiagnosticCode {
  return oneOf(
    value,
    [
      'configuration-invalid',
      'endpoint-unreachable',
      'provider-mismatch',
      'operation-unreviewed',
      'operation-schema-changed',
      'operation-annotations-contradictory',
    ] as const,
    'Automation endpoint diagnostic code',
  );
}

function parseOwner(value: unknown): { readonly windowId: string } {
  const record = exactRecord(value, ['windowId'], 'Automation endpoint management owner');
  return { windowId: identity(record['windowId'], 'Automation endpoint Window') };
}

function secret(value: unknown): string {
  const parsed = nonEmptyString(value, 'Automation endpoint authorization secret');
  if (parsed.length > 16_384 || /[\r\n]/u.test(parsed)) {
    throw new Error('Automation endpoint authorization secret is invalid.');
  }
  return parsed;
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

function oneOf<const Values extends readonly string[]>(
  value: unknown,
  allowed: Values,
  label: string,
): Values[number] {
  if (typeof value !== 'string' || !allowed.includes(value))
    throw new Error(`${label} is invalid.`);
  return value;
}

function requireUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} are duplicated.`);
}
