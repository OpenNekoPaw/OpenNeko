// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  AutomationPermissionManagementProjection,
  AutomationPermissionManagementRuntime,
} from '@neko/automation-contracts/permission-management';
import { AutomationPermissionManagementRoot } from './root';

vi.mock('@neko/ui/i18n/react', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('AutomationPermissionManagementRoot', () => {
  it('queries without prompting and requests only the permission selected by the user', async () => {
    const projection = fixtureProjection();
    const request = vi.fn(async () => ({
      ...projection,
      permissions: projection.permissions.map((permission) =>
        permission.permission === 'accessibility'
          ? { ...permission, status: 'granted' as const }
          : permission,
      ),
    }));
    const runtime: AutomationPermissionManagementRuntime = {
      identity: projection.identity,
      getSnapshot: vi.fn(async () => projection),
      request,
      dispose: vi.fn(),
    };

    render(<AutomationPermissionManagementRoot interactive runtime={runtime} />);
    expect(
      await screen.findByText('home.capabilities.osPermission.permission.screen-recording'),
    ).toBeTruthy();
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'home.capabilities.osPermission.action.prompt' }),
    );
    await waitFor(() => expect(request).toHaveBeenCalledExactlyOnceWith('accessibility'));
    expect(
      screen.queryByRole('button', { name: 'home.capabilities.osPermission.action.prompt' }),
    ).toBeNull();
    expect(
      screen.queryByText('home.capabilities.osPermission.permission.input-control'),
    ).toBeTruthy();
  });
});

function fixtureProjection(): AutomationPermissionManagementProjection {
  return {
    identity: { windowId: 'window-1' },
    permissions: [
      {
        permission: 'screen-recording',
        status: 'not-determined',
        requestAction: 'open-system-settings',
        diagnostics: [],
      },
      {
        permission: 'accessibility',
        status: 'denied',
        requestAction: 'prompt',
        diagnostics: [],
      },
      {
        permission: 'input-control',
        status: 'unsupported',
        requestAction: 'unsupported',
        diagnostics: [],
      },
    ],
  };
}
