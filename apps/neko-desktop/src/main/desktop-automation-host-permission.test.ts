import { describe, expect, it, vi } from 'vitest';
import type { AutomationProviderIdentity, AutomationTarget } from '@neko/automation-contracts';
import { createDesktopAutomationHostPermission } from './desktop-automation-host-permission';

const provider: AutomationProviderIdentity = {
  extensionId: 'computer-use',
  providerId: 'cua-driver',
  kind: 'computer',
  deliverySource: { kind: 'bundled-adapter' },
};

const target: AutomationTarget = {
  kind: 'computer',
  targetKey: 'target-1',
  applicationId: 'fixture-app',
  processId: 42,
  windowId: '7',
  label: 'Fixture',
  region: { x: 0, y: 0, width: 800, height: 600 },
};

describe('Desktop Automation Host permission', () => {
  it('queries current macOS Screen Recording and Accessibility facts without prompting', async () => {
    const getScreenRecordingStatus = vi.fn(() => 'granted' as const);
    const isAccessibilityTrusted = vi.fn(() => false);
    const host = createDesktopAutomationHostPermission({
      platform: 'darwin',
      getScreenRecordingStatus,
      isAccessibilityTrusted,
      openExternal: async () => undefined,
    });

    await expect(
      host.runtime.query({ provider, target, permission: 'screen-recording' }),
    ).resolves.toBe('granted');
    await expect(
      host.runtime.query({ provider, target, permission: 'accessibility' }),
    ).resolves.toBe('denied');
    await expect(
      host.runtime.query({ provider, target, permission: 'input-control' }),
    ).resolves.toBe('unsupported');
    expect(getScreenRecordingStatus).toHaveBeenCalledOnce();
    expect(isAccessibilityTrusted).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('maps restricted and unknown Screen Recording states without inventing a grant', async () => {
    const getScreenRecordingStatus = vi
      .fn<() => 'restricted' | 'unknown'>()
      .mockReturnValueOnce('restricted')
      .mockReturnValueOnce('unknown');
    const host = createDesktopAutomationHostPermission({
      platform: 'darwin',
      getScreenRecordingStatus,
      isAccessibilityTrusted: () => true,
      openExternal: async () => undefined,
    });

    await expect(
      host.runtime.query({ provider, target, permission: 'screen-recording' }),
    ).resolves.toBe('denied');
    await expect(
      host.runtime.query({ provider, target, permission: 'screen-recording' }),
    ).resolves.toBe('unsupported');
  });

  it('keeps unsupported platforms unavailable and rejects target substitution locally', async () => {
    const getScreenRecordingStatus = vi.fn(() => 'granted' as const);
    const host = createDesktopAutomationHostPermission({
      platform: 'win32',
      getScreenRecordingStatus,
      isAccessibilityTrusted: () => true,
      openExternal: async () => undefined,
    });

    await expect(
      host.runtime.query({ provider, target, permission: 'screen-recording' }),
    ).resolves.toBe('unsupported');
    expect(getScreenRecordingStatus).not.toHaveBeenCalled();
    await expect(
      host.runtime.query({
        provider,
        target: {
          kind: 'browser',
          targetKey: 'browser-target',
          browserProfileId: 'profile-1',
          browserSessionId: 'session-1',
          tabId: 'tab-1',
          origin: 'https://example.test',
          allowedDomains: ['example.test'],
          label: 'Example',
        },
        permission: 'screen-recording',
      }),
    ).rejects.toThrow('target does not match the provider');
  });

  it('opens Screen Recording settings only after the explicit permission request', async () => {
    const openExternal = vi.fn(async () => undefined);
    const isAccessibilityTrusted = vi.fn(() => false);
    const host = createDesktopAutomationHostPermission({
      platform: 'darwin',
      getScreenRecordingStatus: () => 'not-determined',
      isAccessibilityTrusted,
      openExternal,
    });

    await host.management.list();
    expect(openExternal).not.toHaveBeenCalled();
    expect(isAccessibilityTrusted).toHaveBeenCalledWith(false);
    await host.management.request('screen-recording');
    expect(openExternal).toHaveBeenCalledExactlyOnceWith(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
    );
    expect(isAccessibilityTrusted).not.toHaveBeenCalledWith(true);
  });

  it('prompts Accessibility only after the explicit request and keeps Input Control unavailable', async () => {
    const isAccessibilityTrusted = vi.fn(() => false);
    const host = createDesktopAutomationHostPermission({
      platform: 'darwin',
      getScreenRecordingStatus: () => 'denied',
      isAccessibilityTrusted,
      openExternal: async () => undefined,
    });

    await host.management.request('accessibility');
    expect(isAccessibilityTrusted).toHaveBeenCalledWith(true);
    await expect(host.management.request('input-control')).rejects.toThrow('cannot be requested');
  });
});
