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
import { characterManagementDialogueScenario } from './character-management-dialogue.mjs';
import { characterWorldManagementHierarchyScenario } from './character-world-management-hierarchy.mjs';
import { desktopAgentProviderUiScenario } from './desktop-agent-provider-ui.mjs';
import { desktopAiModelSettingsScenario } from './desktop-ai-model-settings.mjs';
import { desktopAgentDiagnosticPortalScenario } from './desktop-agent-diagnostic-portal.mjs';
import { desktopInvalidWindowConvergenceScenario } from './desktop-invalid-window-convergence.mjs';
import { domainManagementWorkbenchScenario } from './domain-management-workbench.mjs';
import { extensionManagementLifecycleScenario } from './extension-management-lifecycle.mjs';
import { noActiveProjectCatalogsScenario } from './no-active-project-catalogs.mjs';
import { projectContentScenario } from './project-content.mjs';
import { workspaceMainQuickCreationScenario } from './workspace-main-quick-creation.mjs';
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
    desktopAiModelSettingsScenario,
    desktopAgentDiagnosticPortalScenario,
    desktopInvalidWindowConvergenceScenario,
    characterManagementDialogueScenario,
    characterWorldManagementHierarchyScenario,
    domainManagementWorkbenchScenario,
    extensionManagementLifecycleScenario,
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
    workspaceMainQuickCreationScenario,
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
