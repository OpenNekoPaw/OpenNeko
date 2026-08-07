import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
  DesktopApplicationSettingsContractError,
  createDesktopApplicationSettingsUpdateRequest,
  parseDesktopApplicationPreferences,
  parseDesktopApplicationSettingsProjectionEvent,
  parseDesktopApplicationSettingsResponse,
} from './application-settings-contract';

describe('Desktop application settings contract', () => {
  it('creates a canonical update from semantic fields only', () => {
    expect(
      createDesktopApplicationSettingsUpdateRequest(
        'settings-update-1',
        DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
      ),
    ).toEqual({
      requestId: 'settings-update-1',
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
      eventSequence: 1,
      preferences: DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
    };
    expect(() =>
      parseDesktopApplicationSettingsResponse(
        {
          requestId: 'response-2',
          projection,
        },
        'request-1',
      ),
    ).toThrow(/does not match/);
    expect(() =>
      parseDesktopApplicationSettingsProjectionEvent({
        sequence: 2,
        projection,
      }),
    ).toThrow(/must match/);
  });
});
