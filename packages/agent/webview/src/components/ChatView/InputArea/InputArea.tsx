/**
 * InputArea Component
 * Codex-style design with inline action buttons
 */

import {
  useRef,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { SendIcon, StopIcon, PlusIcon, EditIcon, CloseIcon, FolderIcon } from '@neko/ui/icons';
import { ModeSelector } from './ModeSelector';
import { SessionModeSelector } from './SessionModeSelector';
import { ComposerConfigMenu } from './ComposerConfigMenu';
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
import { useTranslation } from '../../../i18n/I18nContext';
import { useInputHistory } from '../../../hooks/useInputHistory';
import { useInputAreaContext } from '../InputAreaContext';
import { ComposerMenuRuntimeProvider } from './composer-menu-runtime';
import { projectInputAreaUi } from '../../../presenters/input-area-presenter';
import { isOptimisticQueuedMessageItem } from '../../../presenters/message-queue-presenter';
import { projectClipboardTextToContextPayload } from '../../../presenters/clipboard-context-presenter';
import { type ChatModelOption } from '@neko/ai-contracts';
import { contentLocatorKey, type ContentLocator } from '@neko/content';
import type { AgentContextPayload } from '@neko/agent-contracts';
import { projectContentLocatorPath } from '../../../presenters/content-locator-presenter';
import type {
  AgentModelSlots,
  AgentQueuedMessageItem,
  ConversationKind,
  SessionMode,
} from '@neko/agent-contracts';
import { submitRoleplayEntrySelection } from '../roleplay-entry-action';
import { useComposerWorkspacePresentation } from '../../ComposerWorkspaceContext';

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
  }) => void;
  onCancel?: () => void;
  entryPromptMenu?: EntryPromptMenu | null;
  onEntryPromptMenuChange?: (menu: EntryPromptMenu | null) => void;
  onEntryGenerationModeSelect?: (mode: Extract<SessionMode, GenCategory>) => void;
  composerMenuState?: ComposerMenuState;
  onComposerMenuStateChange?: (state: ComposerMenuState) => void;
  disabled?: boolean;
  /** Session-bound attached files (managed by parent for conversation isolation) */
  attachedFiles?: MessageAttachment[];
  /** Callback to update attached files (when managed externally) */
  onAttachedFilesChange?: (files: MessageAttachment[]) => void;
  onAuthorizeResource?: () => Promise<AgentContextPayload | undefined>;
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
  onEntryGenerationModeSelect,
  composerMenuState: controlledComposerMenuState,
  onComposerMenuStateChange,
  disabled = false,
  attachedFiles: externalAttachedFiles,
  onAttachedFilesChange,
  onAuthorizeResource,
  selectedFileReferences: externalSelectedFileReferences,
  onSelectedFileReferencesChange,
  isComposing = false,
  onCompositionChange,
  focusRequestOwner,
  focusRequestEnabled = true,
  focusRequestTarget = 'none',
  focusRequestRevision = 0,
}: InputAreaProps) {
  const composerWorkspace = useComposerWorkspacePresentation();
  // Global configuration from context (model, modes, compression, skills)
  const {
    sessionMode,
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
    genParams,
    onGenParamsChange,
    isBusy = false,
  } = useInputAreaContext();
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    resizeTextarea(textarea, inputValue);
  }, [inputValue]);

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
      const filter = value.slice(1).split(' ')[0] ?? '';
      setSlashFilter(filter);
      setShowSlashMenu(true);
      setShowSkillMenu(false);
      setSelectedCommandIndex(0);
    } else {
      setShowSlashMenu(false);
    }

    if (allowCommandMenus && value.startsWith('$')) {
      const filter = value.slice(1).split(' ')[0] ?? '';
      setSkillFilter(filter);
      setShowSkillMenu(true);
      setShowSlashMenu(false);
      setSelectedSkillIndex(0);
    } else {
      setShowSkillMenu(false);
    }

    syncMentionMenuFromInput(value);

    resizeTextarea(e.target, value);
  };

  // Cycle execution mode: plan → ask → auto → plan
  const EXECUTION_MODES: import('@neko/agent-contracts').ShellExecutionMode[] = [
    'plan',
    'ask',
    'auto',
  ];
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
        const selectedCommand = filteredCommands[selectedCommandIndex];
        if (!selectedCommand) {
          throw new Error('Selected Agent slash command is outside the filtered catalog.');
        }
        selectSlashCommand(selectedCommand);
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
    if (!item.contentLocator) return;
    const reference = projectSelectedFileReference(item);
    replaceActiveMention('');
    updateSelectedFileReferences((prev) =>
      prev.some(
        (existing) =>
          contentLocatorKey(existing.contentLocator) ===
          contentLocatorKey(reference.contentLocator),
      )
        ? prev
        : [...prev, reference],
    );
    setShowAtMenu(false);
    textareaRef.current?.focus();
  };

  /** Handle selection from MentionMenu — locator-backed items become file tokens. */
  const handleMentionSelect = (item: MentionItem) => {
    closeEntryPromptMenu();
    if (item.contentLocator) {
      addSelectedFileReference(item);
    } else if (item.contextPayload) {
      if (!onAddContextChip) {
        throw new Error(`Context-backed mention "${item.id}" requires onAddContextChip.`);
      }
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
      ...(sessionMode === 'agent' ? buildAgentModelSendConfig(selectedModel, availableModels) : {}),
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
        if (!item) continue;
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
    if (onEntryGenerationModeSelect) {
      onEntryGenerationModeSelect(mode);
    } else {
      onSessionModeChange(mode);
    }
    textareaRef.current?.focus();
  };

  const handleEntryRoleplaySelect = (item: MentionItem) => {
    closeEntryPromptMenu();
    submitRoleplayEntrySelection(item, inputValue);
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
    currentSessionMediaModelCount,
  });
  const queuePanelCount = inputAreaProjection.queuedMessageCount;
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

        {/* Ambient canvas reference — mirrors @ quick references above the composer. */}
        {inputAreaProjection.showAmbientNodes && (
          <AmbientCanvasContextBar ambientNodes={ambientNodes} onSuggest={onInputChange} />
        )}

        {/* ── Input container ── */}
        <div className="agent-composer-shell relative">
          {composerWorkspace ? (
            <div className="agent-composer-workspace" aria-label={t('chat.input.workspace.label')}>
              <FolderIcon size={14} />
              {composerWorkspace.kind === 'assistant' ? (
                <button
                  type="button"
                  className="agent-composer-workspace-button"
                  disabled={composerWorkspace.disabled}
                  onClick={composerWorkspace.onChoose}
                >
                  {t('chat.input.workspace.choose')}
                </button>
              ) : (
                <span className="agent-composer-workspace-label" title={composerWorkspace.label}>
                  {composerWorkspace.label}
                </span>
              )}
            </div>
          ) : null}
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
              onClick={() => {
                if (onAuthorizeResource) {
                  void onAuthorizeResource().then((payload) => {
                    if (payload) onAddContextChip?.(payload);
                  });
                  return;
                }
                fileInputRef.current?.click();
              }}
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
              disabled={onAuthorizeResource !== undefined}
            />

            {(inputAreaProjection.showSessionModeSelector ||
              inputAreaProjection.showModelConfig) && (
              <ComposerMenuRuntimeProvider state={composerMenuState} update={setComposerMenuState}>
                <div
                  className="agent-composer-mode-controls"
                  role="group"
                  aria-label={t('chat.input.control.mode')}
                >
                  {inputAreaProjection.showSessionModeSelector ? (
                    <SessionModeSelector
                      mode={sessionMode}
                      onChange={onSessionModeChange}
                      availableModes={availableSessionModes}
                      disabled={isBusy}
                    />
                  ) : null}
                  {inputAreaProjection.showModelConfig ? (
                    <ComposerConfigMenu
                      activeMode={sessionMode}
                      availableModels={availableModels}
                      selectedModel={selectedModel}
                      onModelSelect={onModelSelect}
                      mediaModelSelection={mediaModelSelection}
                      availableMediaModels={availableMediaModels}
                      mediaUnderstandingModels={mediaUnderstandingModels}
                      mediaUnderstandingSelection={mediaUnderstandingSelection}
                      onMediaModelSelect={onMediaModelSelect}
                      onMediaUnderstandingModelSelect={onMediaUnderstandingModelSelect}
                      genParams={genParams}
                      onGenParamsChange={onGenParamsChange}
                      disabled={isBusy}
                    />
                  ) : null}
                </div>
              </ComposerMenuRuntimeProvider>
            )}

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
                      : 'bg-[var(--agent-control-muted-bg)] text-[var(--neko-descriptionForeground)]'
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

function resizeTextarea(textarea: HTMLTextAreaElement, value: string): void {
  textarea.style.height = 'auto';
  if (value.length > 0) {
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }
}

export type { MessageAttachment, ProjectFile, SelectedFileReference };

function projectSelectedFileReference(item: MentionItem): SelectedFileReference {
  if (!item.contentLocator) {
    throw new Error(`File mention '${item.id}' requires a content locator.`);
  }
  const path = projectContentLocatorPath(item.contentLocator);
  return {
    id: `file-ref:${path}`,
    contentLocator: item.contentLocator,
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
  const candidates = mentionItems.filter(
    (item): item is MentionItem & { contentLocator: ContentLocator } =>
      Boolean(item.contentLocator),
  );
  if (candidates.length === 0 || !input.includes('@')) {
    return { value: input, references: existingReferences };
  }

  let nextValue = input;
  const references = [...existingReferences];
  let changed = false;

  const sortedCandidates = [...candidates].sort(
    (left, right) =>
      projectContentLocatorPath(right.contentLocator).length -
      projectContentLocatorPath(left.contentLocator).length,
  );
  for (const item of sortedCandidates) {
    const itemPath = projectContentLocatorPath(item.contentLocator);
    const token = `@${itemPath}`;
    const pattern = new RegExp(`${escapeRegExp(token)}(?=$|\\s)`, 'g');
    nextValue = nextValue.replace(pattern, () => {
      if (
        !references.some(
          (reference) =>
            contentLocatorKey(reference.contentLocator) === contentLocatorKey(item.contentLocator),
        )
      ) {
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

function buildAgentModelSendConfig(
  selectedModel: string,
  availableModels: readonly ChatModelOption[],
): { agentModels?: AgentModelSlots } {
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
  return primaryModel ? { agentModels: { primary: primaryModel } } : {};
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

function appendSelectedFileReferencesToMessage(
  input: string,
  references: readonly SelectedFileReference[],
): string {
  if (references.length === 0) return input;
  const referenceText = references
    .map((reference) =>
      formatFileReferencePath(projectContentLocatorPath(reference.contentLocator)),
    )
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
