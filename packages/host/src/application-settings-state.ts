import {
  DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
  DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
  DesktopApplicationSettingsContractError,
  parseDesktopApplicationPreferences,
} from './application-settings-contract';
import type { DesktopApplicationSettingsStoredState } from './application-settings-service';

export function createDefaultDesktopApplicationSettingsState(): DesktopApplicationSettingsStoredState {
  return {
    schemaVersion: DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
    storageRevision: 0,
    preferences: DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
  };
}

export function parseDesktopApplicationSettingsStoredState(
  value: unknown,
): DesktopApplicationSettingsStoredState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidState('Desktop application settings must be an object.');
  }
  const record = value as Readonly<Record<string, unknown>>;
  const keys = Object.keys(record).sort();
  const expected = ['preferences', 'schemaVersion', 'storageRevision'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw invalidState(`Desktop application settings have unexpected fields: ${keys.join(', ')}.`);
  }
  const schemaVersion = record['schemaVersion'];
  if (schemaVersion !== 1 && schemaVersion !== DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION) {
    throw new DesktopApplicationSettingsContractError(
      'unsupported-desktop-application-settings-version',
      `Unsupported Desktop application settings version '${String(schemaVersion)}'.`,
    );
  }
  const storageRevision = parseStorageRevision(record['storageRevision']);
  if (schemaVersion === 1) {
    const migratedPreferences = parseDesktopApplicationPreferences(record['preferences']);
    return {
      schemaVersion: DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
      storageRevision,
      preferences: {
        ...migratedPreferences,
        startupTarget: 'home',
      },
    };
  }
  return {
    schemaVersion: DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
    storageRevision,
    preferences: parseDesktopApplicationPreferences(record['preferences']),
  };
}

function parseStorageRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw invalidState('Desktop application settings storage revision is invalid.');
  }
  return value;
}

function invalidState(message: string): DesktopApplicationSettingsContractError {
  return new DesktopApplicationSettingsContractError(
    'invalid-desktop-application-settings-payload',
    message,
  );
}
