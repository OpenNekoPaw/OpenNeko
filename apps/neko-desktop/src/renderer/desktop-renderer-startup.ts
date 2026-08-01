import type {
  DesktopApplicationSettingsProjection,
  OpenNekoDesktopApplicationSettingsBridge,
} from '../shared/application-settings-contract';
import type { OpenNekoDesktopBridge } from '../shared/bridge-contract';
import { loadDesktopAgentWebviewRootModule } from './desktop-agent-module';

export interface DesktopRendererStartupBridge {
  readonly bootstrap: OpenNekoDesktopBridge['bootstrap'];
  readonly settings: Pick<OpenNekoDesktopApplicationSettingsBridge['settings'], 'get'>;
}

export interface DesktopRendererStartupResources {
  readonly preloadAgentModule: () => Promise<unknown>;
}

const desktopRendererStartupResources: DesktopRendererStartupResources = {
  preloadAgentModule: loadDesktopAgentWebviewRootModule,
};

export async function initializeDesktopRendererBridge(
  bridge: DesktopRendererStartupBridge,
  resources: DesktopRendererStartupResources = desktopRendererStartupResources,
): Promise<DesktopApplicationSettingsProjection> {
  const [, settings] = await Promise.all([
    bridge.bootstrap.get(),
    bridge.settings.get(),
    resources.preloadAgentModule(),
  ]);
  return settings;
}
