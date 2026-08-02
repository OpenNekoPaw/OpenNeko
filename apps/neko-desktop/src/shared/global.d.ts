import type { OpenNekoDesktopBridge } from './bridge-contract';
import type { OpenNekoDesktopAgentBridge } from './agent-contract';
import type { OpenNekoDesktopAgentAutomationBridge } from './agent-automation-contract';
import type { OpenNekoDesktopShellBridge } from './shell-contract';
import type { OpenNekoDesktopResourceBrowserBridge } from './resource-browser-bridge-contract';
import type { OpenNekoDesktopPreviewBridge } from './preview-bridge-contract';
import type { OpenNekoDesktopCanvasBridge } from './canvas-bridge-contract';
import type { OpenNekoDesktopCutBridge } from './cut-bridge-contract';
import type { OpenNekoDesktopHomeManagementBridge } from './home-management-contract';
import type { OpenNekoDesktopApplicationSettingsBridge } from '@neko/host/application-settings';
import type { OpenNekoDesktopProjectPortabilityBridge } from '@neko/assets-domain/contracts';

declare global {
  interface Window {
    readonly openNekoDesktop: OpenNekoDesktopBridge &
      OpenNekoDesktopShellBridge &
      OpenNekoDesktopAgentBridge &
      OpenNekoDesktopAgentAutomationBridge &
      OpenNekoDesktopResourceBrowserBridge &
      OpenNekoDesktopPreviewBridge &
      OpenNekoDesktopCanvasBridge &
      OpenNekoDesktopCutBridge &
      OpenNekoDesktopHomeManagementBridge &
      OpenNekoDesktopApplicationSettingsBridge &
      OpenNekoDesktopProjectPortabilityBridge;
  }
}

export {};
