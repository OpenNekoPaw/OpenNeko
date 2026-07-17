/**
 * InputAreaContext - Provides global/session-wide configuration via React Context
 *
 * Eliminates prop drilling of 13 configuration props through
 * AIAssistant → ChatView → InputArea (and its sub-components).
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { MediaUnderstandingModels, ShellExecutionMode, SessionMode } from '@neko-agent/types';
import type { ConversationKind } from '@neko-agent/types';
import type { ChatModelOption } from '@neko/shared';
import type { AgentContextPayload } from '@neko/shared';
import type {
  SlashCommand,
  SkillSummary,
  MentionItem,
  PluginSlashCommandDef,
  GenCategory,
  GenerationParams,
} from '@/components/ChatView/InputArea/types';
export type MediaCategory = 'image' | 'video' | 'audio';

export interface MediaModelSelection {
  image: string;
  video: string;
  audio: string;
}

export interface MediaUnderstandingSelection {
  image: string;
  video: string;
  audio: string;
}

export interface InputAreaContextValue {
  /** Current conversation is executing; model and generation config must stay locked. */
  isBusy?: boolean;
  /** Distinguishes a pending host snapshot from a loaded catalog with no models. */
  modelCatalogStatus?: 'loading' | 'ready';
  // Chat Model
  selectedModel: string;
  availableModels: ChatModelOption[];
  onModelSelect: (modelId: string) => void;
  // Media Models (per-category selection)
  mediaModelSelection: MediaModelSelection;
  availableMediaModels: ChatModelOption[];
  /** Read-only model routing for native media understanding. */
  mediaUnderstandingModels?: MediaUnderstandingModels;
  mediaUnderstandingSelection: MediaUnderstandingSelection;
  onMediaModelSelect: (category: MediaCategory, modelId: string) => void;
  onMediaUnderstandingModelSelect: (category: MediaCategory, modelId: string) => void;
  // Session mode (top-level workflow routing)
  sessionMode: SessionMode;
  conversationKind?: ConversationKind;
  onSessionModeChange: (mode: SessionMode) => void;
  // Execution mode
  executionMode: ShellExecutionMode;
  onExecutionModeChange: (mode: ShellExecutionMode) => void;
  // Context compression
  contextTokenCount: number;
  maxContextTokens?: number;
  outputTokenCap?: number;
  modelMaxOutputTokens?: number;
  isCompressing: boolean;
  onCompressContext?: () => Promise<void>;
  // Media model call count (per conversation)
  mediaModelCallCount: number;
  // Skills
  skills: SkillSummary[];
  /** Plugin slash commands from external extensions */
  pluginCommands?: PluginSlashCommandDef[];
  onSlashCommand?: (command: SlashCommand) => void;
  onRequestFiles?: (filter: string) => void;
  /** Unified @mention items (files + canvas nodes + characters) — updated after onRequestFiles */
  mentionItems?: MentionItem[];
  /** Called when user selects a non-file @mention item to create a context chip */
  onAddContextChip?: (payload: AgentContextPayload) => void;
  // Agent context chips (attached context from canvas/cut/story)
  contextChips: AgentContextPayload[];
  onRemoveContextChip: (id: string) => void;
  /** Ambient canvas selection — auto-injected from canvas, non-removable. */
  ambientNodes?: Array<{ nodeId: string; type: string; summary: string }>;
  // Generation params (shown in top bar, fed into tool calls)
  genCategory: GenCategory;
  genParams: GenerationParams;
  onGenCategoryChange: (cat: GenCategory) => void;
  onGenParamsChange: (partial: Partial<GenerationParams>) => void;
}

const InputAreaContext = createContext<InputAreaContextValue | null>(null);

export function InputAreaProvider({
  children,
  ...value
}: InputAreaContextValue & { children: ReactNode }) {
  const memoized = useMemo<InputAreaContextValue>(
    () => ({
      isBusy: value.isBusy,
      modelCatalogStatus: value.modelCatalogStatus,
      selectedModel: value.selectedModel,
      availableModels: value.availableModels,
      onModelSelect: value.onModelSelect,
      mediaModelSelection: value.mediaModelSelection,
      availableMediaModels: value.availableMediaModels,
      mediaUnderstandingModels: value.mediaUnderstandingModels,
      mediaUnderstandingSelection: value.mediaUnderstandingSelection,
      onMediaModelSelect: value.onMediaModelSelect,
      onMediaUnderstandingModelSelect: value.onMediaUnderstandingModelSelect,
      sessionMode: value.sessionMode,
      conversationKind: value.conversationKind,
      onSessionModeChange: value.onSessionModeChange,
      executionMode: value.executionMode,
      onExecutionModeChange: value.onExecutionModeChange,
      contextTokenCount: value.contextTokenCount,
      maxContextTokens: value.maxContextTokens,
      outputTokenCap: value.outputTokenCap,
      modelMaxOutputTokens: value.modelMaxOutputTokens,
      isCompressing: value.isCompressing,
      onCompressContext: value.onCompressContext,
      mediaModelCallCount: value.mediaModelCallCount,
      skills: value.skills,
      pluginCommands: value.pluginCommands,
      onSlashCommand: value.onSlashCommand,
      onRequestFiles: value.onRequestFiles,
      mentionItems: value.mentionItems,
      onAddContextChip: value.onAddContextChip,
      contextChips: value.contextChips,
      onRemoveContextChip: value.onRemoveContextChip,
      ambientNodes: value.ambientNodes,
      genCategory: value.genCategory,
      genParams: value.genParams,
      onGenCategoryChange: value.onGenCategoryChange,
      onGenParamsChange: value.onGenParamsChange,
    }),
    [
      value.isBusy,
      value.modelCatalogStatus,
      value.selectedModel,
      value.availableModels,
      value.onModelSelect,
      value.mediaModelSelection,
      value.availableMediaModels,
      value.mediaUnderstandingModels,
      value.mediaUnderstandingSelection,
      value.onMediaModelSelect,
      value.onMediaUnderstandingModelSelect,
      value.sessionMode,
      value.conversationKind,
      value.onSessionModeChange,
      value.executionMode,
      value.onExecutionModeChange,
      value.contextTokenCount,
      value.maxContextTokens,
      value.outputTokenCap,
      value.modelMaxOutputTokens,
      value.isCompressing,
      value.onCompressContext,
      value.mediaModelCallCount,
      value.skills,
      value.pluginCommands,
      value.onSlashCommand,
      value.onRequestFiles,
      value.mentionItems,
      value.onAddContextChip,
      value.contextChips,
      value.onRemoveContextChip,
      value.ambientNodes,
      value.genCategory,
      value.genParams,
      value.onGenCategoryChange,
      value.onGenParamsChange,
    ],
  );

  return <InputAreaContext.Provider value={memoized}>{children}</InputAreaContext.Provider>;
}

export function useInputAreaContext(): InputAreaContextValue {
  const ctx = useContext(InputAreaContext);
  if (!ctx) {
    throw new Error('useInputAreaContext must be used within an InputAreaProvider');
  }
  return ctx;
}
