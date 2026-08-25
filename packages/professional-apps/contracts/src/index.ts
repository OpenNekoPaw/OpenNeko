import { validateContentLocator, type ContentLocator } from '@neko/content-domain';

export type ProfessionalApplicationPlatform = 'macos' | 'windows' | 'linux';
export type ProfessionalApplicationCategory =
  | 'image-editing'
  | 'video-post'
  | 'three-dimensional'
  | 'game-creation'
  | 'character-production'
  | 'workflow-platform'
  | 'audio-production'
  | 'office';

export type ProfessionalApplicationOperationKind =
  | 'launch'
  | 'resource-handoff'
  | 'inspect-visible'
  | 'run-workflow'
  | 'observe-workflow'
  | 'cancel-workflow'
  | 'retrieve-output';

export type ProfessionalApplicationTransport = 'host' | 'api' | 'mcp' | 'computer-use';
export type ProfessionalApplicationVerification =
  'launch-receipt' | 'visual-advisory' | 'provider-state' | 'durable-artifact';

export interface ProfessionalApplicationIdentity {
  readonly platform: ProfessionalApplicationPlatform;
  readonly kind: 'bundle-id' | 'app-user-model-id' | 'desktop-entry';
  readonly value: string;
}

export interface ProfessionalApplicationOperation {
  readonly id: string;
  readonly label: string;
  readonly kind: ProfessionalApplicationOperationKind;
  readonly transport: ProfessionalApplicationTransport;
  readonly effect: 'observe' | 'launch' | 'input' | 'execute' | 'retrieve';
  readonly requiresApproval: boolean;
  readonly verification: ProfessionalApplicationVerification;
  readonly inputMimeTypes: readonly string[];
}

export interface ProfessionalApplicationProfile {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: ProfessionalApplicationCategory;
  readonly supportedPlatforms: readonly ProfessionalApplicationPlatform[];
  readonly applicationIdentities: readonly ProfessionalApplicationIdentity[];
  readonly minimumVendorRelease?: string;
  readonly maximumVendorReleaseExclusive?: string;
  readonly officialDownloadUrl?: string;
  readonly configurable: {
    readonly applicationLocator: boolean;
    readonly endpoint: boolean;
    readonly defaultWorkflow: boolean;
  };
  readonly operations: readonly ProfessionalApplicationOperation[];
}

export type ProfessionalApplicationLocator =
  | { readonly kind: 'application-identity'; readonly identity: string }
  | { readonly kind: 'opaque-bookmark'; readonly bookmarkId: string }
  | { readonly kind: 'variable-path'; readonly path: string };

export interface ProfessionalApplicationBinding {
  readonly integrationId: string;
  readonly applicationLocator?: ProfessionalApplicationLocator;
  readonly endpoint?: string;
  readonly launchPreference: 'reuse-qualified' | 'launch-new';
  readonly defaultWorkflowId?: string;
}

export type ProfessionalApplicationReadinessState =
  | 'unconfigured'
  | 'not-installed'
  | 'detected'
  | 'incompatible'
  | 'permission-blocked'
  | 'ready'
  | 'unavailable';

export interface ProfessionalApplicationDiagnostic {
  readonly code:
    | 'binding-invalid'
    | 'application-not-installed'
    | 'application-identity-mismatch'
    | 'application-version-incompatible'
    | 'endpoint-invalid'
    | 'endpoint-unavailable'
    | 'endpoint-outside-loopback'
    | 'permission-required'
    | 'profile-probe-failed';
  readonly message: string;
}

export interface ProfessionalApplicationInspection {
  readonly integrationId: string;
  readonly state: ProfessionalApplicationReadinessState;
  readonly detectedApplicationIdentity?: string;
  readonly detectedVendorRelease?: string;
  readonly availableOperationIds: readonly string[];
  readonly diagnostics: readonly ProfessionalApplicationDiagnostic[];
}

export interface ProfessionalApplicationItemProjection {
  readonly profile: ProfessionalApplicationProfile;
  readonly binding?: ProfessionalApplicationBinding;
  readonly enabled: boolean;
  readonly readiness: ProfessionalApplicationInspection;
}

export interface ProfessionalApplicationManagementProjection {
  readonly identity: { readonly windowId: string };
  readonly items: readonly ProfessionalApplicationItemProjection[];
}

export type ProfessionalResourceSource =
  | {
      readonly kind: 'revision';
      readonly ownerId: string;
      readonly resourceId: string;
      readonly revisionId: string;
      readonly mimeType: string;
    }
  | {
      readonly kind: 'candidate';
      readonly ownerId: string;
      readonly resourceId: string;
      readonly candidateId: string;
      readonly mimeType: string;
    };

export interface ProfessionalResourceActionProjection {
  readonly integrationId: string;
  readonly operationId: string;
  readonly label: string;
  readonly source: ProfessionalResourceSource;
}

export interface ProfessionalApplicationHandoffIntent {
  readonly handoffId: string;
  readonly integrationId: string;
  readonly operationId: string;
  readonly source: ProfessionalResourceSource;
  readonly locator: ContentLocator;
}

export interface ProfessionalApplicationHandoffReceipt {
  readonly handoffId: string;
  readonly integrationId: string;
  readonly operationId: string;
  readonly status: 'launched' | 'transferred' | 'outcome-unknown';
  readonly targetIdentity: string;
}

export interface ProfessionalApplicationLaunchReceipt {
  readonly integrationId: string;
  readonly operationId: string;
  readonly status: 'launched';
  readonly targetIdentity: string;
}

export interface ProfessionalApplicationSelectionReceipt {
  readonly integrationId: string;
  readonly status: 'selected' | 'cancelled';
}

export interface ProfessionalApplicationManagementRuntime {
  readonly identity: { readonly windowId: string };
  getSnapshot(): Promise<ProfessionalApplicationManagementProjection>;
  updateBinding(
    binding: ProfessionalApplicationBinding,
  ): Promise<ProfessionalApplicationManagementProjection>;
  addBinding(integrationId: string): Promise<ProfessionalApplicationManagementProjection>;
  setEnabled(
    integrationId: string,
    enabled: boolean,
  ): Promise<ProfessionalApplicationManagementProjection>;
  removeBinding(integrationId: string): Promise<ProfessionalApplicationManagementProjection>;
  selectApplication(integrationId: string): Promise<ProfessionalApplicationManagementProjection>;
  launch(integrationId: string): Promise<ProfessionalApplicationLaunchReceipt>;
  dispose(): void;
}

export class ProfessionalApplicationContractError extends Error {
  constructor(
    readonly code:
      'professional-application-payload-invalid' | 'professional-application-request-mismatch',
    message: string,
  ) {
    super(message);
    this.name = 'ProfessionalApplicationContractError';
  }
}

export function parseProfessionalApplicationProfile(
  value: unknown,
): ProfessionalApplicationProfile {
  const record = exactRecord(
    value,
    [
      'id',
      'name',
      'description',
      'category',
      'supportedPlatforms',
      'applicationIdentities',
      'minimumVendorRelease',
      'maximumVendorReleaseExclusive',
      'officialDownloadUrl',
      'configurable',
      'operations',
    ],
    'Professional application profile',
  );
  const supportedPlatforms = stringArray(
    record['supportedPlatforms'],
    'Professional application supported platforms',
  ).map((platform) => oneOf(platform, PLATFORMS, 'Professional application platform'));
  const identities = arrayValue(
    record['applicationIdentities'],
    'Professional application identities',
  ).map(parseProfessionalApplicationIdentity);
  const operations = arrayValue(record['operations'], 'Professional application operations').map(
    parseProfessionalApplicationOperation,
  );
  unique(
    operations.map((operation) => operation.id),
    'Professional application operation',
  );
  const configurable = exactRecord(
    record['configurable'],
    ['applicationLocator', 'endpoint', 'defaultWorkflow'],
    'Professional application configurable fields',
  );
  const profile: ProfessionalApplicationProfile = {
    id: identity(record['id'], 'Professional application profile'),
    name: nonEmptyString(record['name'], 'Professional application name'),
    description: stringValue(record['description'], 'Professional application description'),
    category: oneOf(record['category'], CATEGORIES, 'Professional application category'),
    supportedPlatforms,
    applicationIdentities: identities,
    configurable: {
      applicationLocator: booleanValue(
        configurable['applicationLocator'],
        'applicationLocator configurable flag',
      ),
      endpoint: booleanValue(configurable['endpoint'], 'endpoint configurable flag'),
      defaultWorkflow: booleanValue(
        configurable['defaultWorkflow'],
        'defaultWorkflow configurable flag',
      ),
    },
    operations,
    ...(optionalNonEmptyString(record['minimumVendorRelease'], 'minimum vendor release')
      ? {
          minimumVendorRelease: optionalNonEmptyString(
            record['minimumVendorRelease'],
            'minimum vendor release',
          ),
        }
      : {}),
    ...(optionalNonEmptyString(record['maximumVendorReleaseExclusive'], 'maximum vendor release')
      ? {
          maximumVendorReleaseExclusive: optionalNonEmptyString(
            record['maximumVendorReleaseExclusive'],
            'maximum vendor release',
          ),
        }
      : {}),
    ...(optionalHttpsUrl(record['officialDownloadUrl'], 'official download URL')
      ? {
          officialDownloadUrl: optionalHttpsUrl(
            record['officialDownloadUrl'],
            'official download URL',
          ),
        }
      : {}),
  };
  unique(profile.supportedPlatforms, 'Professional application supported platform');
  unique(
    profile.applicationIdentities.map(
      (applicationIdentity) =>
        `${applicationIdentity.platform}:${applicationIdentity.kind}:${applicationIdentity.value}`,
    ),
    'Professional application identity',
  );
  for (const applicationIdentity of profile.applicationIdentities) {
    if (!profile.supportedPlatforms.includes(applicationIdentity.platform)) {
      invalid(
        `Professional application identity platform '${applicationIdentity.platform}' is not supported.`,
      );
    }
  }
  return profile;
}

export function parseProfessionalApplicationBinding(
  value: unknown,
): ProfessionalApplicationBinding {
  const record = exactRecord(
    value,
    ['integrationId', 'applicationLocator', 'endpoint', 'launchPreference', 'defaultWorkflowId'],
    'Professional application binding',
  );
  const applicationLocator =
    record['applicationLocator'] === undefined
      ? undefined
      : parseProfessionalApplicationLocator(record['applicationLocator']);
  const endpoint = optionalLoopbackEndpoint(record['endpoint']);
  const defaultWorkflowId = optionalIdentity(record['defaultWorkflowId'], 'Default workflow');
  return {
    integrationId: identity(record['integrationId'], 'Professional application integration'),
    ...(applicationLocator ? { applicationLocator } : {}),
    ...(endpoint ? { endpoint } : {}),
    launchPreference: oneOf(
      record['launchPreference'],
      ['reuse-qualified', 'launch-new'] as const,
      'Professional application launch preference',
    ),
    ...(defaultWorkflowId ? { defaultWorkflowId } : {}),
  };
}

export function parseProfessionalApplicationInspection(
  value: unknown,
): ProfessionalApplicationInspection {
  const record = exactRecord(
    value,
    [
      'integrationId',
      'state',
      'detectedApplicationIdentity',
      'detectedVendorRelease',
      'availableOperationIds',
      'diagnostics',
    ],
    'Professional application inspection',
  );
  const availableOperationIds = stringArray(
    record['availableOperationIds'],
    'Professional application available operations',
  ).map((operationId) => identity(operationId, 'Professional application operation'));
  unique(availableOperationIds, 'Professional application available operation');
  return {
    integrationId: identity(record['integrationId'], 'Professional application integration'),
    state: oneOf(record['state'], READINESS_STATES, 'Professional application readiness'),
    ...(optionalNonEmptyString(
      record['detectedApplicationIdentity'],
      'detected application identity',
    )
      ? {
          detectedApplicationIdentity: optionalNonEmptyString(
            record['detectedApplicationIdentity'],
            'detected application identity',
          ),
        }
      : {}),
    ...(optionalNonEmptyString(record['detectedVendorRelease'], 'detected vendor release')
      ? {
          detectedVendorRelease: optionalNonEmptyString(
            record['detectedVendorRelease'],
            'detected vendor release',
          ),
        }
      : {}),
    availableOperationIds,
    diagnostics: arrayValue(record['diagnostics'], 'Professional application diagnostics').map(
      parseProfessionalApplicationDiagnostic,
    ),
  };
}

export function parseProfessionalApplicationManagementProjection(
  value: unknown,
): ProfessionalApplicationManagementProjection {
  const record = exactRecord(
    value,
    ['identity', 'items'],
    'Professional application management projection',
  );
  const projectionIdentity = exactRecord(
    record['identity'],
    ['windowId'],
    'Professional application projection identity',
  );
  const items = arrayValue(record['items'], 'Professional application items').map((item) => {
    const itemRecord = exactRecord(
      item,
      ['profile', 'binding', 'enabled', 'readiness'],
      'Professional application item',
    );
    const profile = parseProfessionalApplicationProfile(itemRecord['profile']);
    const binding =
      itemRecord['binding'] === undefined
        ? undefined
        : parseProfessionalApplicationBinding(itemRecord['binding']);
    const readiness = parseProfessionalApplicationInspection(itemRecord['readiness']);
    if (binding && binding.integrationId !== profile.id) {
      invalid(
        `Professional application binding '${binding.integrationId}' does not match '${profile.id}'.`,
      );
    }
    if (readiness.integrationId !== profile.id) {
      invalid(
        `Professional application inspection '${readiness.integrationId}' does not match '${profile.id}'.`,
      );
    }
    const operationIds = new Set(profile.operations.map((operation) => operation.id));
    for (const operationId of readiness.availableOperationIds) {
      if (!operationIds.has(operationId)) {
        invalid(
          `Professional application operation '${operationId}' is not qualified by '${profile.id}'.`,
        );
      }
    }
    const enabled = booleanValue(itemRecord['enabled'], 'Professional application enablement');
    if (enabled && !binding) {
      invalid(`Professional application '${profile.id}' cannot be enabled without a binding.`);
    }
    return { profile, ...(binding ? { binding } : {}), enabled, readiness };
  });
  unique(
    items.map((item) => item.profile.id),
    'Professional application projection item',
  );
  return {
    identity: {
      windowId: identity(projectionIdentity['windowId'], 'Professional application window'),
    },
    items,
  };
}

export function parseProfessionalResourceSource(value: unknown): ProfessionalResourceSource {
  const record = recordValue(value, 'Professional resource source');
  if (record['kind'] === 'revision') {
    const exact = exactRecord(
      record,
      ['kind', 'ownerId', 'resourceId', 'revisionId', 'mimeType'],
      'Professional resource revision',
    );
    return {
      kind: 'revision',
      ownerId: identity(exact['ownerId'], 'Professional resource owner'),
      resourceId: identity(exact['resourceId'], 'Professional resource'),
      revisionId: identity(exact['revisionId'], 'Professional resource revision'),
      mimeType: mimeType(exact['mimeType']),
    };
  }
  if (record['kind'] === 'candidate') {
    const exact = exactRecord(
      record,
      ['kind', 'ownerId', 'resourceId', 'candidateId', 'mimeType'],
      'Professional resource candidate',
    );
    return {
      kind: 'candidate',
      ownerId: identity(exact['ownerId'], 'Professional resource owner'),
      resourceId: identity(exact['resourceId'], 'Professional resource'),
      candidateId: identity(exact['candidateId'], 'Professional resource candidate'),
      mimeType: mimeType(exact['mimeType']),
    };
  }
  invalid('Professional resource source kind is invalid.');
}

export function parseProfessionalApplicationHandoffIntent(
  value: unknown,
): ProfessionalApplicationHandoffIntent {
  const record = exactRecord(
    value,
    ['handoffId', 'integrationId', 'operationId', 'source', 'locator'],
    'Professional application handoff',
  );
  const result = validateContentLocator(record['locator']);
  if (!result.ok) invalid('Professional application handoff ContentLocator is invalid.');
  return {
    handoffId: identity(record['handoffId'], 'Professional application handoff'),
    integrationId: identity(record['integrationId'], 'Professional application integration'),
    operationId: identity(record['operationId'], 'Professional application operation'),
    source: parseProfessionalResourceSource(record['source']),
    locator: result.locator,
  };
}

function parseProfessionalApplicationIdentity(value: unknown): ProfessionalApplicationIdentity {
  const record = exactRecord(
    value,
    ['platform', 'kind', 'value'],
    'Professional application identity',
  );
  return {
    platform: oneOf(record['platform'], PLATFORMS, 'Professional application platform'),
    kind: oneOf(
      record['kind'],
      ['bundle-id', 'app-user-model-id', 'desktop-entry'] as const,
      'Professional application identity kind',
    ),
    value: nonEmptyString(record['value'], 'Professional application identity value'),
  };
}

function parseProfessionalApplicationOperation(value: unknown): ProfessionalApplicationOperation {
  const record = exactRecord(
    value,
    [
      'id',
      'label',
      'kind',
      'transport',
      'effect',
      'requiresApproval',
      'verification',
      'inputMimeTypes',
    ],
    'Professional application operation',
  );
  return {
    id: identity(record['id'], 'Professional application operation'),
    label: nonEmptyString(record['label'], 'Professional application operation label'),
    kind: oneOf(record['kind'], OPERATION_KINDS, 'Professional application operation kind'),
    transport: oneOf(
      record['transport'],
      ['host', 'api', 'mcp', 'computer-use'] as const,
      'Professional application transport',
    ),
    effect: oneOf(
      record['effect'],
      ['observe', 'launch', 'input', 'execute', 'retrieve'] as const,
      'Professional application operation effect',
    ),
    requiresApproval: booleanValue(
      record['requiresApproval'],
      'Professional application operation approval',
    ),
    verification: oneOf(
      record['verification'],
      ['launch-receipt', 'visual-advisory', 'provider-state', 'durable-artifact'] as const,
      'Professional application verification',
    ),
    inputMimeTypes: stringArray(
      record['inputMimeTypes'],
      'Professional application operation MIME types',
    ).map(mimePattern),
  };
}

function parseProfessionalApplicationLocator(value: unknown): ProfessionalApplicationLocator {
  const record = recordValue(value, 'Professional application locator');
  if (record['kind'] === 'application-identity') {
    const exact = exactRecord(
      record,
      ['kind', 'identity'],
      'Professional application identity locator',
    );
    return {
      kind: 'application-identity',
      identity: nonEmptyString(exact['identity'], 'Professional application locator identity'),
    };
  }
  if (record['kind'] === 'opaque-bookmark') {
    const exact = exactRecord(
      record,
      ['kind', 'bookmarkId'],
      'Professional application bookmark locator',
    );
    return {
      kind: 'opaque-bookmark',
      bookmarkId: identity(exact['bookmarkId'], 'Professional application bookmark'),
    };
  }
  if (record['kind'] === 'variable-path') {
    const exact = exactRecord(
      record,
      ['kind', 'path'],
      'Professional application variable path locator',
    );
    const path = nonEmptyString(exact['path'], 'Professional application variable path');
    if (!isVariablePath(path)) {
      invalid('Professional application path must use a ${VAR}/path form.');
    }
    return { kind: 'variable-path', path };
  }
  invalid('Professional application locator kind is invalid.');
}

function isVariablePath(value: string): boolean {
  if (!value.startsWith('${')) return false;
  const variableEnd = value.indexOf('}');
  if (variableEnd < 3) return false;
  const variable = value.slice(2, variableEnd);
  if (!/^[A-Z][A-Z0-9_]*$/u.test(variable)) return false;
  const suffix = value.slice(variableEnd + 1);
  if (!suffix) return true;
  if (!suffix.startsWith('/')) return false;
  return suffix
    .slice(1)
    .split('/')
    .every(
      (segment) =>
        Boolean(segment) &&
        segment !== '.' &&
        segment !== '..' &&
        !segment.includes('\\') &&
        !/\p{Cc}/u.test(segment),
    );
}

function parseProfessionalApplicationDiagnostic(value: unknown): ProfessionalApplicationDiagnostic {
  const record = exactRecord(value, ['code', 'message'], 'Professional application diagnostic');
  return {
    code: oneOf(record['code'], DIAGNOSTIC_CODES, 'Professional application diagnostic code'),
    message: nonEmptyString(record['message'], 'Professional application diagnostic message'),
  };
}

function optionalLoopbackEndpoint(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const endpoint = nonEmptyString(value, 'Professional application endpoint');
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    invalid('Professional application endpoint must be a valid URL.');
  }
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname)) {
    invalid('Professional application endpoint must use HTTP on an explicit loopback host.');
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    invalid(
      'Professional application endpoint must be an API root without credentials, path, query or fragment.',
    );
  }
  return url.href.replace(/\/$/u, '');
}

function optionalHttpsUrl(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  const input = nonEmptyString(value, label);
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    invalid(`${label} must be a valid URL.`);
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    invalid(`${label} must be an HTTPS URL without credentials.`);
  }
  return url.href;
}

function mimeType(value: unknown): string {
  const input = nonEmptyString(value, 'Professional resource MIME type').toLowerCase();
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u.test(input)) {
    invalid('Professional resource MIME type is invalid.');
  }
  return input;
}

function mimePattern(value: string): string {
  const input = value.toLowerCase();
  if (!/^[a-z0-9!#$&^_.+-]+\/(?:[a-z0-9!#$&^_.+-]+|\*)$/u.test(input)) {
    invalid('Professional application MIME pattern is invalid.');
  }
  return input;
}

const PLATFORMS = ['macos', 'windows', 'linux'] as const;
const CATEGORIES = [
  'image-editing',
  'video-post',
  'three-dimensional',
  'game-creation',
  'character-production',
  'workflow-platform',
  'audio-production',
  'office',
] as const;
const OPERATION_KINDS = [
  'launch',
  'resource-handoff',
  'inspect-visible',
  'run-workflow',
  'observe-workflow',
  'cancel-workflow',
  'retrieve-output',
] as const;
const READINESS_STATES = [
  'unconfigured',
  'not-installed',
  'detected',
  'incompatible',
  'permission-blocked',
  'ready',
  'unavailable',
] as const;
const DIAGNOSTIC_CODES = [
  'binding-invalid',
  'application-not-installed',
  'application-identity-mismatch',
  'application-version-incompatible',
  'endpoint-invalid',
  'endpoint-unavailable',
  'endpoint-outside-loopback',
  'permission-required',
  'profile-probe-failed',
] as const;

function exactRecord(
  value: unknown,
  allowedKeys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  const record = recordValue(value, label);
  const allowed = new Set(allowedKeys);
  const extra = Object.keys(record).filter((key) => !allowed.has(key));
  if (extra.length > 0) invalid(`${label} contains unsupported fields: ${extra.join(', ')}.`);
  return record;
}

function recordValue(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} is invalid.`);
  return value as Readonly<Record<string, unknown>>;
}

function arrayValue(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) invalid(`${label} must be an array.`);
  return value;
}

function stringArray(value: unknown, label: string): readonly string[] {
  return arrayValue(value, label).map((item) => nonEmptyString(item, label));
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string') invalid(`${label} must be a string.`);
  return value;
}

function nonEmptyString(value: unknown, label: string): string {
  const input = stringValue(value, label).trim();
  if (!input) invalid(`${label} is required.`);
  return input;
}

function optionalNonEmptyString(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : nonEmptyString(value, label);
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') invalid(`${label} must be a boolean.`);
  return value;
}

function identity(value: unknown, label: string): string {
  const input = nonEmptyString(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(input)) invalid(`${label} is invalid.`);
  return input;
}

function optionalIdentity(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : identity(value, label);
}

function oneOf<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) invalid(`${label} is invalid.`);
  return value as T[number];
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) invalid(`${label} entries must be unique.`);
}

function invalid(message: string): never {
  throw new ProfessionalApplicationContractError(
    'professional-application-payload-invalid',
    message,
  );
}
