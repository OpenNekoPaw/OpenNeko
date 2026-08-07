import {
  DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
  DesktopApplicationSettingsContractError,
  parseDesktopApplicationPreferences,
} from './application-settings-contract';
import type { DesktopStoredStateMetadataRetainedDiagnosticProjection } from './desktop-shell-contract';
import type { DesktopApplicationSettingsStoredState } from './application-settings-service';

type DesktopRetainedSettingsMetadataEntry = readonly [fieldName: string, value: unknown];

const RETAINED_SETTINGS_METADATA: unique symbol = Symbol('desktop-retained-settings-metadata');
const APPLICATION_SETTINGS_ROOT_FIELDS = new Set<string>(['preferences']);

type DesktopApplicationSettingsStateWithRetainedMetadata = DesktopApplicationSettingsStoredState & {
  readonly [RETAINED_SETTINGS_METADATA]: readonly DesktopRetainedSettingsMetadataEntry[];
};

export function createDefaultDesktopApplicationSettingsState(): DesktopApplicationSettingsStoredState {
  return {
    preferences: DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
  };
}

export function parseDesktopApplicationSettingsStoredState(
  value: unknown,
): DesktopApplicationSettingsStoredState {
  if (!isUnknownRecord(value)) {
    throw invalidState('Desktop application settings must be an object.');
  }
  const retainedMetadata = validateRetainedSettingsMetadata([
    ...readRetainedSettingsMetadata(value),
    ...Object.entries(value).filter(
      ([fieldName]) => !APPLICATION_SETTINGS_ROOT_FIELDS.has(fieldName),
    ),
  ]);
  const parsed: DesktopApplicationSettingsStateWithRetainedMetadata = {
    preferences: parseDesktopApplicationPreferences(value['preferences']),
    [RETAINED_SETTINGS_METADATA]: retainedMetadata,
  };
  return parsed;
}

export function readDesktopApplicationSettingsStateDiagnostics(
  state: DesktopApplicationSettingsStoredState,
): readonly DesktopStoredStateMetadataRetainedDiagnosticProjection[] {
  const retainedMetadata = readRetainedSettingsMetadata(state);
  if (retainedMetadata.length === 0) return [];
  const fieldNames = retainedMetadata.map(([fieldName]) => fieldName);
  return [
    {
      code: 'desktop-stored-state-metadata-retained',
      severity: 'warning',
      authorityKey: 'desktop.application-settings',
      fieldNames,
      message: `Desktop application settings metadata was preserved without interpretation: ${fieldNames
        .map((fieldName) => JSON.stringify(fieldName))
        .join(', ')}.`,
    },
  ];
}

export function serializeDesktopApplicationSettingsStoredState(
  state: DesktopApplicationSettingsStoredState,
): unknown {
  const parsed = parseDesktopApplicationSettingsStoredState(state);
  return {
    ...Object.fromEntries(readRetainedSettingsMetadata(parsed)),
    preferences: parsed.preferences,
  };
}

function readRetainedSettingsMetadata(
  value: unknown,
): readonly DesktopRetainedSettingsMetadataEntry[] {
  if (!isUnknownRecord(value) || !(RETAINED_SETTINGS_METADATA in value)) return [];
  const retained = value[RETAINED_SETTINGS_METADATA];
  if (!Array.isArray(retained)) {
    throw invalidState('Desktop retained application settings metadata must be an array.');
  }
  return validateRetainedSettingsMetadata(retained);
}

function validateRetainedSettingsMetadata(
  entries: readonly unknown[],
): readonly DesktopRetainedSettingsMetadataEntry[] {
  const fieldNames = new Set<string>();
  const retained: DesktopRetainedSettingsMetadataEntry[] = [];
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') {
      throw invalidState('Desktop retained application settings metadata entry is invalid.');
    }
    const fieldName = entry[0];
    if (APPLICATION_SETTINGS_ROOT_FIELDS.has(fieldName) || fieldNames.has(fieldName)) {
      throw invalidState(
        `Desktop retained application settings metadata field '${fieldName}' is duplicated.`,
      );
    }
    fieldNames.add(fieldName);
    retained.push([fieldName, entry[1]]);
  }
  return retained;
}

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidState(message: string): DesktopApplicationSettingsContractError {
  return new DesktopApplicationSettingsContractError(
    'invalid-desktop-application-settings-payload',
    message,
  );
}
