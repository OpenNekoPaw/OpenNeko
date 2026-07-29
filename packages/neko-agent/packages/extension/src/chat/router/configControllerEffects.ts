import type { AgentConfigControllerEffectPort } from '@neko/agent/runtime';
import type { VSCodeAgentHostControllerDeps } from './types';

export function createVSCodeConfigControllerEffects(
  deps: VSCodeAgentHostControllerDeps,
): AgentConfigControllerEffectPort {
  return {
    readSettings: (conversationId) =>
      deps.settingsHandler.sendSettings(deps.webview, { conversationId }),
    readConfig: () => deps.sendConfigState(),
    refreshConfig: () => deps.refreshConfigSnapshot(),
    openUserConfig: () => deps.openUserConfigFile(),
    openHostConfig: () => deps.fileOperationHandler.handleOpenConfigFile(),
    readTabState: () => deps.sendTabState(),
    updateSettings: ({ conversationId, settings }) =>
      deps.settingsHandler.handleUpdateSettings(deps.webview, { ...settings }, { conversationId }),
    updateTabState: (message) => deps.updateTabState(message),
  };
}
