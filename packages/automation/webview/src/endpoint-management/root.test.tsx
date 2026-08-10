// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  AutomationEndpointManagementProjection,
  AutomationEndpointManagementRuntime,
} from '@neko/automation-contracts/endpoint-management';
import { AutomationEndpointManagementRoot } from './root';

vi.mock('@neko/ui/i18n/react', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('AutomationEndpointManagementRoot', () => {
  it('configures a user-managed endpoint without offering service lifecycle actions', async () => {
    const runtime = fixtureRuntime();
    render(
      <AutomationEndpointManagementRoot confirmAction={() => true} interactive runtime={runtime} />,
    );

    await screen.findByText('Browser Use 0.13.7');
    fireEvent.click(screen.getByText('home.capabilities.endpoint.configure'));
    fireEvent.change(screen.getByPlaceholderText('http://127.0.0.1:8000/mcp'), {
      target: { value: 'http://127.0.0.1:8931/mcp' },
    });
    fireEvent.change(screen.getByLabelText('home.capabilities.endpoint.authorization'), {
      target: { value: 'bearer' },
    });
    fireEvent.change(screen.getByLabelText('home.capabilities.endpoint.secret'), {
      target: { value: 'host-secret' },
    });
    fireEvent.click(screen.getByText('home.capabilities.endpoint.saveAndCheck'));

    await waitFor(() =>
      expect(runtime.configure).toHaveBeenCalledWith(
        expect.objectContaining({
          connectorId: 'browser-use.observe.endpoint',
          url: 'http://127.0.0.1:8931/mcp',
          authorization: { kind: 'bearer', secret: 'host-secret' },
        }),
      ),
    );
    expect(screen.queryByText(/start|stop|update service/iu)).toBeNull();
  });
});

function fixtureRuntime(): AutomationEndpointManagementRuntime {
  const projection: AutomationEndpointManagementProjection = {
    identity: { windowId: 'window-1' },
    endpoints: [
      {
        connectorId: 'browser-use.observe.endpoint',
        displayName: 'Browser Use 0.13.7',
        providerKind: 'browser',
        upstreamRelease: '0.13.7',
        configured: false,
        endpointId: '',
        endpointUrl: '',
        authorizationState: 'not-configured',
        healthStatus: 'not-checked',
        providerStatus: 'unchecked',
        qualificationStatus: 'unqualified',
        diagnostics: [],
      },
    ],
  };
  return {
    identity: projection.identity,
    getSnapshot: async () => projection,
    configure: vi.fn(async () => projection),
    remove: vi.fn(async () => projection),
    dispose: vi.fn(),
  };
}
