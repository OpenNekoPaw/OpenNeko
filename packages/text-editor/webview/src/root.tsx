import { defaultKeymap, history, historyKeymap, redo, undo } from '@codemirror/commands';
import { autocompletion, type CompletionContext } from '@codemirror/autocomplete';
import { EditorState, Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { projectMarkdownNavigation, type MarkdownNavigationProjection } from '@neko/markdown';
import type { TextDocumentChange, TextDocumentProjection } from '@neko/text-editor-domain';
import '@neko/ui/icons/codicon.css';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from 'react';
import type { TextEditorHostRuntime } from './host-runtime';
import type { MilkdownEditorActions } from './milkdown-rich-editor';
import {
  isTextEditorDiagnosticCode,
  textEditorDiagnosticLabel,
  textEditorLabel,
  type TextEditorLocale,
} from './labels';
import {
  createDefaultTextEditorPresentationSnapshot,
  parseTextEditorPresentationSnapshot,
  type TextEditorPresentationMode,
  type TextEditorPresentationSnapshot,
} from './presentation-snapshot';
import { refreshSourceDecorations, sourceLanguageExtensions } from './source-language';
import './style.css';

export interface TextEditorRootProps {
  readonly runtime: TextEditorHostRuntime;
  readonly locale: TextEditorLocale;
  readonly cspNonce?: string;
  readonly initialSnapshot?: unknown;
  readonly onSnapshotChange?: (snapshot: TextEditorPresentationSnapshot) => void;
  readonly renderContextActions?: (actions: ReactElement) => ReactElement | null;
}

type RootState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly projection: TextDocumentProjection }
  | { readonly status: 'error'; readonly message: string };

const MilkdownRichEditor = lazy(async () => {
  const module = await import('./milkdown-rich-editor');
  return { default: module.MilkdownRichEditor };
});

export function TextEditorRoot({
  runtime,
  locale,
  cspNonce,
  initialSnapshot,
  onSnapshotChange,
  renderContextActions,
}: TextEditorRootProps): ReactElement {
  const parsedSnapshot = useMemo(
    () =>
      initialSnapshot === undefined
        ? { snapshot: createDefaultTextEditorPresentationSnapshot() }
        : parseTextEditorPresentationSnapshot(initialSnapshot),
    [initialSnapshot],
  );
  const [state, setState] = useState<RootState>({ status: 'loading' });
  const [presentationMode, setPresentationMode] = useState(parsedSnapshot.snapshot.mode);
  const [outlineVisible, setOutlineVisible] = useState(parsedSnapshot.snapshot.outlineVisible);
  const [operationError, setOperationError] = useState<string>();
  const [conflictDismissed, setConflictDismissed] = useState(false);
  const previousConflict = useRef(false);
  const requestOrdinal = useRef(0);
  const editorView = useRef<EditorView>();
  const richEditorActions = useRef<MilkdownEditorActions>();
  const pendingSourceOffset = useRef<number>();
  const [activeEditor, setActiveEditor] = useState<'rich' | 'source'>(
    parsedSnapshot.snapshot.mode === 'rich' ? 'rich' : 'source',
  );
  const bindEditorView = useCallback((value: EditorView | undefined) => {
    editorView.current = value;
    const offset = pendingSourceOffset.current;
    if (value && offset !== undefined) {
      pendingSourceOffset.current = undefined;
      revealSourceOffset(value, offset);
    }
  }, []);
  const bindRichEditorActions = useCallback((value: MilkdownEditorActions | undefined) => {
    richEditorActions.current = value;
  }, []);
  const activateRichEditor = useCallback(() => setActiveEditor('rich'), []);
  const activateSourceEditor = useCallback(() => setActiveEditor('source'), []);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      setState({ status: 'ready', projection: await runtime.project() });
    } catch (error) {
      setState({ status: 'error', message: errorMessage(error) });
    }
  }, [runtime]);

  useEffect(() => void load(), [load]);
  useEffect(
    () => runtime.subscribe((projection) => setState({ status: 'ready', projection })),
    [runtime],
  );

  useEffect(() => {
    const conflict = state.status === 'ready' && state.projection.conflict;
    if (conflict && !previousConflict.current) setConflictDismissed(false);
    previousConflict.current = conflict;
  }, [state]);

  const updateProjection = useCallback((projection: TextDocumentProjection) => {
    setOperationError(undefined);
    if (!projection.conflict) setConflictDismissed(false);
    setState({ status: 'ready', projection });
  }, []);
  const nextRequestId = useCallback(() => {
    requestOrdinal.current += 1;
    return `editor-request:${requestOrdinal.current}`;
  }, []);
  const markdownNavigation = useMemo(
    () =>
      state.status === 'ready' && state.projection.mode === 'markdown'
        ? projectMarkdownNavigation(state.projection.source)
        : undefined,
    [state],
  );

  if (state.status === 'loading') {
    return (
      <section className="neko-text-editor-status">{textEditorLabel(locale, 'loading')}</section>
    );
  }
  if (state.status === 'error') {
    return (
      <section className="neko-text-editor-status" role="alert">
        <span>{presentError(locale, state.message)}</span>
        <button type="button" onClick={() => void load()}>
          {textEditorLabel(locale, 'retry')}
        </button>
      </section>
    );
  }

  const projection = state.projection;
  const availableModes = presentationModesFor(projection.mode);
  const effectiveMode = availableModes.includes(presentationMode) ? presentationMode : 'source';
  const updatePresentationMode = (mode: TextEditorPresentationMode) => {
    setPresentationMode(mode);
    if (mode === 'rich' || mode === 'source') setActiveEditor(mode);
    onSnapshotChange?.({ ...parsedSnapshot.snapshot, mode, outlineVisible });
  };
  const toggleOutline = () => {
    setOutlineVisible((current) => {
      const next = !current;
      onSnapshotChange?.({
        ...parsedSnapshot.snapshot,
        mode: effectiveMode,
        outlineVisible: next,
      });
      return next;
    });
  };
  const run = async (operation: () => Promise<TextDocumentProjection>) => {
    try {
      updateProjection(await operation());
    } catch (error) {
      setOperationError(errorMessage(error));
    }
  };
  const displayedError =
    operationError ??
    (projection.conflict && !conflictDismissed ? 'text-document-save-conflict' : undefined);
  const conflict = displayedError === 'text-document-save-conflict';
  const save = () =>
    run(() =>
      runtime.save({
        sessionId: projection.sessionId,
        expectedEditSequence: projection.editSequence,
      }),
    );
  const formatJson = () =>
    run(() =>
      runtime.formatJson({
        sessionId: projection.sessionId,
        requestId: nextRequestId(),
        expectedEditSequence: projection.editSequence,
      }),
    );
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    const modifier = event.metaKey || event.ctrlKey;
    if (modifier && !event.altKey && !event.shiftKey && event.code === 'KeyS') {
      event.preventDefault();
      if (projection.dirty) void save();
      return;
    }
    if (modifier && !event.altKey && event.code === 'KeyZ') {
      event.preventDefault();
      const shouldRedo = event.shiftKey;
      if (activeEditor === 'rich' && richEditorActions.current) {
        if (shouldRedo) richEditorActions.current.redo();
        else richEditorActions.current.undo();
      } else if (editorView.current) {
        if (shouldRedo) redo(editorView.current);
        else undo(editorView.current);
      }
      return;
    }
    if (modifier && !event.altKey && !event.shiftKey && event.code === 'KeyY') {
      event.preventDefault();
      if (activeEditor === 'rich' && richEditorActions.current) richEditorActions.current.redo();
      else if (editorView.current) redo(editorView.current);
      return;
    }
    if (modifier && event.shiftKey && !event.altKey && event.code === 'KeyO') {
      if (projection.mode !== 'markdown' && projection.mode !== 'fountain') return;
      event.preventDefault();
      toggleOutline();
      return;
    }
    if (modifier && event.shiftKey && !event.altKey && event.code.startsWith('Digit')) {
      const index = Number(event.code.slice('Digit'.length)) - 1;
      const mode = availableModes[index];
      if (!mode) return;
      event.preventDefault();
      updatePresentationMode(mode);
      return;
    }
    if (event.altKey && event.shiftKey && !modifier && event.code === 'KeyF') {
      if (projection.mode !== 'json') return;
      event.preventDefault();
      void formatJson();
    }
  };

  const contextActions = renderContextActions?.(
    <TextEditorContextActions
      activeMode={effectiveMode}
      availableModes={availableModes}
      dirty={projection.dirty}
      locale={locale}
      outlineVisible={outlineVisible}
      showFormat={projection.mode === 'json'}
      showOutline={projection.mode === 'markdown' || projection.mode === 'fountain'}
      onFormat={() => void formatJson()}
      onKeyDown={handleKeyDown}
      onModeChange={updatePresentationMode}
      onOutlineToggle={toggleOutline}
      onSave={() => void save()}
    />,
  );

  return (
    <>
      {contextActions}
      <section
        className="neko-text-editor-root"
        data-document-mode={projection.mode}
        onKeyDown={handleKeyDown}
      >
        {displayedError ? (
          <div className="neko-text-editor-operation-error" role="alert">
            <span>{presentError(locale, displayedError)}</span>
            {conflict ? (
              <span className="neko-text-editor-conflict-actions">
                <button
                  type="button"
                  onClick={() =>
                    void run(() =>
                      runtime.reload({ sessionId: projection.sessionId, confirmDirty: true }),
                    )
                  }
                >
                  {textEditorLabel(locale, 'reload')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOperationError(undefined);
                    setConflictDismissed(true);
                  }}
                >
                  {textEditorLabel(locale, 'keepEditing')}
                </button>
              </span>
            ) : null}
          </div>
        ) : null}
        {projection.diagnostics.length > 0 ? (
          <div className="neko-text-editor-diagnostics" role="status">
            {projection.diagnostics.map((diagnostic, index) => (
              <span key={`${diagnostic.code}:${index}`}>
                {textEditorDiagnosticLabel(locale, diagnostic.code)}
              </span>
            ))}
          </div>
        ) : null}
        <div className="neko-text-editor-body" data-presentation-mode={effectiveMode}>
          {projection.mode === 'fountain' && outlineVisible && effectiveMode !== 'preview' ? (
            <ScreenplayOutline projection={projection} locale={locale} editorView={editorView} />
          ) : null}
          {projection.mode === 'markdown' && outlineVisible && markdownNavigation ? (
            <MarkdownOutline
              projection={markdownNavigation}
              locale={locale}
              activeEditor={activeEditor}
              richEditorActions={richEditorActions}
              editorView={editorView}
              onRevealSource={(offset) => {
                const view = editorView.current;
                if (view) {
                  revealSourceOffset(view, offset);
                  return;
                }
                pendingSourceOffset.current = offset;
                updatePresentationMode('source');
              }}
            />
          ) : null}
          {effectiveMode === 'source' || effectiveMode === 'split' ? (
            <CodeMirrorEditor
              projection={projection}
              runtime={runtime}
              locale={locale}
              nextRequestId={nextRequestId}
              onProjection={updateProjection}
              onError={setOperationError}
              onView={bindEditorView}
              onFocus={activateSourceEditor}
              cspNonce={cspNonce}
            />
          ) : null}
          {projection.mode === 'markdown' &&
          (effectiveMode === 'rich' || effectiveMode === 'split') ? (
            <Suspense
              fallback={
                <div className="neko-text-editor-rich-status">
                  {textEditorLabel(locale, 'richLoading')}
                </div>
              }
            >
              <MilkdownRichEditor
                key={effectiveMode}
                projection={projection}
                runtime={runtime}
                locale={locale}
                nextRequestId={nextRequestId}
                onProjection={updateProjection}
                onError={setOperationError}
                onFocus={activateRichEditor}
                onActions={bindRichEditorActions}
                onOpenSource={() => updatePresentationMode('source')}
                readOnly={effectiveMode === 'split'}
              />
            </Suspense>
          ) : null}
          {projection.mode === 'fountain' &&
          (effectiveMode === 'preview' || effectiveMode === 'split') ? (
            <DocumentPreview projection={projection} />
          ) : null}
        </div>
      </section>
    </>
  );
}

function TextEditorContextActions({
  activeMode,
  availableModes,
  dirty,
  locale,
  onFormat,
  onKeyDown,
  onModeChange,
  onOutlineToggle,
  onSave,
  outlineVisible,
  showFormat,
  showOutline,
}: {
  readonly activeMode: TextEditorPresentationMode;
  readonly availableModes: readonly TextEditorPresentationMode[];
  readonly dirty: boolean;
  readonly locale: TextEditorLocale;
  readonly onFormat: () => void;
  readonly onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  readonly onModeChange: (mode: TextEditorPresentationMode) => void;
  readonly onOutlineToggle: () => void;
  readonly onSave: () => void;
  readonly outlineVisible: boolean;
  readonly showFormat: boolean;
  readonly showOutline: boolean;
}): ReactElement {
  return (
    <div className="neko-text-editor-context-actions" onKeyDown={onKeyDown}>
      {availableModes.length > 1 ? (
        <div className="neko-text-editor-segmented" role="group">
          {availableModes.map((mode, index) => (
            <button
              key={mode}
              type="button"
              aria-pressed={activeMode === mode}
              aria-label={textEditorLabel(locale, mode)}
              title={`${textEditorLabel(locale, mode)} (Ctrl/Cmd+Shift+${index + 1})`}
              onClick={() => onModeChange(mode)}
            >
              <span
                className={`codicon codicon-${presentationModeIcon(mode)}`}
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
      ) : null}
      {showOutline ? (
        <button
          type="button"
          aria-label={textEditorLabel(locale, 'outline')}
          aria-pressed={outlineVisible}
          title={`${textEditorLabel(locale, 'outline')} (Ctrl/Cmd+Shift+O)`}
          onClick={onOutlineToggle}
        >
          <span className="codicon codicon-list-tree" aria-hidden="true" />
        </button>
      ) : null}
      {showFormat ? (
        <button
          type="button"
          aria-label={textEditorLabel(locale, 'format')}
          title={`${textEditorLabel(locale, 'format')} (Shift+Alt+F)`}
          onClick={onFormat}
        >
          <span className="codicon codicon-json" aria-hidden="true" />
        </button>
      ) : null}
      <button
        type="button"
        aria-label={textEditorLabel(locale, 'save')}
        disabled={!dirty}
        title={`${textEditorLabel(locale, 'save')} (Ctrl/Cmd+S)`}
        onClick={onSave}
      >
        <span className="codicon codicon-save" aria-hidden="true" />
      </button>
    </div>
  );
}

function CodeMirrorEditor({
  projection,
  runtime,
  locale,
  nextRequestId,
  onProjection,
  onError,
  onView,
  onFocus,
  cspNonce,
}: {
  readonly projection: TextDocumentProjection;
  readonly runtime: TextEditorHostRuntime;
  readonly locale: TextEditorLocale;
  readonly nextRequestId: () => string;
  readonly onProjection: (projection: TextDocumentProjection) => void;
  readonly onError: (message: string) => void;
  readonly onView: (view: EditorView | undefined) => void;
  readonly onFocus: () => void;
  readonly cspNonce?: string;
}): ReactElement {
  const mount = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>();
  const accepted = useRef(projection);
  const queue = useRef(Promise.resolve());
  const composing = useRef(false);
  const reconciling = useRef(false);

  useEffect(() => {
    accepted.current = projection;
    const current = view.current;
    if (current && current.state.doc.toString() !== projection.source && !composing.current) {
      reconciling.current = true;
      current.dispatch({
        changes: { from: 0, to: current.state.doc.length, insert: projection.source },
      });
      reconciling.current = false;
    }
    if (current) refreshSourceDecorations(current, projection);
  }, [projection]);

  useEffect(() => {
    if (!mount.current) return;
    const extensions: Extension[] = [
      ...(cspNonce ? [EditorView.cspNonce.of(cspNonce)] : []),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': textEditorLabel(locale, 'editor') }),
      EditorView.theme({
        '&': {
          height: '100%',
          backgroundColor: 'transparent',
          color: 'var(--neko-editor-foreground, #202124)',
        },
        '.cm-content': { caretColor: 'var(--neko-editor-foreground, #202124)' },
        '.cm-cursor, .cm-dropCursor': {
          borderLeftColor: 'var(--neko-editor-foreground, #202124)',
        },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
          backgroundColor: 'var(--neko-list-activeSelectionBackground, #e8e8e7)',
        },
        '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
      }),
      EditorView.domEventHandlers({
        focus: () => {
          onFocus();
          return false;
        },
        compositionstart: () => {
          composing.current = true;
          return false;
        },
        compositionend: (_event, editorView) => {
          composing.current = false;
          const source = editorView.state.doc.toString();
          if (source !== accepted.current.source)
            enqueue([{ from: 0, to: accepted.current.source.length, insert: source }]);
          return false;
        },
      }),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged || composing.current || reconciling.current) return;
        const changes: TextDocumentChange[] = [];
        update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
          changes.push({ from: fromA, to: toA, insert: inserted.toString() });
        });
        enqueue(changes);
      }),
    ];
    extensions.push(...sourceLanguageExtensions(accepted.current));
    if (projection.mode === 'fountain') {
      extensions.push(
        autocompletion({ override: [fountainCompletions(() => accepted.current)] }),
        Prec.high(
          keymap.of([
            {
              key: 'Enter',
              run: insertFountainNewline,
            },
          ]),
        ),
      );
    }
    const editorView = new EditorView({
      state: EditorState.create({ doc: accepted.current.source, extensions }),
      parent: mount.current,
    });
    view.current = editorView;
    refreshSourceDecorations(editorView, accepted.current);
    onView(editorView);
    return () => {
      editorView.destroy();
      view.current = undefined;
      onView(undefined);
    };

    function enqueue(changes: readonly TextDocumentChange[]): void {
      queue.current = queue.current.then(async () => {
        try {
          const current = accepted.current;
          const next = await runtime.applyEdits({
            identity: current.identity,
            sessionId: current.sessionId,
            requestId: nextRequestId(),
            expectedEditSequence: current.editSequence,
            changes,
          });
          accepted.current = next;
          onProjection(next);
        } catch (error) {
          onError(errorMessage(error));
          const current = view.current;
          if (current && current.state.doc.toString() !== accepted.current.source) {
            reconciling.current = true;
            current.dispatch({
              changes: { from: 0, to: current.state.doc.length, insert: accepted.current.source },
            });
            reconciling.current = false;
          }
        }
      });
    }
  }, [
    cspNonce,
    locale,
    nextRequestId,
    onError,
    onFocus,
    onProjection,
    onView,
    projection.mode,
    projection.identity.documentId,
    runtime,
  ]);

  return <div className="neko-text-editor-codemirror" ref={mount} />;
}

function ScreenplayOutline({
  projection,
  locale,
  editorView,
}: {
  projection: TextDocumentProjection;
  locale: TextEditorLocale;
  editorView: MutableRefObject<EditorView | undefined>;
}): ReactElement {
  const entries = projection.screenplay?.outline ?? [];
  return (
    <aside className="neko-text-editor-outline" aria-label={textEditorLabel(locale, 'outline')}>
      {entries.length === 0 ? (
        <span>{textEditorLabel(locale, 'emptyOutline')}</span>
      ) : (
        entries.map((entry) => (
          <button
            type="button"
            key={entry.outlineId}
            data-outline-depth={entry.depth}
            onClick={() => {
              const view = editorView.current;
              if (!view) return;
              const offset = Math.min(entry.range.start.offset, view.state.doc.length);
              view.dispatch({
                selection: { anchor: offset },
                effects: EditorView.scrollIntoView(offset, { y: 'center' }),
              });
              view.focus();
            }}
          >
            {entry.label}
          </button>
        ))
      )}
    </aside>
  );
}

function MarkdownOutline({
  projection,
  locale,
  activeEditor,
  richEditorActions,
  editorView,
  onRevealSource,
}: {
  readonly projection: MarkdownNavigationProjection;
  readonly locale: TextEditorLocale;
  readonly activeEditor: 'rich' | 'source';
  readonly richEditorActions: MutableRefObject<MilkdownEditorActions | undefined>;
  readonly editorView: MutableRefObject<EditorView | undefined>;
  readonly onRevealSource: (offset: number) => void;
}): ReactElement {
  return (
    <aside className="neko-text-editor-outline" aria-label={textEditorLabel(locale, 'outline')}>
      <div className="neko-text-editor-outline-section">
        <strong>{textEditorLabel(locale, 'outline')}</strong>
        {projection.outline.length === 0 ? (
          <span>{textEditorLabel(locale, 'emptyOutline')}</span>
        ) : (
          projection.outline.map((entry, index) => (
            <button
              type="button"
              key={entry.id}
              data-outline-depth={entry.depth - 1}
              onClick={() => {
                if (
                  activeEditor === 'rich' &&
                  richEditorActions.current?.revealHeading(index) === true
                ) {
                  return;
                }
                const view = editorView.current;
                if (view) {
                  revealSourceOffset(view, entry.range.startOffset);
                  return;
                }
                onRevealSource(entry.range.startOffset);
              }}
            >
              {entry.label}
            </button>
          ))
        )}
      </div>
      <div className="neko-text-editor-outline-section">
        <strong>{textEditorLabel(locale, 'references')}</strong>
        {projection.references.length === 0 ? (
          <span>{textEditorLabel(locale, 'emptyReferences')}</span>
        ) : (
          projection.references.map((entry) => (
            <button
              type="button"
              key={entry.id}
              title={entry.destination}
              onClick={() => onRevealSource(entry.range.startOffset)}
            >
              <span
                className={`codicon codicon-${entry.kind === 'image' ? 'file-media' : 'link'}`}
              />
              <span>{entry.label || entry.destination}</span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}

function revealSourceOffset(view: EditorView, sourceOffset: number): void {
  const offset = Math.min(sourceOffset, view.state.doc.length);
  view.dispatch({
    selection: { anchor: offset },
    effects: EditorView.scrollIntoView(offset, { y: 'center' }),
  });
  view.focus();
}

function DocumentPreview({ projection }: { projection: TextDocumentProjection }): ReactElement {
  return (
    <article className="neko-text-editor-preview neko-screenplay-preview">
      {projection.screenplay?.elements.map((element) => (
        <div key={element.elementId} data-screenplay-element={element.kind}>
          {element.text}
        </div>
      ))}
    </article>
  );
}

function presentationModesFor(
  mode: TextDocumentProjection['mode'],
): readonly TextEditorPresentationMode[] {
  if (mode === 'markdown') return ['source', 'rich', 'split'];
  if (mode === 'fountain') return ['source', 'preview', 'split'];
  return ['source'];
}

function presentationModeIcon(mode: TextEditorPresentationMode): string {
  switch (mode) {
    case 'source':
      return 'code';
    case 'rich':
      return 'edit';
    case 'preview':
      return 'preview';
    case 'split':
      return 'split-horizontal';
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'text-editor-operation-failed';
}

function presentError(locale: TextEditorLocale, message: string): string {
  return isTextEditorDiagnosticCode(message) ? textEditorDiagnosticLabel(locale, message) : message;
}

function fountainCompletions(readProjection: () => TextDocumentProjection) {
  return (context: CompletionContext) => {
    const line = context.state.doc.lineAt(context.pos);
    const prefix = line.text.slice(0, context.pos - line.from);
    if (prefix.startsWith('@')) {
      return {
        from: line.from,
        options: (readProjection().screenplay?.characters ?? []).map((character) => ({
          label: `@${character.name}`,
          type: 'variable',
        })),
      };
    }
    if (prefix === '' || prefix.startsWith('.')) {
      return {
        from: line.from,
        options: [
          { label: '.内景 ', type: 'keyword' },
          { label: '.外景 ', type: 'keyword' },
          { label: 'INT. ', type: 'keyword' },
          { label: 'EXT. ', type: 'keyword' },
        ],
      };
    }
    return null;
  };
}

function insertFountainNewline(view: EditorView): boolean {
  if (view.composing) return false;
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  if (!isFountainBlockBoundary(line.text.trim())) return false;
  view.dispatch({
    changes: { from: head, to: head, insert: '\n\n' },
    selection: { anchor: head + 2 },
  });
  return true;
}

function isFountainBlockBoundary(line: string): boolean {
  return (
    /^(?:\.(?:\S.*)|(?:INT|EXT|EST|I\/E|INT\/EXT)\.)/iu.test(line) ||
    /^(?:CUT TO:|FADE (?:IN:|OUT\.?))$/iu.test(line)
  );
}
