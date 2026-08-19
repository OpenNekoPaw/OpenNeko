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
import {
  SendIcon,
  StopIcon,
  PlusIcon,
  EditIcon,
  CloseIcon,
  FolderIcon,
  PanoramaIcon,
  UserIcon,
} from '@neko/ui/icons';
import { ModeSelector } from './ModeSelector';
import type { ModeSelectorOption } from './ModeSelector';
import { ComposerConfigMenu } from './ComposerConfigMenu';
import { CharacterConversationModeSelector } from './CharacterConversationModeSelector';
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
  type CharacterConversationMode,
  type SelectedFileReference,
  type SelectedCharacterLaunch,
  type SelectedWorldLaunch,
} from './types';
import {
  filterSkillInvocations,
  filterSlashCommands,
  projectAgentComposerInputCatalog,
  type SkillInvocationCatalogItem,
} from './slash-command-catalog';
import { findTrailingMentionRange, projectTrailingMention } from './mention-input';
import { AgentContextChip } from './AgentContextChip';
import { SuggestionChips } from './SuggestionChips';
import { AmbientCanvasContextBar } from './AmbientCanvasContextBar';
import { WorkspaceCanvasContextBar } from './WorkspaceCanvasContextBar';
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
import type { AgentContextPayload, ShellExecutionMode } from '@neko/agent-contracts';
import { projectContentLocatorPath } from '../../../presenters/content-locator-presenter';
import type { AgentModelSlots, AgentQueuedMessageItem, SessionMode } from '@neko/agent-contracts';
import {
  type AgentComposerCanvasPresentation,
  type AgentComposerWorkspaceTarget,
} from '../../ComposerWorkspaceContext';
import { formatMessageTime } from '../message-time';

interface InputAreaProps {
  presentation?: 'entry' | 'workspace' | 'conversation';
  composerPresentation?: 'default' | 'compact';
  approvalSurface?: ReactNode;
  inputValue: string;
  isThinking: boolean;
  /** Conversation-owned run state for queue/send/stop behavior. */
  isRunActive?: boolean;
  /** Whether the owning runtime accepts a new queued prompt while a run is active. */
  queueingEnabled?: boolean;
  queuedMessageCount?: number;
  queuedMessages?: readonly AgentQueuedMessageItem[];
  droppedFiles?: MessageAttachment[];
  onDroppedFilesProcessed?: () => void;
  onInputChange: (value: string) => void;
  onSendQueuedMessageNow?: (queueItemId: string) => void;
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
  }) => boolean | Promise<boolean>;
  onCancel?: () => void;
  entryPromptMenu?: EntryPromptMenu | null;
  onEntryPromptMenuChange?: (menu: EntryPromptMenu | null) => void;
  composerMenuState?: ComposerMenuState;
  onComposerMenuStateChange?: (state: ComposerMenuState) => void;
  disabled?: boolean;
  submissionBlocked?: boolean;
  submissionBlockedReason?: string;
  availableExecutionModes?: Readonly<Record<ShellExecutionMode, boolean>>;
  runtimeMode?: {
    readonly current: string;
    readonly options: readonly ModeSelectorOption[];
    readonly onChange: (mode: string) => void;
  };
  /** Session-bound attached files (managed by parent for conversation isolation) */
  attachedFiles?: MessageAttachment[];
  /** Callback to update attached files (when managed externally) */
  onAttachedFilesChange?: (files: MessageAttachment[]) => void;
  onAuthorizeResource?: () => Promise<AgentContextPayload | undefined>;
  attachmentsDisabled?: boolean;
  entryContextActions?: readonly {
    readonly kind: 'project' | 'character' | 'world';
    readonly label: string;
    readonly onInvoke?: () => void | Promise<void>;
    readonly disabled?: boolean;
    readonly disabledReason?: string;
  }[];
  entryContextActionsDisabled?: boolean;
  entryWorkspaceTarget?: {
    readonly label: string;
    readonly target?: AgentComposerWorkspaceTarget['target'];
  };
  workspaceCanvas?: {
    readonly workspaceLabel: string;
    readonly canvas?: AgentComposerCanvasPresentation;
    readonly showCanvasIndex?: boolean;
  };
  onClearEntryWorkspaceTarget?: () => Promise<void>;
  selectedCharacterLaunches?: readonly SelectedCharacterLaunch[];
  selectedWorldLaunch?: SelectedWorldLaunch;
  onAddCharacterLaunch?: (selection: SelectedCharacterLaunch) => void;
  onRemoveCharacterLaunch?: (characterVersionId: string) => void;
  onRemoveWorldLaunch?: () => void;
  entryCharacterConversationMode?: CharacterConversationMode;
  onEntryCharacterConversationModeChange?: (mode: CharacterConversationMode) => void;
  entryCharacterConversationModeDisabled?: boolean;
  /** Session-bound @file references selected from the mention menu. */
  selectedFileReferences?: SelectedFileReference[];
  onSelectedFileReferencesChange?: (references: SelectedFileReference[]) => void;
  isComposing?: boolean;
  onCompositionChange?: (isComposing: boolean) => void;
  focusRequestOwner?: string;
  focusRequestEnabled?: boolean;
  focusRequestTarget?: 'none' | 'input';
  focusRequestId?: string;
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
  presentation = 'conversation',
  composerPresentation = 'default',
  approvalSurface,
  inputValue,
  isThinking,
  isRunActive = isThinking,
  queueingEnabled = true,
  queuedMessageCount = 0,
  queuedMessages = [],
  droppedFiles,
  onDroppedFilesProcessed,
  onInputChange,
  onSendQueuedMessageNow,
  onCancelQueuedMessage,
  onEditQueuedMessage,
  onSend,
  onCancel,
  entryPromptMenu,
  onEntryPromptMenuChange,
  composerMenuState: controlledComposerMenuState,
  onComposerMenuStateChange,
  disabled = false,
  submissionBlocked = false,
  submissionBlockedReason,
  availableExecutionModes,
  runtimeMode,
  attachedFiles: externalAttachedFiles,
  onAttachedFilesChange,
  onAuthorizeResource,
  attachmentsDisabled = false,
  entryContextActions = [],
  entryContextActionsDisabled = false,
  entryWorkspaceTarget,
  workspaceCanvas,
  onClearEntryWorkspaceTarget,
  selectedCharacterLaunches = [],
  selectedWorldLaunch,
  onAddCharacterLaunch,
  onRemoveCharacterLaunch,
  onRemoveWorldLaunch,
  entryCharacterConversationMode,
  onEntryCharacterConversationModeChange,
  entryCharacterConversationModeDisabled = false,
  selectedFileReferences: externalSelectedFileReferences,
  onSelectedFileReferencesChange,
  isComposing = false,
  onCompositionChange,
  focusRequestOwner,
  focusRequestEnabled = true,
  focusRequestTarget = 'none',
  focusRequestId,
}: InputAreaProps) {
  // Global configuration from context (model, modes, compression, skills)
  const {
    sessionMode,
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
    mediaModelOptOutEnabled,
    mediaUnderstandingModels,
    mediaUnderstandingSelection,
    onMediaModelSelect,
    onMediaUnderstandingModelSelect,
    inputCatalog,
    configurationPolicy,
    inputCatalogPhase,
    inputCatalogBindingKind,
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
    if (!focusRequestEnabled || focusRequestTarget !== 'input' || !focusRequestId) {
      return;
    }
    textareaRef.current?.focus();
  }, [focusRequestEnabled, focusRequestId, focusRequestOwner, focusRequestTarget]);
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
  const inputValueRef = useRef(inputValue);
  const attachedFilesRef = useRef(attachedFiles);
  const selectedFileReferencesRef = useRef(selectedFileReferences);
  const contextChipsRef = useRef(contextChips);
  inputValueRef.current = inputValue;
  attachedFilesRef.current = attachedFiles;
  selectedFileReferencesRef.current = selectedFileReferences;
  contextChipsRef.current = contextChips;

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
  const canonicalInputCatalog =
    inputCatalog && inputCatalogPhase && inputCatalogBindingKind
      ? projectAgentComposerInputCatalog({
          entries: inputCatalog,
          phase: inputCatalogPhase,
          bindingKind: inputCatalogBindingKind,
        })
      : { commands: [], skills: [] };
  const slashCommands = canonicalInputCatalog.commands;
  const filteredCommands = sortSlashCommandsForDisplay(
    filterSlashCommands(slashCommands, slashFilter, t),
  );
  const skillInvocations = canonicalInputCatalog.skills;
  const filteredSkillInvocations = sortSkillInvocationsForDisplay(
    filterSkillInvocations(skillInvocations, skillFilter, t),
  );
  const filteredMentionItems = getFilteredMentionItems(mentionItems, atFilter);
  const currentSessionMediaModelCount = 0;
  const showEntryPromptMenu = Boolean(entryPromptMenu);
  const allowCommandMenus = slashCommands.length > 0 || skillInvocations.length > 0;
  const modelConfigurationPolicy = configurationPolicy?.fields.model.policy;
  const executionModePolicy = configurationPolicy?.fields.executionMode.policy;
  const modelConfigurationLocked = modelConfigurationPolicy?.status === 'locked';
  const executionModeLocked = executionModePolicy?.status === 'locked';
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
      if (
        inputCatalogBindingKind === 'workspace' &&
        lastRequestedMentionFilterRef.current !== trailingMention.requestFilter
      ) {
        lastRequestedMentionFilterRef.current = trailingMention.requestFilter;
        onRequestFiles?.(trailingMention.requestFilter);
      }
    },
    [inputCatalogBindingKind, onRequestFiles, setAtFilter, setSelectedFileIndex, setShowAtMenu],
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
    if (allowCommandMenus && /^\/[^\s]*$/u.test(value)) {
      const filter = value.slice(1).split(' ')[0] ?? '';
      setSlashFilter(filter);
      setShowSlashMenu(true);
      setShowSkillMenu(false);
      setSelectedCommandIndex(0);
    } else {
      setShowSlashMenu(false);
    }

    if (allowCommandMenus && /^\$[^\s]*$/u.test(value)) {
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

  // Cycle the mode catalog owned by the active runtime.
  const cycleExecutionMode = useCallback(() => {
    if (executionModeLocked) return;
    if (runtimeMode !== undefined) {
      const available = runtimeMode.options.filter((option) => !option.disabled);
      const index = available.findIndex((option) => option.id === runtimeMode.current);
      const next = available[(index + 1) % available.length];
      if (next !== undefined) runtimeMode.onChange(next.id);
      return;
    }
    const modes: readonly ShellExecutionMode[] = ['plan', 'ask', 'auto'];
    const index = modes.indexOf(executionMode);
    onExecutionModeChange(modes[(index + 1) % modes.length]!);
  }, [executionMode, executionModeLocked, onExecutionModeChange, runtimeMode]);

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
    if (showAtMenu) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowAtMenu(false);
        return;
      }
      if (filteredMentionItems.length > 0) {
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
    if (presentation === 'entry' && item.contextPayload) {
      if (!onAddContextChip) {
        throw new Error(`Context-backed mention "${item.id}" requires onAddContextChip.`);
      }
      replaceActiveMention('');
      onAddContextChip(item.contextPayload);
      setShowAtMenu(false);
      textareaRef.current?.focus();
    } else if (item.contentLocator) {
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
    const hasSelectedFileReferences = selectedFileReferences.length > 0;
    if (
      !inputValue.trim() &&
      attachedFiles.length === 0 &&
      contextChips.length === 0 &&
      !hasSelectedFileReferences
    ) {
      return;
    }
    const files = attachedFiles.length > 0 ? attachedFiles : undefined;
    const contextPayloads = contextChips.length > 0 ? contextChips : undefined;
    const submittedInputValue = inputValue;
    const submittedFileIds = new Set(attachedFiles.map((file) => file.id));
    const submittedReferenceKeys = new Set(
      selectedFileReferences.map((reference) => contentLocatorKey(reference.contentLocator)),
    );
    const submittedContextChipIds = new Set(contextChips.map((chip) => chip.id));
    const receipt = onSend({
      messageText: inputValue,
      displayMessageText: inputValue,
      sessionMode,
      attachments: files,
      contextPayloads,
      fileReferences: hasSelectedFileReferences ? selectedFileReferences : undefined,
      ...(sessionMode === 'agent' ? buildAgentModelSendConfig(selectedModel, availableModels) : {}),
    });
    const consumeAcceptedDraft = (accepted: boolean): void => {
      if (!accepted) return;
      if (submittedInputValue.trim()) addToHistory(submittedInputValue);
      if (inputValueRef.current === submittedInputValue) onInputChange('');
      for (const chip of contextChipsRef.current) {
        if (submittedContextChipIds.has(chip.id)) onRemoveContextChip(chip.id);
      }
      const remainingFiles = attachedFilesRef.current.filter(
        (file) => !submittedFileIds.has(file.id),
      );
      if (onAttachedFilesChange) onAttachedFilesChange(remainingFiles);
      else setInternalAttachedFiles(remainingFiles);
      const remainingReferences = selectedFileReferencesRef.current.filter(
        (reference) => !submittedReferenceKeys.has(contentLocatorKey(reference.contentLocator)),
      );
      if (onSelectedFileReferencesChange) onSelectedFileReferencesChange(remainingReferences);
      else setInternalSelectedFileReferences(remainingReferences);
    };
    if (typeof receipt === 'boolean') {
      consumeAcceptedDraft(receipt);
      return;
    }
    void receipt.then(consumeAcceptedDraft);
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

  const handleEntryRoleplaySelect = (item: MentionItem) => {
    closeEntryPromptMenu();
    const selection = item.characterLaunchSelection;
    if (!selection || !onAddCharacterLaunch) {
      throw new Error('Character selection requires an exact Character launch handler.');
    }
    onAddCharacterLaunch({
      globalCharacterId: selection.globalCharacterId,
      characterVersionId: selection.characterVersionId,
      label: item.label,
    });
    textareaRef.current?.focus();
  };

  const projectedQueuedMessageCount = Math.max(queuedMessageCount, queuedMessages.length);
  const inputAreaProjection = projectInputAreaUi({
    presentation,
    inputValue,
    attachedFileCount: attachedFiles.length + selectedFileReferences.length,
    contextChipCount: contextChips.length,
    ambientNodeCount: ambientNodes.length,
    mediaModelCallCount,
    isThinking: isRunActive,
    queueingEnabled,
    queuedMessageCount: projectedQueuedMessageCount,
    disabled,
    sessionMode,
    conversationKind,
    configurationPolicy,
    currentSessionMediaModelCount,
    compactControls: composerPresentation === 'compact',
    submissionBlocked: submissionBlocked || submissionBlockedReason !== undefined,
  });
  const queuePanelCount = inputAreaProjection.queuedMessageCount;
  const attachmentInputDisabled = disabled;
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
            onSendNow={onSendQueuedMessageNow}
            onCancel={onCancelQueuedMessage}
            onEdit={onEditQueuedMessage}
            t={t}
          />
        )}

        {/* Ambient canvas reference — mirrors @ quick references above the composer. */}
        {inputAreaProjection.showAmbientNodes && (
          <AmbientCanvasContextBar ambientNodes={ambientNodes} onSuggest={onInputChange} />
        )}

        {approvalSurface}

        {workspaceCanvas ? (
          <WorkspaceCanvasContextBar
            workspaceLabel={workspaceCanvas.workspaceLabel}
            canvas={workspaceCanvas.canvas}
            disabled={disabled}
            showCanvasIndex={workspaceCanvas.showCanvasIndex}
          />
        ) : null}

        {presentation === 'entry' &&
        (entryContextActions.length > 0 ||
          entryWorkspaceTarget ||
          selectedCharacterLaunches.length > 0 ||
          selectedWorldLaunch) ? (
          <div
            className="agent-entry-binding-bar"
            aria-label={t('chat.entryContext.bindingBar')}
            data-entry-binding-bar="true"
            data-entry-context-actions="true"
          >
            {entryContextActions.map((action) => (
              <EntryContextActionButton
                key={action.kind}
                action={action}
                composerDisabled={entryContextActionsDisabled}
              />
            ))}
            {entryWorkspaceTarget ? (
              <EntryBindingItem
                kind={entryWorkspaceTarget.target?.kind ?? 'content-document'}
                label={entryWorkspaceTarget.label}
                removeLabel={t('chat.entryContext.clearTarget')}
                onRemove={
                  onClearEntryWorkspaceTarget ? () => void onClearEntryWorkspaceTarget() : undefined
                }
              />
            ) : null}
            {selectedCharacterLaunches.map((selection) => (
              <EntryBindingItem
                key={selection.characterVersionId}
                kind="character-dialogue"
                label={selection.label}
                removeLabel={t('chat.entryContext.clearTarget')}
                onRemove={
                  onRemoveCharacterLaunch
                    ? () => onRemoveCharacterLaunch(selection.characterVersionId)
                    : undefined
                }
              />
            ))}
            {selectedWorldLaunch ? (
              <EntryBindingItem
                kind="world-experience"
                label={selectedWorldLaunch.label}
                removeLabel={t('chat.entryContext.clearTarget')}
                onRemove={onRemoveWorldLaunch}
              />
            ) : null}
          </div>
        ) : null}

        {/* ── Input container ── */}
        <div className="agent-composer-shell relative">
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
            onSelectFile={handleMentionSelect}
            onSelectContext={(payload) => {
              if (onAddContextChip) {
                replaceActiveMention('');
                onAddContextChip(payload);
                setShowAtMenu(false);
                textareaRef.current?.focus();
              }
            }}
            onSelectItem={handleMentionSelect}
            onClose={() => setShowAtMenu(false)}
          />

          <ComposerEntryPromptMenu
            isOpen={showEntryPromptMenu}
            mentionItems={mentionItems}
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
              aria-label={t('chat.input.message')}
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

          {submissionBlockedReason ? (
            <p className="agent-composer-validation" role="status">
              {submissionBlockedReason}
            </p>
          ) : null}

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
              disabled={attachmentInputDisabled || attachmentsDisabled}
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
              disabled={attachmentInputDisabled || onAuthorizeResource !== undefined}
            />

            {inputAreaProjection.showModelConfig && (
              <ComposerMenuRuntimeProvider state={composerMenuState} update={setComposerMenuState}>
                <div
                  className="agent-composer-mode-controls"
                  role="group"
                  aria-label={t('chat.input.control.mode')}
                >
                  {inputAreaProjection.showModelConfig ? (
                    <ComposerConfigMenu
                      activeMode={sessionMode}
                      availableModels={availableModels}
                      selectedModel={selectedModel}
                      onModelSelect={onModelSelect}
                      mediaModelSelection={mediaModelSelection}
                      availableMediaModels={availableMediaModels}
                      mediaModelOptOutEnabled={mediaModelOptOutEnabled}
                      mediaUnderstandingModels={mediaUnderstandingModels}
                      mediaUnderstandingSelection={mediaUnderstandingSelection}
                      onMediaModelSelect={onMediaModelSelect}
                      onMediaUnderstandingModelSelect={onMediaUnderstandingModelSelect}
                      genParams={genParams}
                      onGenParamsChange={onGenParamsChange}
                      disabled={isBusy || modelConfigurationLocked}
                      disabledReason={
                        modelConfigurationPolicy?.status === 'locked'
                          ? modelConfigurationPolicy.reason
                          : undefined
                      }
                    />
                  ) : null}
                  {presentation === 'entry' && entryCharacterConversationMode ? (
                    <CharacterConversationModeSelector
                      mode={entryCharacterConversationMode}
                      onChange={(mode) => onEntryCharacterConversationModeChange?.(mode)}
                      disabled={
                        entryCharacterConversationModeDisabled ||
                        onEntryCharacterConversationModeChange === undefined
                      }
                    />
                  ) : null}
                </div>
              </ComposerMenuRuntimeProvider>
            )}

            {/* Token usage pie */}
            {presentation === 'conversation' ? (
              <UsageIndicator
                tokenCount={contextTokenCount}
                maxTokens={maxContextTokens}
                maxOutputTokens={outputTokenCap}
                modelMaxOutputTokens={modelMaxOutputTokens}
                isCompressing={isCompressing}
                onCompress={onCompressContext}
              />
            ) : null}

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
                <ModeSelector
                  mode={runtimeMode?.current ?? executionMode}
                  onChange={(mode) => {
                    if (runtimeMode !== undefined) {
                      runtimeMode.onChange(mode);
                      return;
                    }
                    if (mode !== 'plan' && mode !== 'ask' && mode !== 'auto') {
                      throw new Error(`Unsupported shell execution mode '${mode}'.`);
                    }
                    onExecutionModeChange(mode);
                  }}
                  options={runtimeMode?.options}
                  disabled={executionModeLocked}
                  disabledReason={
                    executionModePolicy?.status === 'locked'
                      ? executionModePolicy.reason
                      : undefined
                  }
                  availableModes={availableExecutionModes}
                />
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
                title={submissionBlockedReason ?? t(inputAreaProjection.sendTitleKey)}
                aria-label={submissionBlockedReason ?? t(inputAreaProjection.sendTitleKey)}
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

function EntryContextActionButton({
  action,
  composerDisabled,
}: {
  readonly action: NonNullable<InputAreaProps['entryContextActions']>[number];
  readonly composerDisabled: boolean;
}): JSX.Element {
  const icon =
    action.kind === 'character' ? (
      <UserIcon size={14} />
    ) : action.kind === 'world' ? (
      <PanoramaIcon size={14} />
    ) : (
      <FolderIcon size={14} />
    );
  const actionDisabled = composerDisabled || action.disabled || !action.onInvoke;

  return (
    <button
      type="button"
      className="agent-entry-context-action"
      data-entry-context-action={action.kind}
      disabled={actionDisabled}
      title={action.disabledReason ?? action.label}
      aria-label={action.label}
      onClick={() => void action.onInvoke?.()}
    >
      {icon}
      <span>{action.label}</span>
    </button>
  );
}

function EntryBindingItem({
  kind,
  label,
  removeLabel,
  onRemove,
}: {
  readonly kind:
    | NonNullable<AgentComposerWorkspaceTarget['target']>['kind']
    | 'character-dialogue'
    | 'world-experience';
  readonly label: string;
  readonly removeLabel: string;
  readonly onRemove?: () => void;
}): JSX.Element {
  const icon =
    kind === 'character-project' || kind === 'character-dialogue' ? (
      <UserIcon size={14} />
    ) : kind === 'world-project' || kind === 'world-experience' ? (
      <PanoramaIcon size={14} />
    ) : (
      <FolderIcon size={14} />
    );

  return (
    <span className="agent-entry-binding-item" data-entry-binding-kind={kind} title={label}>
      <span className="agent-entry-binding-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="agent-entry-binding-label">{label}</span>
      {onRemove ? (
        <button
          type="button"
          className="agent-entry-binding-remove"
          aria-label={`${removeLabel}: ${label}`}
          onClick={onRemove}
        >
          <CloseIcon size={12} />
        </button>
      ) : null}
    </span>
  );
}

function resizeTextarea(textarea: HTMLTextAreaElement, value: string): void {
  textarea.style.height = 'auto';
  delete textarea.dataset.overflowing;
  if (value.length === 0) return;

  textarea.style.height = `${textarea.scrollHeight}px`;
  if (textarea.scrollHeight > textarea.clientHeight) {
    textarea.dataset.overflowing = 'true';
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
  onSendNow,
  onCancel,
  onEdit,
  t,
}: {
  items: readonly AgentQueuedMessageItem[];
  pendingCount: number;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onSendNow?: (queueItemId: string) => void;
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
              onSendNow={onSendNow}
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
  onSendNow,
  onCancel,
  onEdit,
  t,
}: {
  item: AgentQueuedMessageItem;
  position: number;
  onSendNow?: (queueItemId: string) => void;
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
      <span className="agent-composer-queue-content">
        <span className="agent-composer-queue-text" title={item.content}>
          {item.content}
        </span>
        <span className="agent-composer-queue-meta" data-queued-message-status>
          {t('chat.input.queueItemWaiting')} · {formatMessageTime(item.createdAt)}
        </span>
      </span>
      <div className="agent-composer-queue-actions" aria-label={label}>
        <QueueActionButton
          title={t('chat.input.queueSendNow')}
          disabled={isOptimistic || !onSendNow}
          onClick={() => onSendNow?.(item.id)}
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
