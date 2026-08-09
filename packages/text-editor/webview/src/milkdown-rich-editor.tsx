import {
  defaultValueCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  Editor,
  parserCtx,
  prosePluginsCtx,
  rootAttrsCtx,
  rootCtx,
  serializerCtx,
} from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm, tableCellSchema, tableHeaderSchema } from '@milkdown/preset-gfm';
import { history, redo, undo } from '@milkdown/prose/history';
import { keymap } from '@milkdown/prose/keymap';
import { Plugin, TextSelection } from '@milkdown/prose/state';
import { assessOpenNekoMarkdownRichRoundTrip } from '@neko/markdown';
import type { TextDocumentProjection } from '@neko/text-editor-domain';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import type { TextEditorHostRuntime } from './host-runtime';
import { textEditorLabel, type TextEditorLocale } from './labels';

export interface MilkdownEditorActions {
  readonly undo: () => boolean;
  readonly redo: () => boolean;
  readonly focus: () => void;
  readonly revealHeading: (headingIndex: number) => boolean;
}

export interface MilkdownRichEditorProps {
  readonly projection: TextDocumentProjection;
  readonly runtime: TextEditorHostRuntime;
  readonly locale: TextEditorLocale;
  readonly nextRequestId: () => string;
  readonly onProjection: (projection: TextDocumentProjection) => void;
  readonly onError: (message: string) => void;
  readonly onFocus: () => void;
  readonly onActions: (actions: MilkdownEditorActions | undefined) => void;
  readonly onOpenSource: () => void;
  readonly readOnly: boolean;
}

type RichState = 'loading' | 'ready' | 'unavailable' | 'error';

interface MilkdownController extends MilkdownEditorActions {
  readonly reconcile: (source: string) => Exclude<RichState, 'loading' | 'error'> | false;
  readonly destroy: () => Promise<void>;
}

export function MilkdownRichEditor({
  projection,
  runtime,
  locale,
  nextRequestId,
  onProjection,
  onError,
  onFocus,
  onActions,
  onOpenSource,
  readOnly,
}: MilkdownRichEditorProps): ReactElement {
  const mount = useRef<HTMLDivElement>(null);
  const controller = useRef<MilkdownController>();
  const accepted = useRef(projection);
  const pendingSource = useRef<string>();
  const queue = useRef(Promise.resolve());
  const queueToken = useRef(Symbol('text-editor-rich-queue'));
  const attempt = useRef(0);
  const attemptedSource = useRef<string>();
  const [state, setState] = useState<RichState>('loading');
  const [failure, setFailure] = useState<string>();

  accepted.current = projection;

  const enqueue = useCallback(
    (source: string) => {
      pendingSource.current = source;
      const token = queueToken.current;
      queue.current = queue.current.then(async () => {
        if (!Object.is(token, queueToken.current)) return;
        const current = accepted.current;
        try {
          const next = await runtime.applyEdits({
            identity: current.identity,
            sessionId: current.sessionId,
            requestId: nextRequestId(),
            expectedEditSequence: current.editSequence,
            changes: [{ from: 0, to: current.source.length, insert: source }],
          });
          accepted.current = next;
          if (pendingSource.current === source) pendingSource.current = undefined;
          onProjection(next);
        } catch (error) {
          queueToken.current = Symbol('text-editor-rich-queue');
          pendingSource.current = undefined;
          onError(errorMessage(error));
          controller.current?.reconcile(accepted.current.source);
        }
      });
    },
    [nextRequestId, onError, onProjection, runtime],
  );

  const start = useCallback(
    async (source: string) => {
      const root = mount.current;
      if (!root) return;
      const currentAttempt = ++attempt.current;
      attemptedSource.current = source;
      setState('loading');
      setFailure(undefined);
      try {
        const result = await createMilkdownController({
          root,
          source,
          ariaLabel: textEditorLabel(locale, 'richEditor'),
          readOnly,
          onSourceChange: enqueue,
          onFocus,
        });
        if (currentAttempt !== attempt.current) {
          await result.controller.destroy();
          return;
        }
        controller.current = result.controller;
        onActions(result.status === 'ready' && !readOnly ? result.controller : undefined);
        setState(result.status);
      } catch (error) {
        if (currentAttempt !== attempt.current) return;
        const message = errorMessage(error);
        onError(message);
        setFailure(message);
        setState('error');
      }
    },
    [enqueue, locale, onActions, onError, onFocus, readOnly],
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const current = controller.current;
      if (current) {
        if (pendingSource.current !== undefined && projection.source !== pendingSource.current) {
          return;
        }
        const nextState = current.reconcile(projection.source);
        if (!nextState) {
          void current.destroy();
          controller.current = undefined;
          onActions(undefined);
          setFailure('text-editor-rich-reconciliation-failed');
          setState('error');
          return;
        }
        onActions(nextState === 'ready' && !readOnly ? current : undefined);
        setState(nextState);
        return;
      }
      if (attemptedSource.current !== projection.source) void start(projection.source);
    });
    return () => {
      cancelled = true;
    };
  }, [onActions, projection.source, readOnly, start]);

  useEffect(
    () => () => {
      attempt.current += 1;
      attemptedSource.current = undefined;
      pendingSource.current = undefined;
      onActions(undefined);
      const current = controller.current;
      controller.current = undefined;
      if (current) void current.destroy();
    },
    [onActions],
  );

  return (
    <div className="neko-text-editor-rich" data-rich-state={state}>
      <div className="neko-text-editor-milkdown-mount" ref={mount} />
      {state === 'loading' ? (
        <div className="neko-text-editor-rich-status">{textEditorLabel(locale, 'richLoading')}</div>
      ) : null}
      {state === 'unavailable' || state === 'error' ? (
        <div className="neko-text-editor-rich-status" role="alert">
          <span>
            {state === 'unavailable'
              ? textEditorLabel(locale, 'richUnavailable')
              : `${textEditorLabel(locale, 'richInitializationFailed')} ${failure ?? ''}`}
          </span>
          <button type="button" onClick={onOpenSource}>
            {textEditorLabel(locale, 'openSource')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

async function createMilkdownController({
  root,
  source,
  ariaLabel,
  readOnly,
  onSourceChange,
  onFocus,
}: {
  readonly root: HTMLElement;
  readonly source: string;
  readonly ariaLabel: string;
  readonly readOnly: boolean;
  readonly onSourceChange: (source: string) => void;
  readonly onFocus: () => void;
}): Promise<{
  readonly status: Exclude<RichState, 'loading' | 'error'>;
  readonly controller: MilkdownController;
}> {
  let composing = false;
  let reconciling = false;
  let destroyed = false;
  let initialized = false;
  let lastSerialized = '';
  let mutationAvailable = false;
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, source);
      ctx.set(rootAttrsCtx, { 'aria-label': ariaLabel });
      ctx.set(editorViewOptionsCtx, { editable: () => false });
      ctx.update(prosePluginsCtx, (plugins) => [
        ...plugins,
        history(),
        keymap({ 'Mod-z': undo, 'Shift-Mod-z': redo, 'Mod-y': redo }),
        new Plugin({
          view: () => ({
            update(view, previousState) {
              if (
                !initialized ||
                composing ||
                reconciling ||
                previousState.doc.eq(view.state.doc)
              ) {
                return;
              }
              if (mutationAvailable) emit(ctx.get(serializerCtx)(view.state.doc));
            },
          }),
        }),
      ]);
    })
    .use(commonmark)
    .use(cspSafeGfm)
    .create();

  const serialize = () =>
    editor.action((ctx) => ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc));
  const initialSerialized = serialize();
  mutationAvailable =
    !readOnly && assessOpenNekoMarkdownRichRoundTrip(source, initialSerialized).status === 'ready';
  applyEditableState();
  lastSerialized = initialSerialized;
  initialized = true;

  const compositionStart = () => {
    composing = true;
  };
  const compositionEnd = () => {
    composing = false;
    queueMicrotask(() => {
      if (!destroyed) emit(serialize());
    });
  };
  root.addEventListener('compositionstart', compositionStart);
  root.addEventListener('compositionend', compositionEnd);
  root.addEventListener('focusin', onFocus);

  const controller: MilkdownController = {
    undo: () =>
      editor.action((ctx) => undo(ctx.get(editorViewCtx).state, ctx.get(editorViewCtx).dispatch)),
    redo: () =>
      editor.action((ctx) => redo(ctx.get(editorViewCtx).state, ctx.get(editorViewCtx).dispatch)),
    focus: () => editor.action((ctx) => ctx.get(editorViewCtx).focus()),
    revealHeading: (headingIndex) =>
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        let currentIndex = 0;
        let headingPosition: number | undefined;
        view.state.doc.descendants((node, position) => {
          if (node.type.name !== 'heading') return true;
          if (currentIndex === headingIndex) {
            headingPosition = position;
            return false;
          }
          currentIndex += 1;
          return true;
        });
        if (headingPosition === undefined) return false;
        const selection = TextSelection.near(view.state.doc.resolve(headingPosition + 1));
        view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
        view.focus();
        return true;
      }),
    reconcile(nextSource) {
      if (destroyed) return false;
      return editor.action((ctx) => {
        const parser = ctx.get(parserCtx);
        const nextDocument = parser(nextSource);
        if (!nextDocument) return false;
        const serializer = ctx.get(serializerCtx);
        const serialized = serializer(nextDocument);
        mutationAvailable =
          !readOnly &&
          assessOpenNekoMarkdownRichRoundTrip(nextSource, serialized).status === 'ready';
        const view = ctx.get(editorViewCtx);
        if (view.state.doc.eq(nextDocument)) {
          lastSerialized = serialized;
          applyEditableState();
          return presentationState();
        }
        const currentSerialized = serializer(view.state.doc);
        if (!readOnly && lastSerialized === nextSource && currentSerialized === nextSource) {
          // Trailing whitespace cannot reconstruct an empty block; keep it until later input fills it.
          lastSerialized = serialized;
          applyEditableState();
          return presentationState();
        }
        reconciling = true;
        view.dispatch(
          view.state.tr
            .replaceWith(0, view.state.doc.content.size, nextDocument.content)
            .setMeta('addToHistory', false),
        );
        reconciling = false;
        lastSerialized = serialized;
        applyEditableState();
        return presentationState();
      });
    },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      root.removeEventListener('compositionstart', compositionStart);
      root.removeEventListener('compositionend', compositionEnd);
      root.removeEventListener('focusin', onFocus);
      await editor.destroy();
      root.replaceChildren();
    },
  };
  return { status: presentationState(), controller };

  function presentationState(): Exclude<RichState, 'loading' | 'error'> {
    return readOnly || mutationAvailable ? 'ready' : 'unavailable';
  }

  function applyEditableState(): void {
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      view.setProps({ editable: () => mutationAvailable });
      view.dom.setAttribute('aria-readonly', mutationAvailable ? 'false' : 'true');
    });
  }

  function emit(serialized: string): void {
    if (serialized === lastSerialized) return;
    lastSerialized = serialized;
    onSourceChange(serialized);
  }
}

const safeTableCellSchema = withoutInlineTableAlignment(tableCellSchema, 'td');
const safeTableHeaderSchema = withoutInlineTableAlignment(tableHeaderSchema, 'th');
const cspSafeGfm = gfm.map((plugin) => {
  if (plugin === tableCellSchema.ctx) return safeTableCellSchema.ctx;
  if (plugin === tableCellSchema.node) return safeTableCellSchema.node;
  if (plugin === tableHeaderSchema.ctx) return safeTableHeaderSchema.ctx;
  if (plugin === tableHeaderSchema.node) return safeTableHeaderSchema.node;
  return plugin;
});

function withoutInlineTableAlignment(
  schema: typeof tableCellSchema,
  tag: 'td' | 'th',
): typeof tableCellSchema;
function withoutInlineTableAlignment(
  schema: typeof tableHeaderSchema,
  tag: 'td' | 'th',
): typeof tableHeaderSchema;
function withoutInlineTableAlignment(
  schema: typeof tableCellSchema | typeof tableHeaderSchema,
  tag: 'td' | 'th',
) {
  return schema.extendSchema((previous) => (ctx) => ({
    ...previous(ctx),
    parseDOM: [
      {
        tag,
        getAttrs: (dom: HTMLElement) => ({
          alignment: dom.dataset['alignment'] ?? 'left',
        }),
      },
    ],
    toDOM: (node) => [tag, { 'data-alignment': node.attrs['alignment'] ?? 'left' }, 0],
  }));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'text-editor-rich-initialization-failed';
}
