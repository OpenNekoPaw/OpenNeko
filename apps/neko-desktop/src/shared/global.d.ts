import type { OpenNekoDesktopBridge } from './bridge-contract';
import type { OpenNekoDesktopAgentBridge } from './agent-contract';
import type { OpenNekoDesktopAgentAutomationBridge } from './agent-automation-contract';
import type { OpenNekoDesktopShellBridge } from '@neko/host/desktop-shell-contract';
import type { OpenNekoDesktopResourceBrowserBridge } from './resource-browser-bridge-contract';
import type { OpenNekoDesktopPreviewBridge } from './preview-bridge-contract';
import type { OpenNekoDesktopTextEditorBridge } from '@neko/text-editor-domain';
import type { OpenNekoDesktopCanvasBridge } from './canvas-bridge-contract';
import type { OpenNekoDesktopCutBridge } from './cut-bridge-contract';
import type { OpenNekoDesktopApplicationSettingsBridge } from '@neko/host/application-settings';
import type { OpenNekoDesktopProjectPortabilityBridge } from '@neko/assets-domain/contracts';
import type { OpenNekoAssetCenterBridge } from '@neko/assets-domain/asset-center/host-contract';
import type { OpenNekoAgentExtensionManagementBridge } from '@neko/agent-contracts/extension-management-host';
import type { OpenNekoAgentLaunchBridge } from '@neko/agent-contracts/agent-launch-host';
import type { OpenNekoAssistantResourceBridge } from '@neko/agent-contracts/assistant-resource-host';
import type { OpenNekoDesktopWorkspaceGrantBridge } from '@neko/host/desktop-workspace-grant-contract';
import type {
  OpenNekoDesktopCharacterBridge,
  OpenNekoDesktopCharacterRoomWorkbenchBridge,
} from '@neko/chara/contracts';

declare global {
  interface Window {
    readonly openNekoDesktop: OpenNekoDesktopBridge &
      OpenNekoDesktopShellBridge &
      OpenNekoDesktopAgentBridge &
      OpenNekoDesktopAgentAutomationBridge &
      OpenNekoDesktopResourceBrowserBridge &
      OpenNekoDesktopPreviewBridge &
      OpenNekoDesktopTextEditorBridge &
      OpenNekoDesktopCanvasBridge &
      OpenNekoDesktopCutBridge &
      OpenNekoAssetCenterBridge &
      OpenNekoAgentLaunchBridge &
      OpenNekoAssistantResourceBridge &
      OpenNekoDesktopWorkspaceGrantBridge &
      OpenNekoAgentExtensionManagementBridge &
      OpenNekoDesktopApplicationSettingsBridge &
      OpenNekoDesktopProjectPortabilityBridge &
      OpenNekoDesktopCharacterBridge &
      OpenNekoDesktopCharacterRoomWorkbenchBridge;
  }
}

export {};
