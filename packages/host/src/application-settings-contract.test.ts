import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
  DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
  DesktopApplicationSettingsContractError,
  createDesktopApplicationSettingsUpdateRequest,
  parseDesktopApplicationPreferences,
  parseDesktopApplicationSettingsProjectionEvent,
  parseDesktopApplicationSettingsResponse,
} from './application-settings-contract';

describe('Desktop application settings contract', () => {
  it('creates and parses a complete versioned update', () => {
    expect(
      createDesktopApplicationSettingsUpdateRequest(
        'settings-update-1',
        3,
        DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
      ),
    ).toEqual({
      schemaVersion: DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
      requestId: 'settings-update-1',
      expectedRevision: 3,
      preferences: DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
    });
  });

  it('rejects Agent, project, and secret fields from Desktop preferences', () => {
    for (const field of ['providers', 'workspacePath', 'apiKey']) {
      expect(() =>
        parseDesktopApplicationPreferences({
          ...DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
          [field]: 'must-not-cross-authority',
        }),
      ).toThrow(DesktopApplicationSettingsContractError);
    }
  });

  it('rejects mismatched response identities and event sequences', () => {
    const projection = {
      schemaVersion: DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
      revision: 1,
      eventSequence: 1,
      preferences: DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
    };
    expect(() =>
      parseDesktopApplicationSettingsResponse(
        {
          schemaVersion: DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
          requestId: 'response-2',
          projection,
        },
        'request-1',
      ),
    ).toThrow(/does not match/);
    expect(() =>
      parseDesktopApplicationSettingsProjectionEvent({
        schemaVersion: DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
        sequence: 2,
        projection,
      }),
    ).toThrow(/must match/);
  });
});
