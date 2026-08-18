/**
 * Config Message Handlers
 *
 * Handles: settingsData, projectFiles, configState
 */

import { defineHandler } from './types';
import type { MessageHandler, HandlerRegistration } from './types';
import type {
  SettingsDataMessage,
  ProjectFilesMessage,
  ConfigStateMessage,
  PluginCommandsMessage,
  PluginsAvailableMessage,
  ProviderMutationResultMessage,
  SettingsUpdatedMessage,
} from './messages';
import {
  projectConfigStateMessage,
  projectPluginCommandsMessage,
  projectPluginsAvailableMessage,
  projectProjectFilesMessage,
  projectSettingsDataMessage,
  projectSettingsMutationError,
  selectInitialChatModelOption,
} from '../presenters/config-message-presenter';

/**
 * Handle 'settingsData' message - Settings from extension
 */
const handleSettingsData: MessageHandler<'settingsData'> = (
  message: SettingsDataMessage,
  context,
) => {
  const projection = projectSettingsDataMessage(message);

  const defaultChatModel = selectInitialChatModelOption(
    projection.settingsPatch.chatModelOptions ?? [],
  );
  context.hydrateConversationSettings(message.conversationId, {
    selectedModel: projection.selectedModel ?? defaultChatModel?.id ?? '',
    availableModelIds: (projection.settingsPatch.chatModelOptions ?? []).map((option) => option.id),
    defaultMediaModels: projection.defaultMediaModels,
    executionMode: projection.settingsPatch.executionMode ?? 'ask',
    settingsPatch: projection.settingsPatch,
  });
  if (!projection.selectedModel && defaultChatModel) {
    context.agentHostMessages.updateSettings(
      {
        providerId: defaultChatModel.providerId,
        modelId: defaultChatModel.modelId,
      },
      message.conversationId,
    );
  }

  if (projection.configDiagnostic) {
    context.setGlobalError(projection.configDiagnostic.message);
  }
};

/**
 * Handle 'projectFiles' message - Project file list + optional canvas/story mention extras
 */
const handleProjectFiles: MessageHandler<'projectFiles'> = (
  message: ProjectFilesMessage,
  context,
) => {
  const isTablessSearchResult =
    (message.purpose === 'roleplay' || message.purpose === 'entry') && !message.conversationId;
  if (!isTablessSearchResult && !context.isCurrentConversation(message.conversationId)) {
    return;
  }
  const currentFilter = context.mentionSearchFilterRef?.current ?? context.mentionSearchFilter;
  if (message.filter !== undefined && message.filter !== currentFilter) {
    return;
  }

  const projection = projectProjectFilesMessage(message);
  context.setProjectFiles(projection.projectFiles);
  context.setMentionItems(projection.mentionItems);
};

/**
 * Handle 'configState' message - Configuration from Platform
 * Uses platform-projected provider state for account/configuration UI.
 */
const handleConfigState: MessageHandler<'configState'> = (message: ConfigStateMessage, context) => {
  context.setHasConfigSnapshot?.(true);
  const settingsPatch = projectConfigStateMessage(message);
  if (settingsPatch) {
    context.setSettings((prev) => ({
      ...prev,
      ...settingsPatch,
    }));
  }
};

/**
 * Handle 'pluginCommands' message - Plugin slash commands from external extensions
 */
const handlePluginCommands: MessageHandler<'pluginCommands'> = (
  message: PluginCommandsMessage,
  context,
) => {
  context.setPluginCommands(projectPluginCommandsMessage(message));
};

/**
 * Handle 'pluginsAvailable' message - installed neko-suite plugins for send-to actions
 */
const handlePluginsAvailable: MessageHandler<'pluginsAvailable'> = (
  message: PluginsAvailableMessage,
  context,
) => {
  context.setPluginsAvailable(projectPluginsAvailableMessage(message));
};

/**
 * Handle mutation acknowledgements that are already reflected by settings/config refreshes.
 */
const handleSettingsMutationAck: MessageHandler<
  'settingsUpdated' | 'modelAdded' | 'modelRemoved'
> = (message: SettingsUpdatedMessage | ProviderMutationResultMessage, context) => {
  const error = projectSettingsMutationError(message);
  if (error) context.setGlobalError(error);
};

/**
 * All config handler registrations
 */
export const configHandlers: HandlerRegistration[] = [
  defineHandler('settingsData', handleSettingsData),
  defineHandler('projectFiles', handleProjectFiles),
  defineHandler('configState', handleConfigState),
  defineHandler('settingsUpdated', handleSettingsMutationAck),
  defineHandler('modelAdded', handleSettingsMutationAck),
  defineHandler('modelRemoved', handleSettingsMutationAck),
  defineHandler('pluginCommands', handlePluginCommands),
  defineHandler('pluginsAvailable', handlePluginsAvailable),
];
