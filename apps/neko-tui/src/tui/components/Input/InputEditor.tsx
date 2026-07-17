/**
 * InputEditor Component
 *
 * Multi-line text input with command history and slash command menu.
 * - Enter: submit input (or select menu item when menu is open)
 * - Shift+Enter / Ctrl+J: add newline (multi-line mode)
 * - Up/Down: navigate command history (or menu items)
 * - /, $, @: prefix triggers inline command, Skill, or reference menu
 * - Esc: dismiss menu
 * - Tab: select menu item
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { tokens } from '../../theme/tokens';
import type { SlashCommandOption } from './SlashCommandMenu';
import {
  deriveInputSuggestionMenu,
  selectInputSuggestion,
  type InputSuggestionOption,
} from './input-suggestions';
import { useAgentTerminalPresentation } from '../../presentation/react-context';
import { presentSuggestionKind } from '../../presentation/terminal-label-presentation';
import { ReferenceAwareText } from '../shared/ReferenceAwareText';

export interface InputEditorDraftRequest {
  readonly id: string;
  readonly content: string;
  readonly apply: () => boolean;
  readonly onConflict: (currentDraft: string) => void;
}

interface InputEditorProps {
  /** Called when user submits a prompt */
  readonly onSubmit: (text: string) => void;
  /** Whether a modal surface currently owns keyboard input. */
  readonly disabled?: boolean;
  /** Prompt prefix character */
  readonly prompt?: string;
  /** Called when slash command detected (starts with /) */
  readonly onSlashCommand?: (input: string) => void;
  /** Called when direct Skill invocation detected (starts with $) */
  readonly onSkillInvocation?: (input: string) => void;
  /** Available slash commands for menu/autocomplete */
  readonly commands?: readonly SlashCommandOption[];
  /** Enabled Skill invocation suggestions for `$` namespace */
  readonly skills?: readonly InputSuggestionOption[];
  /** Terminal-safe file/context/reference suggestions for `@` namespace */
  readonly references?: readonly InputSuggestionOption[];
  /** Called when the active `@` filter changes so hosts can refresh references lazily. */
  readonly onReferenceQueryChange?: (query: string) => void;
  /** Moves a queued user message into an empty composer without silently replacing a draft. */
  readonly draftRequest?: InputEditorDraftRequest | null;
}

const MAX_HISTORY = 50;

interface InputKey {
  readonly upArrow: boolean;
  readonly downArrow: boolean;
  readonly leftArrow: boolean;
  readonly rightArrow: boolean;
  readonly pageDown: boolean;
  readonly pageUp: boolean;
  readonly return: boolean;
  readonly escape: boolean;
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly tab: boolean;
  readonly backspace: boolean;
  readonly delete: boolean;
  readonly meta: boolean;
}

interface InputEvent {
  readonly input: string;
  readonly key: InputKey;
}

export function InputEditor({
  onSubmit,
  disabled = false,
  prompt = '>',
  onSlashCommand,
  onSkillInvocation,
  commands = [],
  skills = [],
  references = [],
  onReferenceQueryChange,
  draftRequest,
}: InputEditorProps): React.JSX.Element {
  const [value, setValue] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuIndex, setMenuIndex] = useState(0);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const valueRef = useRef(value);
  const menuOpenRef = useRef(menuOpen);
  const menuIndexRef = useRef(menuIndex);
  const handledDraftRequestIdRef = useRef<string | null>(null);

  const activeMenu = menuOpen
    ? deriveInputSuggestionMenu(value, { commands, skills, references })
    : null;
  const filtered = activeMenu?.options ?? [];
  const presentation = useAgentTerminalPresentation();

  valueRef.current = value;
  menuOpenRef.current = menuOpen;
  menuIndexRef.current = menuIndex;

  const addToHistory = useCallback((entry: string) => {
    const history = historyRef.current;
    if (history[0] !== entry) {
      history.unshift(entry);
      if (history.length > MAX_HISTORY) history.pop();
    }
    historyIndexRef.current = -1;
  }, []);

  const updateValue = useCallback((next: string) => {
    valueRef.current = next;
    setValue(next);
  }, []);

  const updateMenuOpen = useCallback((next: boolean) => {
    menuOpenRef.current = next;
    setMenuOpen(next);
  }, []);

  const updateMenuIndex = useCallback((next: number) => {
    menuIndexRef.current = next;
    setMenuIndex(next);
  }, []);

  useEffect(() => {
    if (!draftRequest || handledDraftRequestIdRef.current === draftRequest.id) {
      return;
    }
    handledDraftRequestIdRef.current = draftRequest.id;

    const currentDraft = valueRef.current;
    if (currentDraft.trim()) {
      draftRequest.onConflict(currentDraft);
      return;
    }
    if (!draftRequest.apply()) {
      return;
    }

    updateValue(draftRequest.content);
    updateMenuOpen(false);
    updateMenuIndex(0);
    historyIndexRef.current = -1;
  }, [draftRequest, updateMenuIndex, updateMenuOpen, updateValue]);

  useEffect(() => {
    if (activeMenu?.trigger !== '@') {
      return;
    }
    onReferenceQueryChange?.(activeMenu.filterText);
  }, [activeMenu?.filterText, activeMenu?.trigger, onReferenceQueryChange]);

  useInput(
    (input, key) => {
      if (disabled) return;

      for (const event of normalizeInputEvents(input, key)) {
        const eventInput = event.input;
        const eventKey = event.key;
        const currentValue = valueRef.current;
        const currentMenuOpen = menuOpenRef.current;
        const currentMenuIndex = menuIndexRef.current;
        const currentMenu = deriveInputSuggestionMenu(currentValue, {
          commands,
          skills,
          references,
        });
        const currentFiltered = currentMenu?.options ?? [];
        const isReturnKey = eventKey.return || eventInput === '\r' || eventInput === '\n';
        const isBackspaceKey =
          eventKey.backspace || eventKey.delete || eventInput === '\b' || eventInput === '\u007F';
        const isEscapeKey = eventKey.escape || eventInput === '\u001B';

        // --- Menu open: intercept navigation keys ---
        if (currentMenuOpen) {
          if (isEscapeKey) {
            updateMenuOpen(false);
            return;
          }

          if (eventKey.upArrow) {
            updateMenuIndex(Math.max(0, currentMenuIndex - 1));
            return;
          }

          if (eventKey.downArrow) {
            updateMenuIndex(Math.min(currentFiltered.length - 1, currentMenuIndex + 1));
            return;
          }

          // Tab or Enter on menu → select command and fill input
          if (eventKey.tab || (isReturnKey && !eventKey.shift)) {
            const selected = currentFiltered[currentMenuIndex];
            if (selected) {
              updateValue(selectInputSuggestion(selected));
              updateMenuOpen(false);
              updateMenuIndex(0);
            }
            return;
          }

          // Backspace in menu
          if (isBackspaceKey) {
            const next = currentValue.slice(0, -1);
            if (!deriveInputSuggestionMenu(next, { commands, skills, references })) {
              updateMenuOpen(false);
            }
            updateValue(next);
            updateMenuIndex(0);
            return;
          }

          // Regular typing while menu open — update filter
          if (eventInput && !eventKey.ctrl && !eventKey.meta && isPrintableInput(eventInput)) {
            const next = currentValue + eventInput;
            if (!deriveInputSuggestionMenu(next, { commands, skills, references })) {
              updateMenuOpen(false);
            }
            updateValue(next);
            updateMenuIndex(0);
            return;
          }

          return;
        }

        // --- Normal mode ---

        // Enter → submit
        if (isReturnKey && !eventKey.shift) {
          const trimmed = currentValue.trim();
          if (!trimmed) return;

          if (trimmed.startsWith('/') && onSlashCommand) {
            onSlashCommand(trimmed);
            updateValue('');
            return;
          }

          if (trimmed.startsWith('$') && onSkillInvocation) {
            onSkillInvocation(trimmed);
            updateValue('');
            return;
          }

          addToHistory(trimmed);
          onSubmit(trimmed);
          updateValue('');
          return;
        }

        // Shift+Enter or Ctrl+J → newline
        if ((eventKey.return && eventKey.shift) || (eventInput === 'j' && eventKey.ctrl)) {
          updateValue(currentValue + '\n');
          return;
        }

        // Up arrow → previous history entry
        if (eventKey.upArrow) {
          const history = historyRef.current;
          if (history.length === 0) return;
          const idx = Math.min(historyIndexRef.current + 1, history.length - 1);
          historyIndexRef.current = idx;
          const entry = history[idx];
          if (entry !== undefined) updateValue(entry);
          return;
        }

        // Down arrow → next history entry
        if (eventKey.downArrow) {
          if (historyIndexRef.current <= 0) {
            historyIndexRef.current = -1;
            updateValue('');
            return;
          }
          historyIndexRef.current -= 1;
          const entry = historyRef.current[historyIndexRef.current];
          if (entry !== undefined) updateValue(entry);
          return;
        }

        // Backspace
        if (isBackspaceKey) {
          updateValue(currentValue.slice(0, -1));
          return;
        }

        // Ignore other control keys
        if (eventKey.ctrl || eventKey.meta) return;

        // Regular character input
        if (eventInput && isPrintableInput(eventInput)) {
          const next = currentValue + eventInput;
          updateValue(next);
          historyIndexRef.current = -1;

          // Open menu when typing `/` at the start
          if (deriveInputSuggestionMenu(next, { commands, skills, references })) {
            updateMenuOpen(true);
            updateMenuIndex(0);
          }
        }
      }
    },
    { isActive: !disabled },
  );

  const lines = value.split('\n');
  const isMultiLine = lines.length > 1;
  const isEmpty = value === '';

  return (
    <Box flexDirection="column">
      {/* Slash command menu — above the input box */}
      {activeMenu && filtered.length > 0 ? (
        <SuggestionMenu
          trigger={activeMenu.trigger}
          items={filtered}
          selectedIndex={menuIndex}
          moreLabel={presentation.t('agent.terminal.chrome.more')}
          presentKind={(kind) => presentSuggestionKind(kind, presentation)}
          maxVisible={8}
        />
      ) : null}

      {/* Input box */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={disabled ? tokens.muted : 'white'}
        paddingLeft={1}
        paddingRight={1}
      >
        {isMultiLine ? (
          <Text dimColor> {presentation.t('agent.terminal.chrome.multiLineHint')}</Text>
        ) : null}

        {isEmpty && !disabled ? (
          <Box>
            <Text bold>{prompt} </Text>
            <Text color={tokens.muted}>▋</Text>
          </Box>
        ) : (
          lines.map((line, idx) => (
            <Box key={idx}>
              <Text color={disabled ? tokens.muted : undefined} bold>
                {idx === 0 ? `${prompt} ` : '  '}
              </Text>
              <ReferenceAwareText
                text={line}
                color={disabled ? tokens.muted : undefined}
                showCursor={idx === lines.length - 1 && !disabled}
              />
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}

function isPrintableInput(input: string): boolean {
  return Array.from(input).every((char) => {
    const codePoint = char.codePointAt(0);
    return codePoint !== undefined && codePoint >= 32 && codePoint !== 127;
  });
}

function normalizeInputEvents(input: string, key: InputKey): readonly InputEvent[] {
  if (input.length <= 1) {
    return [{ input, key }];
  }

  return Array.from(input, (char) => ({
    input: char,
    key: keyForInputChar(char),
  }));
}

function keyForInputChar(input: string): InputKey {
  return {
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageDown: false,
    pageUp: false,
    return: input === '\r' || input === '\n',
    escape: input === '\u001B',
    ctrl: false,
    shift: /^[A-Z]$/.test(input),
    tab: input === '\t',
    backspace: input === '\b' || input === '\u007F',
    delete: input === '\u007F',
    meta: false,
  };
}

// =============================================================================
// SlashMenu — bordered, scrollable command menu
// =============================================================================

interface SuggestionMenuProps {
  readonly trigger: '/' | '$' | '@';
  readonly items: readonly InputSuggestionOption[];
  readonly selectedIndex: number;
  readonly moreLabel: string;
  readonly presentKind: (kind: string) => string;
  /** Max visible rows before scrolling */
  readonly maxVisible?: number;
}

function SuggestionMenu({
  trigger,
  items,
  selectedIndex,
  moreLabel,
  presentKind,
  maxVisible = 8,
}: SuggestionMenuProps): React.JSX.Element {
  const total = items.length;
  const visibleCount = Math.min(total, maxVisible);

  // Compute scroll window that keeps selectedIndex visible
  let scrollTop = 0;
  if (total > visibleCount) {
    // Keep selected item roughly centered, clamped to bounds
    scrollTop = Math.max(
      0,
      Math.min(selectedIndex - Math.floor(visibleCount / 2), total - visibleCount),
    );
  }

  const visible = items.slice(scrollTop, scrollTop + visibleCount);
  const hasScrollUp = scrollTop > 0;
  const hasScrollDown = scrollTop + visibleCount < total;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={tokens.muted}
      paddingLeft={1}
      paddingRight={1}
      marginLeft={2}
    >
      {/* Scroll-up indicator */}
      {hasScrollUp ? (
        <Text dimColor>
          {' '}
          ↑ {scrollTop} {moreLabel}
        </Text>
      ) : null}

      {visible.map((item, visIdx) => {
        const realIdx = scrollTop + visIdx;
        const isSelected = realIdx === selectedIndex;
        return (
          <Box key={`${item.trigger}:${item.name}`}>
            <Text color={isSelected ? tokens.info : undefined} bold={isSelected}>
              {isSelected ? '▸ ' : '  '}
              {trigger}
              {item.name}
            </Text>
            {item.kind ? <Text dimColor> [{presentKind(item.kind)}]</Text> : null}
            {item.description ? <Text dimColor> {item.description}</Text> : null}
          </Box>
        );
      })}

      {/* Scroll-down indicator */}
      {hasScrollDown ? (
        <Text dimColor>
          {' '}
          ↓ {total - scrollTop - visibleCount} {moreLabel}
        </Text>
      ) : null}
    </Box>
  );
}
