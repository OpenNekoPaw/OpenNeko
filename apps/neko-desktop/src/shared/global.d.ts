import type { OpenNekoDesktopBridge } from './bridge-contract';
import type { OpenNekoDshPermissionBridge } from '@neko/agent-contracts/dsh-permission-host';
import type { OpenNekoDshSessionBridge } from '@neko/agent-contracts/dsh-session-host';
import type { OpenNekoDshRuntimeBridge } from '@neko/agent-contracts/dsh-runtime-host';
import type { OpenNekoDesktopShellBridge } from '@neko/host/desktop-shell-contract';
import type { OpenNekoDesktopResourceBrowserBridge } from './resource-browser-bridge-contract';
import type { OpenNekoDesktopPreviewBridge } from './preview-bridge-contract';
import type { OpenNekoDesktopTextEditorBridge } from '@neko/text-editor-domain';
import type { OpenNekoDesktopCanvasBridge } from './canvas-bridge-contract';
import type { OpenNekoDesktopCutBridge } from './cut-bridge-contract';
import type { OpenNekoDesktopApplicationSettingsBridge } from '@neko/host/application-settings';
import type { OpenNekoDesktopAiModelSettingsBridge } from '@neko/host/ai-model-settings';
import type { OpenNekoDesktopStorageSettingsBridge } from '@neko/host/desktop-storage-settings-contract';
import type { OpenNekoDesktopProjectPortabilityBridge } from '@neko/assets-domain/contracts';
import type {
  OpenNekoDesktopProjectAuthoringBridge,
  OpenNekoDesktopProjectLocalAuthoringBridge,
} from '@neko/project/contracts';
import type { OpenNekoAssetCenterBridge } from '@neko/assets-domain/asset-center/host-contract';
import type { OpenNekoAgentExtensionManagementBridge } from '@neko/agent-contracts/extension-management-host';
import type { OpenNekoProfessionalApplicationBridge } from '@neko/professional-apps-contracts/host';
import type { OpenNekoDesktopWorkspaceGrantBridge } from '@neko/host/desktop-workspace-grant-contract';
import type {
  OpenNekoDesktopCharacterBridge,
  OpenNekoDesktopCharacterAuthoringBridge,
  OpenNekoDesktopCharacterPortableBridge,
  OpenNekoDesktopCharacterAvatarBridge,
  OpenNekoDesktopCharacterRoomWorkbenchBridge,
} from '@neko/chara/contracts';
import type {
  OpenNekoDesktopWorldAuthoringBridge,
  OpenNekoDesktopWorldManagementBridge,
  OpenNekoDesktopWorldPortableBridge,
  OpenNekoDesktopWorldRuntimeBridge,
} from '@neko/world/contracts';

declare global {
  interface Window {
    readonly openNekoDesktop: OpenNekoDesktopBridge &
      OpenNekoDshPermissionBridge &
      OpenNekoDshRuntimeBridge &
      OpenNekoDshSessionBridge &
      OpenNekoDesktopShellBridge &
      OpenNekoDesktopResourceBrowserBridge &
      OpenNekoDesktopPreviewBridge &
      OpenNekoDesktopTextEditorBridge &
      OpenNekoDesktopCanvasBridge &
      OpenNekoDesktopCutBridge &
      OpenNekoAssetCenterBridge &
      OpenNekoDesktopWorkspaceGrantBridge &
      OpenNekoAgentExtensionManagementBridge &
      OpenNekoProfessionalApplicationBridge &
      OpenNekoDesktopApplicationSettingsBridge &
      OpenNekoDesktopAiModelSettingsBridge &
      OpenNekoDesktopStorageSettingsBridge &
      OpenNekoDesktopProjectPortabilityBridge &
      OpenNekoDesktopProjectAuthoringBridge &
      OpenNekoDesktopProjectLocalAuthoringBridge &
      OpenNekoDesktopCharacterBridge &
      OpenNekoDesktopCharacterAuthoringBridge &
      OpenNekoDesktopCharacterPortableBridge &
      OpenNekoDesktopWorldManagementBridge &
      OpenNekoDesktopWorldAuthoringBridge &
      OpenNekoDesktopWorldPortableBridge &
      OpenNekoDesktopWorldRuntimeBridge &
      OpenNekoDesktopCharacterAvatarBridge &
      OpenNekoDesktopCharacterRoomWorkbenchBridge;
  }
}

export {};
