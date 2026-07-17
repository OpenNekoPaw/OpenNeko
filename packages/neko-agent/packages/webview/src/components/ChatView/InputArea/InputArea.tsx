/**
 * InputArea Component
 * Codex-style design with inline action buttons
 */

import { useRef, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { SendIcon, StopIcon, PlusIcon, EditIcon, CloseIcon } from '@neko/shared/icons';
import { ModeConfigBar } from './ModeConfigBar';
import { ModeSelector } from './ModeSelector';
import { EntryPromptMenu as ComposerEntryPromptMenu } from './EntryPromptMenu';
import { AttachmentPreview } from './FileAttachment';
import { FileReferencePreview } from './FileReferencePreview';
import {
  SkillInvocationMenu,
  SlashCommandMenu,
  sortSkillInvocationsForDisplay,
  sortSlashCommandsForDisplay,
} from './SlashCommandMenu';
import { MentionMenu, getFilteredMentionItems } from './MentionMenu';
import {
  MessageAttachment,
  ProjectFile,
  SlashCommand,
  MentionItem,
  EntryPromptMenu,
  DEFAULT_AGENT_LLM_CONFIG,
  DEFAULT_COMPOSER_MENU_STATE,
  type ComposerMenuState,
  type GenCategory,
  type SelectedFileReference,
} from './types';
import {
  createSkillInvocationCatalog,
  createSlashCommandCatalog,
  filterSkillInvocations,
  filterSlashCommands,
  type SkillInvocationCatalogItem,
} from './slash-command-catalog';
import { findTrailingMentionRange, projectTrailingMention } from './mention-input';
import { AgentContextChip } from './AgentContextChip';
import { SuggestionChips } from './SuggestionChips';
import { AmbientCanvasContextBar } from './AmbientCanvasContextBar';
import { UsageIndicator } from './UsageIndicator';
import { useTranslation } from '@/i18n/I18nContext';
import { useInputHistory } from '@/hooks/useInputHistory';
import { useInputAreaContext } from '@/components/ChatView/InputAreaContext';
import { ComposerMenuRuntimeProvider } from './composer-menu-runtime';
import { projectInputAreaUi } from '@/presenters/input-area-presenter';
import { isOptimisticQueuedMessageItem } from '@/presenters/message-queue-presenter';
import { projectComposerModeConfig } from '@/presenters/composer-mode-config-presenter';
import { projectClipboardTextToContextPayload } from '@/presenters/clipboard-context-presenter';
import type { AgentContextPayload, ChatModelOption } from '@neko/shared';
import { AgentHostMessages } from '@/messages';
import type {
  AgentLlmConfig,
  AgentModelSlots,
  AgentQueuedMessageItem,
  ConversationKind,
  SessionMode,
} from '@neko-agent/types';

interface InputAreaProps {
  inputValue: string;
  isThinking: boolean;
  /** Conversation-owned run state for queue/send/stop behavior. */
  isRunActive?: boolean;
  queuedMessageCount?: number;
  queuedMessages?: readonly AgentQueuedMessageItem[];
  droppedFiles?: MessageAttachment[];
  onDroppedFilesProcessed?: () => void;
  onInputChange: (value: string) => void;
  onPromoteQueuedMessage?: (queueItemId: string) => void;
  onCancelQueuedMessage?: (queueItemId: string) => void;
  onEditQueuedMessage?: (queueItemId: string) => void;
  onSend: (input?: {
    messageText?: string;
    displayMessageText?: string;
    sessionMode?: SessionMode;
    attachments?: MessageAttachment[];
    contextPayloads?: AgentContextPayload[];
    fileReferences?: SelectedFileReference[];
    agentModels?: AgentModelSlots;
    llmConfig?: AgentLlmConfig;
  }) => void;
  onCancel?: () => void;
  entryPromptMenu?: EntryPromptMenu | null;
  onEntryPromptMenuChange?: (menu: EntryPromptMenu | null) => void;
  llmConfig?: AgentLlmConfig;
  onLlmConfigChange?: (config: AgentLlmConfig) => void;
  composerMenuState?: ComposerMenuState;
  onComposerMenuStateChange?: (state: ComposerMenuState) => void;
  disabled?: boolean;
  /** Session-bound attached files (managed by parent for conversation isolation) */
  attachedFiles?: MessageAttachment[];
  /** Callback to update attached files (when managed externally) */
  onAttachedFilesChange?: (files: MessageAttachment[]) => void;
  /** Session-bound @file references selected from the mention menu. */
  selectedFileReferences?: SelectedFileReference[];
  onSelectedFileReferencesChange?: (references: SelectedFileReference[]) => void;
  isComposing?: boolean;
  onCompositionChange?: (isComposing: boolean) => void;
  focusRequestOwner?: string;
  focusRequestEnabled?: boolean;
  focusRequestTarget?: 'none' | 'input';
  focusRequestRevision?: number;
}

type InputAreaTranslator = (key: string, params?: Record<string, string | number>) => string;
type StateAction<T> = T | ((previous: T) => T);
type StateUpdater<T> = (action: StateAction<T>) => void;

function useOptionalControlledState<T>(
  controlledValue: T | undefined,
  onControlledChange: ((value: T) => void) | undefined,
  initialValue: T,
): readonly [T, StateUpdater<T>] {
  const [internalValue, setInternalValue] = useState(initialValue);
  const value = controlledValue ?? internalValue;
  const valueRef = useRef(value);
  const onControlledChangeRef = useRef(onControlledChange);
  valueRef.current = value;
  onControlledChangeRef.current = onControlledChange;
  const setValue = useCallback<StateUpdater<T>>((action) => {
    const currentValue = valueRef.current;
    const nextValue = resolveStateAction(action, currentValue);
    if (Object.is(nextValue, currentValue)) return;
    valueRef.current = nextValue;
    if (onControlledChangeRef.current) {
      onControlledChangeRef.current(nextValue);
      return;
    }
    setInternalValue(nextValue);
  }, []);
  return [value, setValue] as const;
}

function createComposerMenuFieldSetter<
  TSection extends 'slash' | 'skill' | 'mention',
  TField extends keyof ComposerMenuState[TSection],
>(
  setComposerMenuState: StateUpdater<ComposerMenuState>,
  section: TSection,
  field: TField,
): StateUpdater<ComposerMenuState[TSection][TField]> {
  return (action) => {
    setComposerMenuState((state) => {
      const currentValue = state[section][field];
      const nextValue = resolveStateAction(action, currentValue);
      if (Object.is(nextValue, currentValue)) return state;
      return {
        ...state,
        [section]: {
          ...state[section],
          [field]: nextValue,
        },
      };
    });
  };
}

function createComposerMenuRootFieldSetter<TField extends 'queueExpanded'>(
  setComposerMenuState: StateUpdater<ComposerMenuState>,
  field: TField,
): StateUpdater<ComposerMenuState[TField]> {
  return (action) => {
    setComposerMenuState((state) => {
      const currentValue = state[field];
      const nextValue = resolveStateAction(action, currentValue);
      return Object.is(nextValue, currentValue) ? state : { ...state, [field]: nextValue };
    });
  };
}

function resolveStateAction<T>(action: StateAction<T>, previous: T): T {
  return typeof action === 'function' ? (action as (value: T) => T)(previous) : action;
}

export function InputArea({
  inputValue,
  isThinking,
  isRunActive = isThinking,
  queuedMessageCount = 0,
  queuedMessages = [],
  droppedFiles,
  onDroppedFilesProcessed,
  onInputChange,
  onPromoteQueuedMessage,
  onCancelQueuedMessage,
  onEditQueuedMessage,
  onSend,
  onCancel,
  entryPromptMenu,
  onEntryPromptMenuChange,
  llmConfig: controlledLlmConfig,
  onLlmConfigChange,
  composerMenuState: controlledComposerMenuState,
  onComposerMenuStateChange,
  disabled = false,
  attachedFiles: externalAttachedFiles,
  onAttachedFilesChange,
  selectedFileReferences: externalSelectedFileReferences,
  onSelectedFileReferencesChange,
  isComposing = false,
  onCompositionChange,
  focusRequestOwner,
  focusRequestEnabled = true,
  focusRequestTarget = 'none',
  focusRequestRevision = 0,
}: InputAreaProps) {
  // Global configuration from context (model, modes, compression, skills)
  const {
    sessionMode,
    modelCatalogStatus = 'ready',
    onSessionModeChange,
    selectedModel,
    availableModels,
    onModelSelect,
    executionMode,
    onExecutionModeChange,
    contextTokenCount,
    maxContextTokens,
    outputTokenCap,
    modelMaxOutputTokens,
    isCompressing,
    onCompressContext,
    mediaModelCallCount,
    mediaModelSelection,
    availableMediaModels,
    mediaUnderstandingModels,
    mediaUnderstandingSelection,
    onMediaModelSelect,
    onMediaUnderstandingModelSelect,
    skills,
    pluginCommands = [],
    onSlashCommand,
    onRequestFiles,
    mentionItems = [],
    onAddContextChip,
    contextChips,
    onRemoveContextChip,
    ambientNodes = [],
    conversationKind,
    genCategory,
    genParams,
    onGenCategoryChange,
    onGenParamsChange,
    isBusy = false,
  } = useInputAreaContext();
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!focusRequestEnabled || focusRequestTarget !== 'input' || focusRequestRevision <= 0) {
      return;
    }
    textareaRef.current?.focus();
  }, [focusRequestEnabled, focusRequestOwner, focusRequestRevision, focusRequestTarget]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Input history for arrow key navigation
  const { addToHistory, navigateUp, navigateDown, resetNavigation, isNavigating } =
    useInputHistory();

  const [llmConfig, setLlmConfig] = useOptionalControlledState(
    controlledLlmConfig,
    onLlmConfigChange,
    DEFAULT_AGENT_LLM_CONFIG,
  );
  const [composerMenuState, setComposerMenuState] = useOptionalControlledState(
    controlledComposerMenuState,
    onComposerMenuStateChange,
    DEFAULT_COMPOSER_MENU_STATE,
  );
  const showSlashMenu = composerMenuState.slash.open;
  const slashFilter = composerMenuState.slash.filter;
  const selectedCommandIndex = composerMenuState.slash.selectedIndex;
  const showSkillMenu = composerMenuState.skill.open;
  const skillFilter = composerMenuState.skill.filter;
  const selectedSkillIndex = composerMenuState.skill.selectedIndex;
  const showAtMenu = composerMenuState.mention.open;
  const atFilter = composerMenuState.mention.filter;
  const selectedFileIndex = composerMenuState.mention.selectedIndex;
  const isQueueExpanded = composerMenuState.queueExpanded;
  const {
    setShowSlashMenu,
    setSlashFilter,
    setSelectedCommandIndex,
    setShowSkillMenu,
    setSkillFilter,
    setSelectedSkillIndex,
    setShowAtMenu,
    setAtFilter,
    setSelectedFileIndex,
    setIsQueueExpanded,
  } = useMemo(
    () => ({
      setShowSlashMenu: createComposerMenuFieldSetter(setComposerMenuState, 'slash', 'open'),
      setSlashFilter: createComposerMenuFieldSetter(setComposerMenuState, 'slash', 'filter'),
      setSelectedCommandIndex: createComposerMenuFieldSetter(
        setComposerMenuState,
        'slash',
        'selectedIndex',
      ),
      setShowSkillMenu: createComposerMenuFieldSetter(setComposerMenuState, 'skill', 'open'),
      setSkillFilter: createComposerMenuFieldSetter(setComposerMenuState, 'skill', 'filter'),
      setSelectedSkillIndex: createComposerMenuFieldSetter(
        setComposerMenuState,
        'skill',
        'selectedIndex',
      ),
      setShowAtMenu: createComposerMenuFieldSetter(setComposerMenuState, 'mention', 'open'),
      setAtFilter: createComposerMenuFieldSetter(setComposerMenuState, 'mention', 'filter'),
      setSelectedFileIndex: createComposerMenuFieldSetter(
        setComposerMenuState,
        'mention',
        'selectedIndex',
      ),
      setIsQueueExpanded: createComposerMenuRootFieldSetter(setComposerMenuState, 'queueExpanded'),
    }),
    [setComposerMenuState],
  );
  const lastRequestedMentionFilterRef = useRef<string | null>(null);
  const suppressedPromotedMentionInputRef = useRef<string | null>(null);

  // Attached files - use external state if provided (for conversation isolation)
  const [internalAttachedFiles, setInternalAttachedFiles] = useState<MessageAttachment[]>([]);
  const attachedFiles = externalAttachedFiles ?? internalAttachedFiles;
  const [internalSelectedFileReferences, setInternalSelectedFileReferences] = useState<
    SelectedFileReference[]
  >([]);
  const selectedFileReferences = externalSelectedFileReferences ?? internalSelectedFileReferences;

  // Create a unified setter that works with both internal state and external callback
  const updateAttachedFiles = useCallback(
    (updater: MessageAttachment[] | ((prev: MessageAttachment[]) => MessageAttachment[])) => {
      if (onAttachedFilesChange) {
        // External management: resolve the updater function with current value
        const newValue =
          typeof updater === 'function' ? updater(externalAttachedFiles ?? []) : updater;
        onAttachedFilesChange(newValue);
      } else {
        // Internal state: use React's setState directly
        setInternalAttachedFiles(updater);
      }
    },
    [onAttachedFilesChange, externalAttachedFiles],
  );

  const updateSelectedFileReferences = useCallback(
    (
      updater:
        SelectedFileReference[] | ((prev: SelectedFileReference[]) => SelectedFileReference[]),
    ) => {
      if (onSelectedFileReferencesChange) {
        const newValue =
          typeof updater === 'function' ? updater(externalSelectedFileReferences ?? []) : updater;
        onSelectedFileReferencesChange(newValue);
      } else {
        setInternalSelectedFileReferences(updater);
      }
    },
    [externalSelectedFileReferences, onSelectedFileReferencesChange],
  );

  // Handle externally dropped files
  useEffect(() => {
    if (droppedFiles && droppedFiles.length > 0) {
      updateAttachedFiles((prev) => [...prev, ...droppedFiles]);
      onDroppedFilesProcessed?.();
    }
  }, [droppedFiles, onDroppedFilesProcessed, updateAttachedFiles]);

  useEffect(() => {
    if (!inputValue.includes('@') || mentionItems.length === 0) return;
    const promoted = promoteCompletedFileReferencesFromInput(
      inputValue,
      mentionItems,
      selectedFileReferences,
    );
    if (promoted.value === inputValue && promoted.references === selectedFileReferences) return;
    suppressedPromotedMentionInputRef.current = inputValue;
    if (promoted.value !== inputValue) {
      onInputChange(promoted.value);
    }
    if (promoted.references !== selectedFileReferences) {
      updateSelectedFileReferences(promoted.references);
    }
  }, [
    inputValue,
    mentionItems,
    onInputChange,
    selectedFileReferences,
    updateSelectedFileReferences,
  ]);

  // Filtered data
  const slashCommands = createSlashCommandCatalog(skills, pluginCommands);
  const filteredCommands = sortSlashCommandsForDisplay(
    filterSlashCommands(slashCommands, slashFilter, t),
  );
  const skillInvocations = createSkillInvocationCatalog(skills);
  const filteredSkillInvocations = sortSkillInvocationsForDisplay(
    filterSkillInvocations(skillInvocations, skillFilter, t),
  );
  const filteredMentionItems = getFilteredMentionItems(mentionItems, atFilter);
  const mediaModelCounts = countMediaModelsByCategory(availableMediaModels);
  const availableSessionModes = getAvailableSessionModes(mediaModelCounts);
  const currentSessionMediaModelCount = getSessionMediaModelCount(sessionMode, mediaModelCounts);
  const showEntryPromptMenu = Boolean(entryPromptMenu);
  const isMediaGenerationSession = isMediaGenerationMode(sessionMode);
  const isRoleplayConversation = isRoleplayConversationKind(conversationKind);
  const allowCommandMenus = !isMediaGenerationSession && !isRoleplayConversation;
  const slashMenuOpen = allowCommandMenus && showSlashMenu;
  const skillMenuOpen = allowCommandMenus && showSkillMenu;

  useEffect(() => {
    if (allowCommandMenus) return;
    setShowSlashMenu(false);
    setShowSkillMenu(false);
  }, [allowCommandMenus, setShowSkillMenu, setShowSlashMenu]);

  const closeEntryPromptMenu = useCallback(() => {
    onEntryPromptMenuChange?.(null);
  }, [onEntryPromptMenuChange]);

  const syncMentionMenuFromInput = useCallback(
    (value: string) => {
      if (suppressedPromotedMentionInputRef.current === value) {
        setShowAtMenu(false);
        lastRequestedMentionFilterRef.current = null;
        return;
      }

      const trailingMention = projectTrailingMention(value);
      if (!trailingMention) {
        setShowAtMenu(false);
        lastRequestedMentionFilterRef.current = null;
        suppressedPromotedMentionInputRef.current = null;
        return;
      }

      setAtFilter(trailingMention.displayFilter);
      setShowAtMenu(true);
      setSelectedFileIndex(0);
      if (lastRequestedMentionFilterRef.current !== trailingMention.requestFilter) {
        lastRequestedMentionFilterRef.current = trailingMention.requestFilter;
        onRequestFiles?.(trailingMention.requestFilter);
      }
    },
    [onRequestFiles, setAtFilter, setSelectedFileIndex, setShowAtMenu],
  );

  useEffect(() => {
    syncMentionMenuFromInput(inputValue);
  }, [inputValue, syncMentionMenuFromInput]);

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const promoted = promoteCompletedFileReferencesFromInput(
      e.target.value,
      mentionItems,
      selectedFileReferences,
    );
    const value = promoted.value;
    onInputChange(value);
    if (promoted.references !== selectedFileReferences) {
      updateSelectedFileReferences(promoted.references);
    }

    closeEntryPromptMenu();

    // Reset history navigation when user types
    if (!isNavigating) {
      // Only reset if not currently navigating (to avoid resetting on arrow key changes)
    } else {
      resetNavigation();
    }

    // Check for slash command
    if (allowCommandMenus && value.startsWith('/')) {
      const filter = value.slice(1).split(' ')[0];
      setSlashFilter(filter);
      setShowSlashMenu(true);
      setShowSkillMenu(false);
      setSelectedCommandIndex(0);
    } else {
      setShowSlashMenu(false);
    }

    if (allowCommandMenus && value.startsWith('$')) {
      const filter = value.slice(1).split(' ')[0];
      setSkillFilter(filter);
      setShowSkillMenu(true);
      setShowSlashMenu(false);
      setSelectedSkillIndex(0);
    } else {
      setShowSkillMenu(false);
    }

    syncMentionMenuFromInput(value);

    // Auto-resize
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  // Cycle execution mode: plan → ask → auto → plan
  const EXECUTION_MODES: import('@neko-agent/types').ShellExecutionMode[] = ['plan', 'ask', 'auto'];
  const cycleExecutionMode = useCallback(() => {
    const idx = EXECUTION_MODES.indexOf(executionMode);
    const next = EXECUTION_MODES[(idx + 1) % EXECUTION_MODES.length];
    onExecutionModeChange(next!);
  }, [executionMode, onExecutionModeChange]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ignore key events during IME composition (e.g., Chinese/Japanese input)
    if (isComposing || e.nativeEvent.isComposing || e.keyCode === 229) {
      return;
    }

    // Shift+Tab: cycle execution mode
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      cycleExecutionMode();
      return;
    }

    // Slash menu navigation
    if (slashMenuOpen && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCommandIndex((prev) => (prev + 1) % filteredCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCommandIndex(
          (prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length,
        );
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        selectSlashCommand(filteredCommands[selectedCommandIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSlashMenu(false);
        return;
      }
    }

    if (skillMenuOpen && filteredSkillInvocations.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSkillIndex((prev) => (prev + 1) % filteredSkillInvocations.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSkillIndex(
          (prev) => (prev - 1 + filteredSkillInvocations.length) % filteredSkillInvocations.length,
        );
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        selectSkillInvocation(filteredSkillInvocations[selectedSkillIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSkillMenu(false);
        return;
      }
    }

    // @ menu navigation
    if (showAtMenu && filteredMentionItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedFileIndex((prev) => (prev + 1) % filteredMentionItems.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedFileIndex(
          (prev) => (prev - 1 + filteredMentionItems.length) % filteredMentionItems.length,
        );
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        handleMentionSelect(filteredMentionItems[selectedFileIndex]!);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowAtMenu(false);
        return;
      }
    }

    // Input history navigation (when no menus are open)
    if (!slashMenuOpen && !skillMenuOpen && !showAtMenu) {
      if (e.key === 'ArrowUp') {
        // Only trigger when cursor is at the first line
        const cursorPosition = textareaRef.current?.selectionStart ?? 0;
        const textBeforeCursor = inputValue.slice(0, cursorPosition);
        if (!textBeforeCursor.includes('\n')) {
          const prevInput = navigateUp(inputValue);
          if (prevInput !== null) {
            e.preventDefault();
            onInputChange(prevInput);
            // Move cursor to end after state update
            setTimeout(() => {
              if (textareaRef.current) {
                textareaRef.current.selectionStart = prevInput.length;
                textareaRef.current.selectionEnd = prevInput.length;
              }
            }, 0);
            return;
          }
        }
      }
      if (e.key === 'ArrowDown') {
        // Only trigger when cursor is at the last line
        const cursorPosition = textareaRef.current?.selectionStart ?? 0;
        const textAfterCursor = inputValue.slice(cursorPosition);
        if (!textAfterCursor.includes('\n')) {
          const nextInput = navigateDown();
          if (nextInput !== null) {
            e.preventDefault();
            onInputChange(nextInput);
            // Move cursor to end after state update
            setTimeout(() => {
              if (textareaRef.current) {
                textareaRef.current.selectionStart = nextInput.length;
                textareaRef.current.selectionEnd = nextInput.length;
              }
            }, 0);
            return;
          }
        }
      }
    }

    // Normal send
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      (!slashMenuOpen || filteredCommands.length === 0) &&
      (!skillMenuOpen || filteredSkillInvocations.length === 0) &&
      !showAtMenu
    ) {
      e.preventDefault();
      handleSend();
    }
  };

  const selectSlashCommand = (command: SlashCommand) => {
    closeEntryPromptMenu();
    setShowSlashMenu(false);
    setShowSkillMenu(false);
    onInputChange(command.name + ' ');
    onSlashCommand?.(command);
    textareaRef.current?.focus();
  };

  const selectSkillInvocation = (skill: SkillInvocationCatalogItem | undefined) => {
    if (!skill) return;
    closeEntryPromptMenu();
    setShowSkillMenu(false);
    setShowSlashMenu(false);
    onInputChange(skill.name + ' ');
    textareaRef.current?.focus();
  };

  const replaceActiveMention = (replacement: string) => {
    onInputChange(replaceTrailingMention(inputValue, replacement));
  };

  const addSelectedFileReference = (item: MentionItem) => {
    if (!item.filePath) return;
    const reference = projectSelectedFileReference(item);
    replaceActiveMention('');
    updateSelectedFileReferences((prev) =>
      prev.some((existing) => existing.path === reference.path) ? prev : [...prev, reference],
    );
    setShowAtMenu(false);
    textareaRef.current?.focus();
  };

  /** Handle selection from MentionMenu — path-backed items become @file tokens; others create a context chip. */
  const handleMentionSelect = (item: MentionItem) => {
    closeEntryPromptMenu();
    if (item.filePath) {
      addSelectedFileReference(item);
    } else if (item.contextPayload && onAddContextChip) {
      // Remove the trailing @filter from input
      replaceActiveMention('');
      onAddContextChip(item.contextPayload);
      setShowAtMenu(false);
      textareaRef.current?.focus();
    }
  };

  const handleSend = () => {
    if (disabled) return;
    if (isRunActive && !inputAreaProjection.canQueue) return;
    closeEntryPromptMenu();
    const outboundMessageText = appendSelectedFileReferencesToMessage(
      inputValue,
      selectedFileReferences,
    );
    const hasSelectedFileReferences = selectedFileReferences.length > 0;
    if (
      !outboundMessageText.trim() &&
      attachedFiles.length === 0 &&
      contextChips.length === 0 &&
      !hasSelectedFileReferences
    ) {
      return;
    }
    // Add to history before sending
    if (outboundMessageText.trim()) {
      addToHistory(inputValue);
    }
    const files = attachedFiles.length > 0 ? attachedFiles : undefined;
    const contextPayloads = contextChips.length > 0 ? contextChips : undefined;
    onSend({
      messageText: outboundMessageText,
      displayMessageText: inputValue,
      sessionMode,
      attachments: files,
      contextPayloads,
      fileReferences: hasSelectedFileReferences ? selectedFileReferences : undefined,
      ...(sessionMode === 'agent'
        ? buildAgentLlmSendConfig(selectedModel, availableModels, llmConfig)
        : {}),
    });
    contextChips.forEach((c) => onRemoveContextChip(c.id));
    onInputChange('');
    updateAttachedFiles([]);
    updateSelectedFileReferences([]);
  };

  const handleRemoveFile = (id: string) => {
    updateAttachedFiles((files) => files.filter((f) => f.id !== id));
  };

  const handleRemoveFileReference = (id: string) => {
    updateSelectedFileReferences((references) =>
      references.filter((reference) => reference.id !== id),
    );
  };

  // Handle file selection
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const type = file.type.startsWith('image/')
            ? 'image'
            : file.type.startsWith('video/')
              ? 'video'
              : file.type.startsWith('audio/')
                ? 'audio'
                : 'file';
          const newFile: MessageAttachment = {
            id: `file-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: file.name,
            type,
            size: file.size,
            preview: type === 'image' ? (event.target?.result as string) : undefined,
            path: file.name,
          };
          updateAttachedFiles((prev) => [...prev, newFile]);
        };
        if (file.type.startsWith('image/')) {
          reader.readAsDataURL(file);
        } else {
          reader.readAsArrayBuffer(file);
          const newFile: MessageAttachment = {
            id: `file-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: file.name,
            type: file.type.startsWith('video/')
              ? 'video'
              : file.type.startsWith('audio/')
                ? 'audio'
                : 'file',
            size: file.size,
            path: file.name,
          };
          updateAttachedFiles((prev) => [...prev, newFile]);
        }
      });

      // Reset input
      e.target.value = '';
    },
    [updateAttachedFiles],
  );

  // Handle structured references and pasted images.
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const text = e.clipboardData?.getData('text/plain');
      if (text && onAddContextChip) {
        const payload = projectClipboardTextToContextPayload(text);
        if (payload) {
          e.preventDefault();
          onAddContextChip(payload);
          return;
        }
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const newFile: MessageAttachment = {
                id: `paste-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                name: `pasted-image-${Date.now()}.png`,
                type: 'image',
                size: file.size,
                preview: event.target?.result as string,
              };
              updateAttachedFiles((files) => [...files, newFile]);
            };
            reader.readAsDataURL(file);
          }
        }
      }
    },
    [onAddContextChip, updateAttachedFiles],
  );

  // Insert slash command
  const handleSlashClick = () => {
    if (!allowCommandMenus) return;
    closeEntryPromptMenu();
    onInputChange('/');
    setShowSlashMenu(true);
    setShowSkillMenu(false);
    setSlashFilter('');
    textareaRef.current?.focus();
  };

  const handleSkillClick = () => {
    if (!allowCommandMenus) return;
    closeEntryPromptMenu();
    onInputChange('$');
    setShowSkillMenu(true);
    setShowSlashMenu(false);
    setSkillFilter('');
    textareaRef.current?.focus();
  };

  const handleEntryGenerationModeSelect = (mode: Extract<SessionMode, GenCategory>) => {
    closeEntryPromptMenu();
    onSessionModeChange(mode);
    textareaRef.current?.focus();
  };

  const handleEntryRoleplaySelect = (item: MentionItem) => {
    closeEntryPromptMenu();
    AgentHostMessages.startCharacterDialogueFromSlash(
      `${formatRoleplaySlashEntity(item)} --roleplay --skip-enrich${formatInitialRoleplayMessage(inputValue)}`,
    );
    textareaRef.current?.focus();
  };

  const projectedQueuedMessageCount = Math.max(queuedMessageCount, queuedMessages.length);
  const inputAreaProjection = projectInputAreaUi({
    inputValue,
    attachedFileCount: attachedFiles.length + selectedFileReferences.length,
    contextChipCount: contextChips.length,
    ambientNodeCount: ambientNodes.length,
    mediaModelCallCount,
    isThinking: isRunActive,
    queuedMessageCount: projectedQueuedMessageCount,
    disabled,
    sessionMode,
    conversationKind,
    availableMediaModelCount: availableMediaModels.length,
    currentSessionMediaModelCount,
  });
  const showModeControlGroup =
    inputAreaProjection.showSessionModeSelector ||
    inputAreaProjection.showChatModelSelector ||
    inputAreaProjection.showSessionMediaModelSelector;
  const showControlRow = showModeControlGroup || inputAreaProjection.showGenerationParams;
  const queuePanelCount = inputAreaProjection.queuedMessageCount;
  const composerModeConfig = projectComposerModeConfig({
    sessionMode,
    selectedModel,
    availableModels,
    modelCatalogStatus,
    mediaModelSelection,
    availableMediaModels,
    genCategory,
    genParams,
    llmConfig,
  });

  return (
    <div className="flex-shrink-0">
      {/* ── Suggestion chips — float above border-t, at bottom of message list ── */}
      {inputAreaProjection.showSuggestionChips && (
        <div className="px-3 pb-1">
          <SuggestionChips contextChips={contextChips} onSuggest={onInputChange} />
        </div>
      )}

      <div className="agent-composer-rail">
        {inputAreaProjection.showQueuedMessages && (
          <MessageQueueControls
            items={queuedMessages}
            pendingCount={queuePanelCount}
            expanded={isQueueExpanded}
            onExpandedChange={setIsQueueExpanded}
            onPromote={onPromoteQueuedMessage}
            onCancel={onCancelQueuedMessage}
            onEdit={onEditQueuedMessage}
            t={t}
          />
        )}

        {/* ── Top bar: mode + model | generation params (with integrated media model) ── */}
        {showControlRow && (
          <ComposerMenuRuntimeProvider state={composerMenuState} update={setComposerMenuState}>
            <ModeConfigBar
              projection={composerModeConfig}
              availableSessionModes={availableSessionModes}
              availableModels={availableModels}
              selectedModel={selectedModel}
              onSessionModeChange={onSessionModeChange}
              onModelSelect={onModelSelect}
              mediaModelSelection={mediaModelSelection}
              availableMediaModels={availableMediaModels}
              mediaUnderstandingModels={mediaUnderstandingModels}
              mediaUnderstandingSelection={mediaUnderstandingSelection}
              onMediaModelSelect={onMediaModelSelect}
              onMediaUnderstandingModelSelect={onMediaUnderstandingModelSelect}
              genCategory={genCategory}
              genParams={genParams}
              onGenCategoryChange={onGenCategoryChange}
              onGenParamsChange={onGenParamsChange}
              llmConfig={llmConfig}
              onLlmConfigChange={setLlmConfig}
              showAgentConfig={inputAreaProjection.showChatModelSelector}
              showMediaConfig={inputAreaProjection.showGenerationParams}
              disabled={isBusy}
            />
          </ComposerMenuRuntimeProvider>
        )}

        {/* Ambient canvas reference — mirrors @ quick references above the composer. */}
        {inputAreaProjection.showAmbientNodes && (
          <AmbientCanvasContextBar ambientNodes={ambientNodes} onSuggest={onInputChange} />
        )}

        {/* ── Input container ── */}
        <div className="agent-composer-shell relative mx-2 mb-2">
          {/* Slash command menu */}
          <SlashCommandMenu
            isOpen={slashMenuOpen}
            commands={filteredCommands}
            selectedIndex={selectedCommandIndex}
            onSelect={selectSlashCommand}
            onClose={() => setShowSlashMenu(false)}
          />

          <SkillInvocationMenu
            isOpen={skillMenuOpen}
            skills={filteredSkillInvocations}
            selectedIndex={selectedSkillIndex}
            onSelect={selectSkillInvocation}
            onClose={() => setShowSkillMenu(false)}
          />

          {/* @mention menu — files, canvas nodes, story characters */}
          <MentionMenu
            isOpen={showAtMenu}
            filter={atFilter}
            items={mentionItems}
            selectedIndex={selectedFileIndex}
            onSelectFile={addSelectedFileReference}
            onSelectContext={(payload) => {
              if (onAddContextChip) {
                replaceActiveMention('');
                onAddContextChip(payload);
                setShowAtMenu(false);
                textareaRef.current?.focus();
              }
            }}
            onClose={() => setShowAtMenu(false)}
          />

          <ComposerEntryPromptMenu
            isOpen={showEntryPromptMenu}
            menu={entryPromptMenu ?? null}
            availableMediaModels={availableMediaModels}
            mentionItems={mentionItems}
            onSelectGenerationMode={handleEntryGenerationModeSelect}
            onSelectRoleplayEntity={handleEntryRoleplaySelect}
            onClose={closeEntryPromptMenu}
          />

          {/* Agent context chips — shown above textarea when context is attached */}
          {inputAreaProjection.showContextChips && (
            <div className="agent-reference-row agent-reference-row-attached">
              {contextChips.map((chip) => (
                <AgentContextChip key={chip.id} payload={chip} onRemove={onRemoveContextChip} />
              ))}
            </div>
          )}

          {/* File attachment preview */}
          <AttachmentPreview attachedFiles={attachedFiles} onRemove={handleRemoveFile} />

          {/* @file reference preview */}
          <FileReferencePreview
            references={selectedFileReferences}
            onRemove={handleRemoveFileReference}
          />

          {/* Input row */}
          <div className="agent-composer-input-row">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => onCompositionChange?.(true)}
              onCompositionEnd={() => onCompositionChange?.(false)}
              onPaste={handlePaste}
              disabled={disabled}
              placeholder={t(inputAreaProjection.inputPlaceholderKey, {
                count: inputAreaProjection.queuedMessageCount,
              })}
              className="agent-composer-textarea"
              rows={1}
            />
          </div>

          {/* ── Bottom bar: utilities + execution mode + send ── */}
          <div className="agent-composer-toolbar">
            {/* Attachment button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="agent-composer-tool-button"
              title={t('chat.input.attach')}
            >
              <PlusIcon className="w-4 h-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,audio/*,.txt,.md,.json,.js,.ts,.tsx,.jsx,.py,.go,.rs,.java,.c,.cpp,.h,.hpp,.css,.html,.xml,.yaml,.yml,.toml"
              className="hidden"
              onChange={handleFileSelect}
            />

            {allowCommandMenus && (
              <>
                {/* Slash command button */}
                <button
                  type="button"
                  onClick={handleSlashClick}
                  className="agent-composer-tool-button agent-composer-tool-button-text"
                  title={t('chat.input.commands')}
                >
                  /
                </button>

                <button
                  type="button"
                  onClick={handleSkillClick}
                  className="agent-composer-tool-button agent-composer-tool-button-text"
                  title={t('chat.input.skills')}
                >
                  $
                </button>
              </>
            )}

            {/* Token usage pie */}
            <UsageIndicator
              tokenCount={contextTokenCount}
              maxTokens={maxContextTokens}
              maxOutputTokens={outputTokenCap}
              modelMaxOutputTokens={modelMaxOutputTokens}
              isCompressing={isCompressing}
              onCompress={onCompressContext}
            />

            {/* Media call count */}
            {inputAreaProjection.showMediaCallCount && (
              <div
                className="agent-composer-media-count"
                title={t('chat.input.mediaModelCalls', { count: mediaModelCallCount })}
              >
                <MediaCallIcon className="w-3 h-3" />
                <span>{mediaModelCallCount}</span>
              </div>
            )}

            <div className="flex-1" />

            {/* Execution mode — runtime control belongs with send/tools, not model config. */}
            {inputAreaProjection.showExecutionModeSelector && (
              <ComposerMenuRuntimeProvider state={composerMenuState} update={setComposerMenuState}>
                <ModeSelector mode={executionMode} onChange={onExecutionModeChange} />
              </ComposerMenuRuntimeProvider>
            )}

            {/* Send */}
            {(!isRunActive || inputAreaProjection.canQueue) && (
              <button
                type="button"
                onClick={handleSend}
                disabled={!inputAreaProjection.canSend}
                className={`agent-composer-action-button ${
                  inputAreaProjection.canQueue
                    ? 'agent-composer-queue'
                    : inputAreaProjection.canSend
                      ? 'agent-composer-send'
                      : 'bg-[var(--agent-control-muted-bg)] text-[var(--vscode-descriptionForeground)]'
                }`}
                title={t(inputAreaProjection.sendTitleKey)}
                aria-label={t(inputAreaProjection.sendTitleKey)}
              >
                <SendIcon className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Stop current run */}
            {isRunActive && (
              <button
                type="button"
                onClick={onCancel}
                disabled={disabled}
                className="agent-composer-action-button agent-composer-stop"
                title={t('chat.input.cancel')}
                aria-label={t('chat.input.cancel')}
              >
                <StopIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export type { MessageAttachment, ProjectFile, SelectedFileReference };

function projectSelectedFileReference(item: MentionItem): SelectedFileReference {
  const path = item.filePath ?? item.label;
  return {
    id: `file-ref:${path}`,
    path,
    label: item.label || getReferenceBasename(path),
    ...(item.mediaType ? { mediaType: item.mediaType } : {}),
    ...(item.source ? { source: item.source } : {}),
    ...(item.thumbnailUri ? { thumbnailUri: item.thumbnailUri } : {}),
  };
}

function promoteCompletedFileReferencesFromInput(
  input: string,
  mentionItems: readonly MentionItem[],
  existingReferences: SelectedFileReference[],
): { value: string; references: SelectedFileReference[] } {
  const candidates = mentionItems.filter((item): item is MentionItem & { filePath: string } =>
    Boolean(item.filePath),
  );
  if (candidates.length === 0 || !input.includes('@')) {
    return { value: input, references: existingReferences };
  }

  let nextValue = input;
  const references = [...existingReferences];
  let changed = false;

  const sortedCandidates = [...candidates].sort(
    (left, right) => right.filePath.length - left.filePath.length,
  );
  for (const item of sortedCandidates) {
    const token = `@${item.filePath}`;
    const pattern = new RegExp(`${escapeRegExp(token)}(?=$|\\s)`, 'g');
    nextValue = nextValue.replace(pattern, () => {
      if (!references.some((reference) => reference.path === item.filePath)) {
        references.push(projectSelectedFileReference(item));
      }
      changed = true;
      return '';
    });
  }

  if (!changed) {
    return { value: input, references: existingReferences };
  }

  return { value: normalizeInputWhitespace(nextValue), references };
}

function countMediaModelsByCategory(
  models: readonly { category?: string }[],
): Record<GenCategory, number> {
  return {
    image: models.filter((model) => model.category === 'image').length,
    video: models.filter((model) => model.category === 'video').length,
    audio: models.filter((model) => model.category === 'audio').length,
  };
}

function getAvailableSessionModes(counts: Record<GenCategory, number>): SessionMode[] {
  const modes: SessionMode[] = ['agent'];
  if (counts.image > 0) modes.push('image');
  if (counts.video > 0) modes.push('video');
  if (counts.audio > 0) modes.push('audio');
  return modes;
}

function getSessionMediaModelCount(
  sessionMode: SessionMode,
  counts: Record<GenCategory, number>,
): number {
  if (sessionMode === 'image' || sessionMode === 'video' || sessionMode === 'audio') {
    return counts[sessionMode];
  }
  return 0;
}

function isMediaGenerationMode(sessionMode: SessionMode): boolean {
  return sessionMode === 'image' || sessionMode === 'video' || sessionMode === 'audio';
}

function isRoleplayConversationKind(conversationKind: ConversationKind | undefined): boolean {
  return conversationKind === 'character-dialogue' || conversationKind === 'embody-character';
}

function buildAgentLlmSendConfig(
  selectedModel: string,
  availableModels: readonly ChatModelOption[],
  llmConfig: AgentLlmConfig,
): { agentModels?: AgentModelSlots; llmConfig?: AgentLlmConfig } {
  const selectedOption = availableModels.find((option) => option.id === selectedModel);
  const primaryModel =
    selectedOption?.providerId &&
    selectedOption.modelId &&
    (selectedOption.category === undefined || selectedOption.category === 'llm')
      ? {
          providerId: selectedOption.providerId,
          modelId: selectedOption.modelId,
          category: 'llm' as const,
        }
      : null;
  const filteredConfig = filterLlmConfigForModel(selectedModel, availableModels, llmConfig);
  return {
    ...(primaryModel ? { agentModels: { primary: primaryModel } } : {}),
    ...(Object.keys(filteredConfig).length > 0 ? { llmConfig: filteredConfig } : {}),
  };
}

function MessageQueueControls({
  items,
  pendingCount,
  expanded,
  onExpandedChange,
  onPromote,
  onCancel,
  onEdit,
  t,
}: {
  items: readonly AgentQueuedMessageItem[];
  pendingCount: number;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onPromote?: (queueItemId: string) => void;
  onCancel?: (queueItemId: string) => void;
  onEdit?: (queueItemId: string) => void;
  t: InputAreaTranslator;
}) {
  const visibleItems = expanded ? items : items.slice(0, 1);
  const hasRuntimeItems = items.length > 0;
  const canExpand = items.length > 1;

  return (
    <div
      className="agent-composer-queue-panel agent-composer-pending-panel"
      role="status"
      aria-live="polite"
      title={t('chat.input.queuedMessages', {
        count: pendingCount,
      })}
    >
      <div className="agent-composer-queue-header">
        <span className="agent-composer-queue-status-dot" aria-hidden="true" />
        <span className="agent-composer-queue-title">
          {t('chat.input.queuedMessages', {
            count: pendingCount,
          })}
        </span>
        {canExpand && (
          <button
            type="button"
            className="agent-composer-queue-toggle"
            onClick={() => onExpandedChange(!expanded)}
            aria-expanded={expanded}
            title={t(expanded ? 'chat.input.queueCollapse' : 'chat.input.queueExpand')}
          >
            {t(expanded ? 'chat.input.queueCollapse' : 'chat.input.queueExpand')}
          </button>
        )}
      </div>

      {hasRuntimeItems ? (
        <div className="agent-composer-queue-list">
          {visibleItems.map((item, index) => (
            <QueuedMessageRow
              key={item.id}
              item={item}
              position={index + 1}
              onPromote={onPromote}
              onCancel={onCancel}
              onEdit={onEdit}
              t={t}
            />
          ))}
          {!expanded && items.length > 1 && (
            <div className="agent-composer-queue-more">
              {t('chat.input.queueMore', { count: items.length - 1 })}
            </div>
          )}
        </div>
      ) : (
        <div className="agent-composer-queue-pending">{t('chat.input.queueAwaitingSnapshot')}</div>
      )}
    </div>
  );
}

function QueuedMessageRow({
  item,
  position,
  onPromote,
  onCancel,
  onEdit,
  t,
}: {
  item: AgentQueuedMessageItem;
  position: number;
  onPromote?: (queueItemId: string) => void;
  onCancel?: (queueItemId: string) => void;
  onEdit?: (queueItemId: string) => void;
  t: InputAreaTranslator;
}) {
  const label = t('chat.input.queueItemLabel', { index: position });
  const isOptimistic = isOptimisticQueuedMessageItem(item);

  return (
    <div className="agent-composer-queue-row agent-composer-popover-row">
      <span className="agent-composer-queue-index" aria-hidden="true">
        {position}
      </span>
      <span className="agent-composer-queue-text" title={item.content}>
        {item.content}
      </span>
      <div className="agent-composer-queue-actions" aria-label={label}>
        <QueueActionButton
          title={t('chat.input.queueSendNext')}
          disabled={isOptimistic || !onPromote}
          onClick={() => onPromote?.(item.id)}
        >
          <SendIcon size={13} strokeWidth={2.1} />
        </QueueActionButton>
        <QueueActionButton
          title={t('chat.input.queueEdit')}
          disabled={isOptimistic || !onEdit}
          onClick={() => onEdit?.(item.id)}
        >
          <EditIcon size={13} strokeWidth={2.1} />
        </QueueActionButton>
        <QueueActionButton
          title={t('chat.input.queueCancel')}
          disabled={isOptimistic || !onCancel}
          danger
          onClick={() => onCancel?.(item.id)}
        >
          <CloseIcon size={13} strokeWidth={2.1} />
        </QueueActionButton>
      </div>
    </div>
  );
}

function QueueActionButton({
  title,
  disabled = false,
  danger = false,
  onClick,
  children,
}: {
  title: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`agent-composer-queue-action${danger ? ' is-danger' : ''}`}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function filterLlmConfigForModel(
  selectedModel: string,
  availableModels: readonly ChatModelOption[],
  llmConfig: AgentLlmConfig,
): AgentLlmConfig {
  const controls = getLlmParameterControlsForModel(selectedModel, availableModels);
  return removeUndefinedAgentLlmConfig({
    reasoningPreset: controls.reasoning ? llmConfig.reasoningPreset : undefined,
    verbosityPreset: controls.verbosity ? llmConfig.verbosityPreset : undefined,
    creativityPreset: controls.creativity ? llmConfig.creativityPreset : undefined,
    advanced: filterAdvancedLlmParamsForControls(llmConfig.advanced, controls),
  });
}

function filterAdvancedLlmParamsForControls(
  advanced: AgentLlmConfig['advanced'],
  controls: NonNullable<ChatModelOption['llmParameterControls']>,
): AgentLlmConfig['advanced'] {
  if (!advanced) return undefined;
  const filtered = removeUndefinedAgentLlmAdvancedParams({
    temperature: controls.creativity ? advanced.temperature : undefined,
    topP: controls.creativity ? advanced.topP : undefined,
    maxOutputTokens: controls.maxOutputTokens ? advanced.maxOutputTokens : undefined,
    reasoningEffort: controls.reasoning ? advanced.reasoningEffort : undefined,
    thinkingBudget: controls.reasoning ? advanced.thinkingBudget : undefined,
    verbosity: controls.verbosity ? advanced.verbosity : undefined,
    serviceTier: controls.reasoning ? advanced.serviceTier : undefined,
  });
  return Object.keys(filtered).length > 0 ? filtered : undefined;
}

function getLlmParameterControlsForModel(
  selectedModel: string,
  availableModels: readonly ChatModelOption[],
): NonNullable<ChatModelOption['llmParameterControls']> {
  const model = availableModels.find((option) => option.id === selectedModel);
  if (!model) {
    return {
      reasoning: false,
      verbosity: false,
      creativity: false,
      maxOutputTokens: false,
    };
  }
  return (
    model.llmParameterControls ?? {
      reasoning: false,
      verbosity: false,
      creativity: true,
      maxOutputTokens: true,
    }
  );
}

function removeUndefinedAgentLlmConfig(config: AgentLlmConfig): AgentLlmConfig {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== undefined),
  ) as AgentLlmConfig;
}

function removeUndefinedAgentLlmAdvancedParams(
  advanced: NonNullable<AgentLlmConfig['advanced']>,
): NonNullable<AgentLlmConfig['advanced']> {
  return Object.fromEntries(
    Object.entries(advanced).filter(([, value]) => value !== undefined),
  ) as NonNullable<AgentLlmConfig['advanced']>;
}

function appendSelectedFileReferencesToMessage(
  input: string,
  references: readonly SelectedFileReference[],
): string {
  if (references.length === 0) return input;
  const referenceText = references
    .map((reference) => formatFileReferencePath(reference.path))
    .join(' ');
  return [input.trim(), referenceText].filter(Boolean).join(' ');
}

function formatFileReferencePath(path: string): string {
  const escaped = path.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  return needsQuotedFileReference(path) ? `@"${escaped}"` : `@${path}`;
}

function needsQuotedFileReference(path: string): boolean {
  return /[\s"\\]/.test(path);
}

function getReferenceBasename(path: string): string {
  const normalized = path.replaceAll('\\', '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeInputWhitespace(value: string): string {
  return value.replace(/[ \t]{2,}/g, ' ');
}

function replaceTrailingMention(input: string, replacement: string): string {
  const range = findTrailingMentionRange(input);
  if (!range) return input;
  return normalizeInputWhitespace(
    `${input.slice(0, range.start)}${replacement}${input.slice(range.end)}`,
  );
}

function formatRoleplaySlashEntity(item: MentionItem): string {
  const entityId = getMentionEntityId(item);
  if (entityId) {
    return `entity:${entityId}`;
  }
  return item.label.includes(' ') ? `entity:${item.label}` : `@${item.label}`;
}

function formatInitialRoleplayMessage(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!trimmed.includes('"')) return ` "${trimmed}"`;
  if (!trimmed.includes("'")) return ` '${trimmed}'`;
  return ` ${trimmed.replace(/\s+/g, ' ')}`;
}

function getMentionEntityId(item: MentionItem): string | undefined {
  const fromNavigation =
    item.navigationData?.entityId ??
    item.navigationData?.characterId ??
    item.navigationData?.assetId ??
    item.navigationData?.refId ??
    item.navigationData?.id;
  if (fromNavigation) return fromNavigation;
  const prefixedId = stripKnownMentionIdPrefix(item.id);
  if (prefixedId) return prefixedId;
  if (isPlainEntityId(item.id)) return item.id;
  if (item.contextPayload?.id) return item.contextPayload.id;
  return undefined;
}

function stripKnownMentionIdPrefix(value: string): string | undefined {
  const separatorIndex = value.indexOf(':');
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) return undefined;
  const prefix = value.slice(0, separatorIndex);
  return prefix === 'character' || prefix === 'entity'
    ? value.slice(separatorIndex + 1)
    : undefined;
}

function isPlainEntityId(value: string): boolean {
  return !value.includes(':') && !value.includes('/') && !value.includes('\\');
}

/** Small icon indicating media model calls (image/video/audio generation) */
function MediaCallIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3zm1 0v8h10V3H3z" />
      <path d="M6.5 5.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2zM5 6.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0z" />
      <path d="M3 10l2.5-3 2 2.5 1.5-1.5L12 10H3z" />
    </svg>
  );
}
