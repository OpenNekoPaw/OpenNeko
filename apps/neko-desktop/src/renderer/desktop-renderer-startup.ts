import type {
  DesktopApplicationSettingsProjection,
  OpenNekoDesktopApplicationSettingsBridge,
} from '@neko/host/application-settings';
import type { OpenNekoDesktopBridge } from '../shared/bridge-contract';

export interface DesktopRendererStartupBridge {
  readonly bootstrap: OpenNekoDesktopBridge['bootstrap'];
  readonly settings: Pick<OpenNekoDesktopApplicationSettingsBridge['settings'], 'get'>;
}

export async function initializeDesktopRendererBridge(
  bridge: DesktopRendererStartupBridge,
): Promise<DesktopApplicationSettingsProjection> {
  const [, settings] = await Promise.all([
    bridge.bootstrap.get(),
    bridge.settings.get(),
  ]);
  return settings;
}
