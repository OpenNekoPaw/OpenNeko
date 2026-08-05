export const DESKTOP_APPLICATION_SETTINGS_CHANNELS = {
  snapshotGet: 'openneko:desktop:settings:snapshot:get',
  update: 'openneko:desktop:settings:update',
  projectionEvent: 'openneko:desktop:settings:projection:event',
  agentAdvancedOpen: 'openneko:desktop:settings:agent-advanced:open',
} as const;

export type DesktopThemePreference = 'system' | 'light' | 'dark';
export type DesktopLocalePreference = 'system' | 'en' | 'zh-cn';
export type DesktopStartupTargetPreference = 'home' | 'restore';
export type DesktopResourceBrowserViewPreference = 'list' | 'grid';

export interface DesktopApplicationPreferences {
  readonly theme: DesktopThemePreference;
  readonly locale: DesktopLocalePreference;
  readonly startupTarget: DesktopStartupTargetPreference;
  readonly resourceBrowserView: DesktopResourceBrowserViewPreference;
}

export interface DesktopApplicationSettingsProjection {
  readonly eventSequence: number;
  readonly preferences: DesktopApplicationPreferences;
}

export interface DesktopApplicationSettingsRequest {
  readonly requestId: string;
}

export interface DesktopApplicationSettingsUpdateRequest extends DesktopApplicationSettingsRequest {
  readonly preferences: DesktopApplicationPreferences;
}

export interface DesktopApplicationSettingsResponse {
  readonly requestId: string;
  readonly projection: DesktopApplicationSettingsProjection;
}

export interface DesktopApplicationSettingsProjectionEvent {
  readonly sequence: number;
  readonly projection: DesktopApplicationSettingsProjection;
}

export interface DesktopAgentAdvancedSettingsResult {
  readonly requestId: string;
  readonly status: 'opened';
}

export interface OpenNekoDesktopApplicationSettingsBridge {
  readonly settings: {
    get(): Promise<DesktopApplicationSettingsProjection>;
    update(
      preferences: DesktopApplicationPreferences,
    ): Promise<DesktopApplicationSettingsProjection>;
    openAgentAdvanced(): Promise<void>;
    subscribe(listener: (event: DesktopApplicationSettingsProjectionEvent) => void): () => void;
  };
}

export class DesktopApplicationSettingsContractError extends Error {
  readonly code:
    | 'invalid-desktop-application-settings-payload'
    | 'desktop-application-settings-request-mismatch'
    | 'desktop-application-settings-event-sequence';

  constructor(code: DesktopApplicationSettingsContractError['code'], message: string) {
    super(message);
    this.name = 'DesktopApplicationSettingsContractError';
    this.code = code;
  }
}

export const DEFAULT_DESKTOP_APPLICATION_PREFERENCES: DesktopApplicationPreferences = {
  theme: 'light',
  locale: 'system',
  startupTarget: 'home',
  resourceBrowserView: 'list',
};

export function createDesktopApplicationSettingsRequest(
  requestId: string,
): DesktopApplicationSettingsRequest {
  return {
    requestId: requireNonEmptyString(requestId, 'Desktop settings requestId is required.'),
  };
}

export function createDesktopApplicationSettingsUpdateRequest(
  requestId: string,
  preferences: DesktopApplicationPreferences,
): DesktopApplicationSettingsUpdateRequest {
  return {
    ...createDesktopApplicationSettingsRequest(requestId),
    preferences: parseDesktopApplicationPreferences(preferences),
  };
}

export function parseDesktopApplicationSettingsRequest(
  value: unknown,
): DesktopApplicationSettingsRequest {
  const record = requireExactRecord(
    value,
    ['requestId'],
    'Desktop settings request must be an object.',
  );
  return createDesktopApplicationSettingsRequest(
    requireNonEmptyString(record['requestId'], 'Desktop settings requestId is required.'),
  );
}

export function parseDesktopApplicationSettingsUpdateRequest(
  value: unknown,
): DesktopApplicationSettingsUpdateRequest {
  const record = requireExactRecord(
    value,
    ['requestId', 'preferences'],
    'Desktop settings update request must be an object.',
  );
  return createDesktopApplicationSettingsUpdateRequest(
    requireNonEmptyString(record['requestId'], 'Desktop settings requestId is required.'),
    parseDesktopApplicationPreferences(record['preferences']),
  );
}

export function parseDesktopApplicationPreferences(value: unknown): DesktopApplicationPreferences {
  const record = requireExactRecord(
    value,
    ['theme', 'locale', 'startupTarget', 'resourceBrowserView'],
    'Desktop application preferences must be an object.',
  );
  return {
    theme: requireOneOf(record['theme'], ['system', 'light', 'dark'] as const, 'theme'),
    locale: requireOneOf(record['locale'], ['system', 'en', 'zh-cn'] as const, 'locale'),
    startupTarget: requireOneOf(
      record['startupTarget'],
      ['home', 'restore'] as const,
      'startupTarget',
    ),
    resourceBrowserView: requireOneOf(
      record['resourceBrowserView'],
      ['list', 'grid'] as const,
      'resourceBrowserView',
    ),
  };
}

function parseDesktopApplicationSettingsProjection(
  value: unknown,
): DesktopApplicationSettingsProjection {
  const record = requireExactRecord(
    value,
    ['eventSequence', 'preferences'],
    'Desktop settings projection must be an object.',
  );
  return {
    eventSequence: requireNonNegativeInteger(
      record['eventSequence'],
      'Desktop settings event sequence must be a non-negative integer.',
    ),
    preferences: parseDesktopApplicationPreferences(record['preferences']),
  };
}

export function parseDesktopApplicationSettingsResponse(
  value: unknown,
  expectedRequestId?: string,
): DesktopApplicationSettingsResponse {
  const record = requireExactRecord(
    value,
    ['requestId', 'projection'],
    'Desktop settings response must be an object.',
  );
  const requestId = requireNonEmptyString(
    record['requestId'],
    'Desktop settings response requestId is required.',
  );
  if (expectedRequestId !== undefined && requestId !== expectedRequestId) {
    throw new DesktopApplicationSettingsContractError(
      'desktop-application-settings-request-mismatch',
      `Desktop settings response '${requestId}' does not match request '${expectedRequestId}'.`,
    );
  }
  return {
    requestId,
    projection: parseDesktopApplicationSettingsProjection(record['projection']),
  };
}

export function parseDesktopApplicationSettingsProjectionEvent(
  value: unknown,
): DesktopApplicationSettingsProjectionEvent {
  const record = requireExactRecord(
    value,
    ['sequence', 'projection'],
    'Desktop settings projection event must be an object.',
  );
  const projection = parseDesktopApplicationSettingsProjection(record['projection']);
  const sequence = requireNonNegativeInteger(
    record['sequence'],
    'Desktop settings event sequence must be a non-negative integer.',
  );
  if (projection.eventSequence !== sequence) {
    throw invalidPayload(
      'Desktop settings event sequence must match its projection event sequence.',
    );
  }
  return {
    sequence,
    projection,
  };
}

export function parseDesktopAgentAdvancedSettingsResult(
  value: unknown,
  expectedRequestId?: string,
): DesktopAgentAdvancedSettingsResult {
  const record = requireExactRecord(
    value,
    ['requestId', 'status'],
    'Desktop Agent advanced settings result must be an object.',
  );
  const requestId = requireNonEmptyString(
    record['requestId'],
    'Desktop Agent advanced settings result requestId is required.',
  );
  if (expectedRequestId !== undefined && requestId !== expectedRequestId) {
    throw new DesktopApplicationSettingsContractError(
      'desktop-application-settings-request-mismatch',
      `Desktop Agent settings response '${requestId}' does not match request '${expectedRequestId}'.`,
    );
  }
  if (record['status'] !== 'opened') {
    throw invalidPayload('Desktop Agent advanced settings status must be opened.');
  }
  return {
    requestId,
    status: 'opened',
  };
}

function requireExactRecord(
  value: unknown,
  keys: readonly string[],
  message: string,
): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidPayload(message);
  }
  const record = value as Readonly<Record<string, unknown>>;
  const actualKeys = Object.keys(record).sort();
  const expectedKeys = [...keys].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw invalidPayload(
      `Desktop settings object has unexpected fields: ${actualKeys.join(', ')}.`,
    );
  }
  return record;
}

function requireNonEmptyString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalidPayload(message);
  }
  return value;
}

function requireNonNegativeInteger(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw invalidPayload(message);
  }
  return value;
}

function requireOneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw invalidPayload(`Desktop setting '${field}' has invalid value '${String(value)}'.`);
  }
  return value as T;
}

function invalidPayload(message: string): DesktopApplicationSettingsContractError {
  return new DesktopApplicationSettingsContractError(
    'invalid-desktop-application-settings-payload',
    message,
  );
}
