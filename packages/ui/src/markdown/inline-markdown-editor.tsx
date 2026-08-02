import type React from 'react';
import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type UIEvent } from 'react';
import type {
  MarkdownCompletionItem,
  MarkdownCompletionProvider,
  MarkdownCompletionState,
  MarkdownEditorProfile,
  MarkdownSemanticSpan,
  MarkdownTokenRenderer,
  MarkdownUiDiagnostic,
} from './types';
import { useMarkdownProjection } from './use-markdown-projection';
import { MarkdownInlineText } from './markdown-inline-text';
import { MarkdownGenerationPromptParts } from './markdown-generation-prompt-parts';
import { MarkdownCompletionPopover } from './markdown-completion-popover';
import { MarkdownDiagnostics } from './markdown-diagnostics';
import { getKeyboardBoundaryMetadata } from '../keyboard';
import { cn } from '../utils';

export interface InlineMarkdownEditorProps<TContext = unknown> {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly profile?: MarkdownEditorProfile;
  readonly placeholder?: string;
  readonly ariaLabel?: string;
  readonly keyboardOwnerId: string;
  readonly rows?: number;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly textareaClassName?: string;
  readonly surfaceClassName?: string;
  readonly highlightClassName?: string;
  readonly diagnosticsClassName?: string;
  readonly surfaceStyle?: React.CSSProperties;
  readonly semanticSpans?: readonly MarkdownSemanticSpan[];
  readonly diagnostics?: readonly MarkdownUiDiagnostic[];
  readonly completionProviders?: readonly MarkdownCompletionProvider<TContext>[];
  readonly callerContext?: TContext;
  readonly renderToken?: MarkdownTokenRenderer;
  readonly textareaRef?: (element: HTMLTextAreaElement | null) => void;
  readonly textareaDataAttributes?: Record<`data-${string}`, string | undefined>;
  readonly onBlur?: () => void;
  readonly onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  readonly onKeyUp?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  readonly onKeyPress?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}

const DEFAULT_OWNED_KEYS = [
  'Backspace',
  'Delete',
  'Enter',
  'Escape',
  'Space',
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
] as const;

export function InlineMarkdownEditor<TContext = unknown>({
  value,
  onChange,
  profile = 'plain-markdown',
  placeholder,
  ariaLabel,
  keyboardOwnerId,
  rows = 4,
  disabled = false,
  className,
  textareaClassName,
  surfaceClassName,
  highlightClassName,
  diagnosticsClassName,
  surfaceStyle,
  semanticSpans,
  diagnostics = [],
  completionProviders = [],
  callerContext,
  renderToken,
  textareaRef,
  textareaDataAttributes,
  onBlur,
  onKeyDown,
  onKeyUp,
  onKeyPress,
}: InlineMarkdownEditorProps<TContext>): React.ReactElement {
  const highlightRef = useRef<HTMLDivElement>(null);
  const internalTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const projectionResult = useMarkdownProjection({
    value,
    profile,
    semanticSpans,
    diagnostics,
  });
  const [completionState, setCompletionState] = useState<MarkdownCompletionState<TContext> | null>(
    null,
  );
  const editorDiagnostics = useMemo(
    () =>
      completionState?.items.length === 0
        ? [
            ...projectionResult.diagnostics,
            {
              severity: 'info' as const,
              code: 'markdown-ui-no-completions',
              phase: 'project' as const,
              parameters: {},
              message: 'No completions are available for this trigger.',
              source: 'editor' as const,
            },
          ]
        : projectionResult.diagnostics,
    [completionState?.items.length, projectionResult.diagnostics],
  );

  const handleScroll = useCallback((event: UIEvent<HTMLTextAreaElement>) => {
    const highlight = highlightRef.current;
    if (!highlight) return;
    highlight.scrollTop = event.currentTarget.scrollTop;
    highlight.scrollLeft = event.currentTarget.scrollLeft;
  }, []);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(event.currentTarget.value);
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) return;

      if (completionState && (event.key === 'Enter' || event.key === 'Tab')) {
        const selected = completionState.items[0];
        if (selected) {
          event.preventDefault();
          applyCompletion(value, selected, onChange, setCompletionState);
        }
        return;
      }

      if (event.key === 'Escape') {
        setCompletionState(null);
        return;
      }

      if (isCompletionTrigger(event.key, completionProviders)) {
        const cursor = event.currentTarget.selectionStart ?? value.length;
        const context = {
          value,
          cursor,
          profile,
          projection: projectionResult.projection,
          triggerCharacter: event.key,
          callerContext,
        };
        const items = completionProviders.flatMap((provider) =>
          provider.triggerCharacters.includes(event.key)
            ? Array.from(provider.provideCompletions(context))
            : [],
        );
        setCompletionState({ context, items });
      }
    },
    [
      callerContext,
      completionProviders,
      completionState,
      onChange,
      onKeyDown,
      profile,
      projectionResult.projection,
      value,
    ],
  );

  const handleSelectCompletion = useCallback(
    (item: MarkdownCompletionItem) => {
      applyCompletion(value, item, onChange, setCompletionState);
      requestAnimationFrame(() => internalTextareaRef.current?.focus());
    },
    [onChange, value],
  );

  const setTextareaElement = useCallback(
    (element: HTMLTextAreaElement | null) => {
      internalTextareaRef.current = element;
      textareaRef?.(element);
    },
    [textareaRef],
  );

  return (
    <div className={cn('relative min-w-0', className)} data-inline-markdown-editor="true">
      <div
        className={cn(
          'relative min-h-[5.5rem] rounded border border-gray-200 bg-white focus-within:border-blue-400',
          surfaceClassName,
        )}
        style={surfaceStyle}
      >
        <div
          ref={highlightRef}
          className={cn(
            'pointer-events-none absolute inset-0 overflow-hidden px-2 py-1.5 text-[12px] leading-5 text-gray-900',
            highlightClassName,
          )}
          aria-hidden="true"
          data-inline-markdown-highlight="true"
        >
          {profile === 'semantic-prompt' && projectionResult.semanticSpans.length === 0 ? (
            <MarkdownGenerationPromptParts
              value={value}
              placeholder={placeholder}
              className="min-h-full text-current"
              placeholderClassName="text-gray-400"
            />
          ) : (
            <MarkdownInlineText
              value={value}
              semanticSpans={projectionResult.semanticSpans}
              placeholder={placeholder}
              className="min-h-full whitespace-pre-wrap break-words text-current"
              placeholderClassName="text-gray-400"
              spanVariant="editor"
              renderToken={renderToken}
            />
          )}
        </div>
        <textarea
          ref={setTextareaElement}
          value={value}
          rows={rows}
          placeholder={undefined}
          aria-label={ariaLabel}
          aria-placeholder={placeholder}
          disabled={disabled}
          data-inline-markdown-input="true"
          {...textareaDataAttributes}
          onChange={handleChange}
          onBlur={onBlur}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          onKeyUp={onKeyUp}
          onKeyPress={onKeyPress}
          onMouseDown={(event) => event.stopPropagation()}
          {...getKeyboardBoundaryMetadata({
            scope: 'text-input',
            ownerId: keyboardOwnerId,
            ownedKeys: DEFAULT_OWNED_KEYS,
          })}
          className={cn(
            'relative z-10 block min-h-[5.5rem] w-full resize-y rounded bg-transparent px-2 py-1.5 text-[12px] leading-5 text-transparent caret-gray-900 outline-none placeholder:text-gray-400 selection:bg-blue-200 disabled:cursor-not-allowed disabled:opacity-60',
            textareaClassName,
          )}
        />
        <MarkdownCompletionPopover
          items={completionState?.items ?? []}
          onSelect={handleSelectCompletion}
        />
      </div>
      <MarkdownDiagnostics diagnostics={editorDiagnostics} className={diagnosticsClassName} />
    </div>
  );
}

export function isCompletionTrigger<TContext>(
  key: string,
  providers: readonly MarkdownCompletionProvider<TContext>[],
): boolean {
  return providers.some((provider) => provider.triggerCharacters.includes(key));
}

export function isValidCompletionEdit(value: string, item: MarkdownCompletionItem): boolean {
  return (
    Number.isInteger(item.edit.from) &&
    Number.isInteger(item.edit.to) &&
    item.edit.from >= 0 &&
    item.edit.to >= item.edit.from &&
    item.edit.to <= value.length
  );
}

function applyCompletion<TContext>(
  value: string,
  item: MarkdownCompletionItem,
  onChange: (value: string) => void,
  setCompletionState: React.Dispatch<
    React.SetStateAction<MarkdownCompletionState<TContext> | null>
  >,
): void {
  if (!isValidCompletionEdit(value, item)) {
    setCompletionState(null);
    return;
  }

  const nextValue = `${value.slice(0, item.edit.from)}${item.edit.insert}${value.slice(
    item.edit.to,
  )}`;
  onChange(nextValue);
  setCompletionState(null);
}
