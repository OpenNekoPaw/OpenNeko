import { canvasOpenNekoConsumerScenario } from '../../packages/canvas/webview/functional/desktop-openneko-consumer.mjs';
import { cutOpenNekoConsumerScenario } from '../../packages/cut/webview/functional/desktop-openneko-consumer.mjs';
import { previewOpenNekoConsumerScenario } from '../../packages/preview/webview/functional/desktop-openneko-consumer.mjs';
import { resourceBrowserEntityManagementScenario } from '../../packages/assets/webview/functional/desktop-entity-management.mjs';
import { assetLibraryRecordRemovalScenario } from '../../packages/assets/webview/functional/desktop-asset-record-removal.mjs';
import { desktopAgentProviderUiScenario } from './desktop-agent-provider-ui.mjs';
import { desktopAgentDiagnosticPortalScenario } from './desktop-agent-diagnostic-portal.mjs';
import { desktopWorkbenchRetentionProviderUiScenario } from './desktop-workbench-retention-provider-ui.mjs';
import {
  desktopConversationNavigationScenario,
  desktopWorkbenchScenesScenario,
} from './desktop-workbench-scenes.mjs';

const scenarios = new Map(
  [
    cutOpenNekoConsumerScenario,
    canvasOpenNekoConsumerScenario,
    previewOpenNekoConsumerScenario,
    desktopAgentProviderUiScenario,
    desktopAgentDiagnosticPortalScenario,
    desktopWorkbenchRetentionProviderUiScenario,
    desktopConversationNavigationScenario,
    desktopWorkbenchScenesScenario,
    resourceBrowserEntityManagementScenario,
    assetLibraryRecordRemovalScenario,
  ].map((scenario) => [scenario.id, scenario]),
);

export function resolveDesktopFunctionalScenarios(value) {
  if (value === 'all-openneko-consumers') {
    return [
      cutOpenNekoConsumerScenario,
      canvasOpenNekoConsumerScenario,
      previewOpenNekoConsumerScenario,
    ];
  }
  const scenario = scenarios.get(value);
  if (!scenario) {
    throw new Error(
      `Unknown Desktop functional scenario '${value}'. Expected ${[
        ...scenarios.keys(),
        'all-openneko-consumers',
      ].join(', ')}.`,
    );
  }
  return [scenario];
}
