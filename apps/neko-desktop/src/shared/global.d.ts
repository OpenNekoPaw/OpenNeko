import type { OpenNekoDesktopBridge } from './bridge-contract';
import type { OpenNekoDesktopAgentBridge } from './agent-contract';
import type { OpenNekoDesktopShellBridge } from './shell-contract';
import type { OpenNekoDesktopResourceBrowserBridge } from './resource-browser-bridge-contract';
import type { OpenNekoDesktopPreviewBridge } from './preview-bridge-contract';
import type { OpenNekoDesktopCanvasBridge } from './canvas-bridge-contract';
import type { OpenNekoDesktopCutBridge } from './cut-bridge-contract';
import type { OpenNekoDesktopHomeManagementBridge } from './home-management-contract';

declare global {
  interface Window {
    readonly openNekoDesktop: OpenNekoDesktopBridge &
      OpenNekoDesktopShellBridge &
      OpenNekoDesktopAgentBridge &
      OpenNekoDesktopResourceBrowserBridge &
      OpenNekoDesktopPreviewBridge &
      OpenNekoDesktopCanvasBridge &
      OpenNekoDesktopCutBridge &
      OpenNekoDesktopHomeManagementBridge;
  }
}

export {};
