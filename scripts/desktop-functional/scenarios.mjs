import { canvasOpenNekoConsumerScenario } from '../../packages/canvas/webview/functional/desktop-openneko-consumer.mjs';
import { canvasTextFilePreviewScenario } from '../../packages/canvas/webview/functional/desktop-text-file-preview.mjs';
import { cutOpenNekoConsumerScenario } from '../../packages/cut/webview/functional/desktop-openneko-consumer.mjs';
import { previewOpenNekoConsumerScenario } from '../../packages/preview/webview/functional/desktop-openneko-consumer.mjs';
import {
  workspaceFileCreationScenario,
  workspaceRetiredStorageIsolationScenario,
} from '../../packages/assets/webview/functional/desktop-workspace-file-creation.mjs';
import { assetLibraryRecordRemovalScenario } from '../../packages/assets/webview/functional/desktop-asset-record-removal.mjs';
import { desktopMarkdownMediaScenario } from '../../packages/text-editor/webview/functional/desktop-markdown-media.mjs';
import { desktopTextEditorScenario } from '../../packages/text-editor/webview/functional/desktop-text-editor.mjs';
import { desktopAgentProviderUiScenario } from './desktop-agent-provider-ui.mjs';
import { desktopAgentDiagnosticPortalScenario } from './desktop-agent-diagnostic-portal.mjs';
import { desktopInvalidWindowConvergenceScenario } from './desktop-invalid-window-convergence.mjs';
import { domainManagementWorkbenchScenario } from './domain-management-workbench.mjs';
import { noActiveProjectCatalogsScenario } from './no-active-project-catalogs.mjs';
import { projectContentScenario } from './project-content.mjs';
import {
  desktopAgentEntryWorkspaceSkillScenario,
  desktopAgentLinkedMediaMentionScenario,
  desktopAgentMessageQueueScenario,
  desktopAgentWorkspaceRestartScenario,
  desktopAgentWorkspaceRestartUnavailableScenario,
  desktopConversationNavigationScenario,
  desktopProjectSidebarManagementScenario,
  desktopWorkbenchScenesScenario,
  desktopWorkspaceResizeScenario,
} from './desktop-workbench-scenes.mjs';

const scenarios = new Map(
  [
    cutOpenNekoConsumerScenario,
    canvasOpenNekoConsumerScenario,
    canvasTextFilePreviewScenario,
    previewOpenNekoConsumerScenario,
    desktopAgentProviderUiScenario,
    desktopAgentDiagnosticPortalScenario,
    desktopInvalidWindowConvergenceScenario,
    domainManagementWorkbenchScenario,
    desktopAgentEntryWorkspaceSkillScenario,
    desktopAgentLinkedMediaMentionScenario,
    desktopAgentMessageQueueScenario,
    desktopAgentWorkspaceRestartScenario,
    desktopAgentWorkspaceRestartUnavailableScenario,
    desktopConversationNavigationScenario,
    desktopProjectSidebarManagementScenario,
    desktopWorkbenchScenesScenario,
    desktopWorkspaceResizeScenario,
    workspaceFileCreationScenario,
    workspaceRetiredStorageIsolationScenario,
    projectContentScenario,
    assetLibraryRecordRemovalScenario,
    desktopMarkdownMediaScenario,
    desktopTextEditorScenario,
    noActiveProjectCatalogsScenario,
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
