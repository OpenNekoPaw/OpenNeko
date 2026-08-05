import {
  DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
  DesktopApplicationSettingsContractError,
  parseDesktopApplicationPreferences,
} from './application-settings-contract';
import type { DesktopApplicationSettingsStoredState } from './application-settings-service';

export function createDefaultDesktopApplicationSettingsState(): DesktopApplicationSettingsStoredState {
  return {
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
  const expected = ['preferences'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw invalidState(`Desktop application settings have unexpected fields: ${keys.join(', ')}.`);
  }
  return {
    preferences: parseDesktopApplicationPreferences(record['preferences']),
  };
}

function invalidState(message: string): DesktopApplicationSettingsContractError {
  return new DesktopApplicationSettingsContractError(
    'invalid-desktop-application-settings-payload',
    message,
  );
}
