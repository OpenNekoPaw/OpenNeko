import { describe, expect, it, vi } from 'vitest';
import { createAutomationPermissionManagementService } from './permission-management';

describe('Automation permission management service', () => {
  it('queries each permission without triggering a request', async () => {
    const request = vi.fn(async () => undefined);
    const service = createAutomationPermissionManagementService({
      query: async (permission) => (permission === 'screen-recording' ? 'granted' : 'denied'),
      requestAction: (permission) =>
        permission === 'screen-recording'
          ? 'open-system-settings'
          : permission === 'accessibility'
            ? 'prompt'
            : 'unsupported',
      request,
    });

    await expect(service.list()).resolves.toMatchObject([
      { permission: 'screen-recording', status: 'granted' },
      { permission: 'accessibility', status: 'denied' },
      { permission: 'input-control', status: 'denied' },
    ]);
    expect(request).not.toHaveBeenCalled();
  });

  it('requests only one explicit supported permission and returns fresh facts', async () => {
    let accessibility = false;
    const request = vi.fn(async (permission: string) => {
      if (permission === 'accessibility') accessibility = true;
    });
    const service = createAutomationPermissionManagementService({
      query: async (permission) =>
        permission === 'accessibility' && accessibility ? 'granted' : 'denied',
      requestAction: (permission) => (permission === 'accessibility' ? 'prompt' : 'unsupported'),
      request,
    });

    await expect(service.request('accessibility')).resolves.toContainEqual(
      expect.objectContaining({ permission: 'accessibility', status: 'granted' }),
    );
    expect(request).toHaveBeenCalledExactlyOnceWith('accessibility');
    await expect(service.request('input-control')).rejects.toThrow('cannot be requested');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('isolates one query failure while preserving sibling permission facts', async () => {
    const service = createAutomationPermissionManagementService({
      query: async (permission) => {
        if (permission === 'accessibility') throw new Error('TCC query failed');
        return permission === 'screen-recording' ? 'not-determined' : 'unsupported';
      },
      requestAction: () => 'unsupported',
      request: async () => undefined,
    });

    await expect(service.list()).resolves.toEqual([
      {
        permission: 'screen-recording',
        status: 'not-determined',
        requestAction: 'unsupported',
        diagnostics: [],
      },
      {
        permission: 'accessibility',
        status: 'error',
        requestAction: 'unsupported',
        diagnostics: ['query-failed'],
      },
      {
        permission: 'input-control',
        status: 'unsupported',
        requestAction: 'unsupported',
        diagnostics: [],
      },
    ]);
  });
});
