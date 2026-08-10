import type { AutomationPermission } from '@neko/automation-contracts';
import {
  createAutomationPermissionManagementService,
  type AutomationHostPermissionPort,
  type AutomationPermissionManagementService,
} from '@neko/automation-node';

type DesktopScreenRecordingStatus =
  'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';

const MACOS_SCREEN_RECORDING_SETTINGS =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';

export interface DesktopAutomationHostPermission {
  readonly runtime: AutomationHostPermissionPort;
  readonly management: AutomationPermissionManagementService;
}

export function createDesktopAutomationHostPermission(options: {
  readonly platform: NodeJS.Platform;
  readonly getScreenRecordingStatus: () => DesktopScreenRecordingStatus;
  readonly isAccessibilityTrusted: (prompt: boolean) => boolean;
  readonly openExternal: (uri: string) => Promise<void>;
}): DesktopAutomationHostPermission {
  const runtime: AutomationHostPermissionPort = {
    async query(input) {
      requireMatchingPermissionTarget(input.provider.kind, input.target.kind);
      if (input.provider.kind !== 'computer') {
        return 'unsupported';
      }
      return queryMacOsPermission(input.permission, options);
    },
  };
  const management = createAutomationPermissionManagementService({
    query: (permission) => Promise.resolve(queryMacOsPermission(permission, options)),
    requestAction(permission) {
      if (options.platform !== 'darwin' || permission === 'input-control') {
        return 'unsupported';
      }
      return permission === 'screen-recording' ? 'open-system-settings' : 'prompt';
    },
    async request(permission) {
      if (options.platform !== 'darwin') {
        throw new Error('Automation OS permissions are unavailable on this Host.');
      }
      switch (permission) {
        case 'screen-recording':
          await options.openExternal(MACOS_SCREEN_RECORDING_SETTINGS);
          return;
        case 'accessibility':
          options.isAccessibilityTrusted(true);
          return;
        case 'input-control':
          throw new Error('Automation Input Control permission is not qualified.');
      }
    },
  });
  return Object.freeze({ runtime: Object.freeze(runtime), management });
}

function requireMatchingPermissionTarget(providerKind: string, targetKind: string): void {
  if (providerKind !== targetKind) {
    throw new Error('Automation Host permission target does not match the provider.');
  }
}

function queryMacOsPermission(
  permission: AutomationPermission,
  options: {
    readonly platform: NodeJS.Platform;
    readonly getScreenRecordingStatus: () => DesktopScreenRecordingStatus;
    readonly isAccessibilityTrusted: (prompt: boolean) => boolean;
  },
): 'granted' | 'denied' | 'not-determined' | 'unsupported' {
  if (options.platform !== 'darwin') return 'unsupported';
  switch (permission) {
    case 'screen-recording': {
      const status = options.getScreenRecordingStatus();
      switch (status) {
        case 'granted':
        case 'denied':
        case 'not-determined':
          return status;
        case 'restricted':
          return 'denied';
        case 'unknown':
          return 'unsupported';
      }
      throw new Error(`Unsupported macOS Screen Recording status '${String(status)}'.`);
    }
    case 'accessibility':
      return options.isAccessibilityTrusted(false) ? 'granted' : 'denied';
    case 'input-control':
      return 'unsupported';
  }
}
