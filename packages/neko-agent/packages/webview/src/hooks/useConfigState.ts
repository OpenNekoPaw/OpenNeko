/**
 * useConfigState Hook
 *
 * Manages configuration-related state for the AIAssistant component.
 */

import { useState, useCallback } from 'react';
import type { SettingsState, ShellExecutionMode } from '@neko-agent/types';
import type { MentionItem, PluginSlashCommandDef } from '@/components/ChatView/InputArea/types';

/**
 * Project file info
 */
export interface ProjectFileInfo {
  path: string;
  name: string;
  type: 'file' | 'folder';
  icon?: string;
  source?: 'workspace' | 'asset-library' | 'media-library' | 'entity-graph' | 'story' | 'canvas';
  mediaType?: 'video' | 'audio' | 'image' | 'sequence' | 'text' | 'document';
}

/**
 * Default settings state
 */
const DEFAULT_SETTINGS: SettingsState = {
  providers: [],
  configuredProviders: [],
  selectedProviderId: null,
  selectedModelId: null,
  systemPrompt: '',
  autoExecuteTools: true,
  streamResponses: true,
  showToolCalls: true,
  temperature: 0.7,
  maxTokens: 8192,
  executionMode: 'ask' as ShellExecutionMode,
  chatModelOptions: [],
  defaultMediaModels: {},
  modelGroups: [],
  configDiagnostic: undefined,
};

/**
 * Config state shape
 */
export interface ConfigState {
  settings: SettingsState;
  hasConfigSnapshot: boolean;
  projectFiles: ProjectFileInfo[];
  /** Unified @mention items (files + canvas nodes + characters) */
  mentionItems: MentionItem[];
  /** Latest @mention file search filter requested by the input area. */
  mentionSearchFilter: string;
  /** Plugin slash commands registered by external extensions */
  pluginCommands: PluginSlashCommandDef[];
}

/**
 * Config state actions
 */
export interface ConfigStateActions {
  setSettings: React.Dispatch<React.SetStateAction<SettingsState>>;
  setHasConfigSnapshot: React.Dispatch<React.SetStateAction<boolean>>;
  setProjectFiles: React.Dispatch<React.SetStateAction<ProjectFileInfo[]>>;
  setMentionItems: React.Dispatch<React.SetStateAction<MentionItem[]>>;
  setMentionSearchFilter: React.Dispatch<React.SetStateAction<string>>;
  setPluginCommands: React.Dispatch<React.SetStateAction<PluginSlashCommandDef[]>>;
  updateSettings: (updates: Partial<SettingsState>) => void;
  resetSettings: () => void;
}

/**
 * useConfigState return type
 */
export interface UseConfigStateReturn extends ConfigState, ConfigStateActions {}

/**
 * Hook for managing configuration state
 */
export function useConfigState(initialSettings?: Partial<SettingsState>): UseConfigStateReturn {
  const [settings, setSettings] = useState<SettingsState>({
    ...DEFAULT_SETTINGS,
    ...initialSettings,
  });
  const [hasConfigSnapshot, setHasConfigSnapshot] = useState(Boolean(initialSettings));
  const [projectFiles, setProjectFiles] = useState<ProjectFileInfo[]>([]);
  const [mentionItems, setMentionItems] = useState<MentionItem[]>([]);
  const [mentionSearchFilter, setMentionSearchFilter] = useState('');
  const [pluginCommands, setPluginCommands] = useState<PluginSlashCommandDef[]>([]);

  // Helper: partial update settings
  const updateSettings = useCallback((updates: Partial<SettingsState>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  // Helper: reset to defaults
  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return {
    // State
    settings,
    hasConfigSnapshot,
    projectFiles,
    mentionItems,
    mentionSearchFilter,
    pluginCommands,
    // Actions
    setSettings,
    setHasConfigSnapshot,
    setProjectFiles,
    setMentionItems,
    setMentionSearchFilter,
    setPluginCommands,
    updateSettings,
    resetSettings,
  };
}
