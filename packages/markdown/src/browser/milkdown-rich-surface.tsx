import {
  defaultValueCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  Editor,
  nodeViewCtx,
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
import type { NodeViewConstructor } from '@milkdown/prose/view';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { assessOpenNekoMarkdownRichRoundTrip } from '../rich-round-trip';

export type MilkdownRichSurfaceState = 'loading' | 'ready' | 'unavailable' | 'error';

export interface MilkdownRichSurfaceActions {
  readonly undo: () => boolean;
  readonly redo: () => boolean;
  readonly focus: () => void;
  readonly revealHeading: (headingIndex: number) => boolean;
}

export interface MilkdownRichSurfaceExtensions {
  readonly nodeViews?: readonly [string, NodeViewConstructor][];
  readonly prosePlugins?: readonly Plugin[];
  readonly refreshPlugins?: readonly Plugin[];
}

export interface MilkdownRichSurfaceProps {
  readonly value: string;
  readonly ariaLabel: string;
  readonly readOnly: boolean;
  readonly reconcileToken?: number;
  readonly className?: string;
  readonly mountClassName?: string;
  readonly onChange: (source: string) => void;
  readonly onFocus?: () => void;
  readonly onActions?: (actions: MilkdownRichSurfaceActions | undefined) => void;
  readonly onStateChange?: (state: MilkdownRichSurfaceState, failure?: string) => void;
  readonly createExtensions?: (readSource: () => string) => MilkdownRichSurfaceExtensions;
}

type ReadyState = Exclude<MilkdownRichSurfaceState, 'loading' | 'error'>;

interface MilkdownRichSurfaceController extends MilkdownRichSurfaceActions {
  readonly reconcile: (source: string) => ReadyState | false;
  readonly destroy: () => Promise<void>;
}

export function MilkdownRichSurface({
  value,
  ariaLabel,
  readOnly,
  reconcileToken,
  className,
  mountClassName,
  onChange,
  onFocus,
  onActions,
  onStateChange,
  createExtensions,
}: MilkdownRichSurfaceProps): ReactElement {
  const mount = useRef<HTMLDivElement>(null);
  const controller = useRef<MilkdownRichSurfaceController>();
  const latestValue = useRef(value);
  const callbacks = useRef({ onChange, onFocus, onActions, onStateChange });
  const attempt = useRef(0);
  const [state, setState] = useState<MilkdownRichSurfaceState>('loading');

  latestValue.current = value;
  callbacks.current = { onChange, onFocus, onActions, onStateChange };

  useEffect(() => {
    const root = mount.current;
    if (!root) return;
    const currentAttempt = ++attempt.current;
    const initialSource = latestValue.current;
    let disposed = false;
    publishState('loading');
    void createMilkdownRichSurfaceController({
      root,
      source: initialSource,
      ariaLabel,
      readOnly,
      onSourceChange: (source) => callbacks.current.onChange(source),
      onFocus: () => callbacks.current.onFocus?.(),
      createExtensions,
    })
      .then(async (result) => {
        if (disposed || currentAttempt !== attempt.current) {
          await result.controller.destroy();
          return;
        }
        controller.current = result.controller;
        const currentSource = latestValue.current;
        const nextState =
          currentSource === initialSource
            ? result.status
            : result.controller.reconcile(currentSource);
        if (!nextState) {
          await result.controller.destroy();
          controller.current = undefined;
          publishState('error', 'markdown-rich-reconciliation-failed');
          return;
        }
        callbacks.current.onActions?.(
          nextState === 'ready' && !readOnly ? result.controller : undefined,
        );
        publishState(nextState);
      })
      .catch((error: unknown) => {
        if (disposed || currentAttempt !== attempt.current) return;
        publishState('error', errorMessage(error));
      });

    return () => {
      disposed = true;
      attempt.current += 1;
      callbacks.current.onActions?.(undefined);
      const current = controller.current;
      controller.current = undefined;
      if (current) void current.destroy();
    };

    function publishState(nextState: MilkdownRichSurfaceState, failure?: string): void {
      setState(nextState);
      callbacks.current.onStateChange?.(nextState, failure);
    }
  }, [ariaLabel, createExtensions, readOnly]);

  useEffect(() => {
    const current = controller.current;
    if (!current) return;
    const nextState = current.reconcile(value);
    if (!nextState) {
      callbacks.current.onActions?.(undefined);
      setState('error');
      callbacks.current.onStateChange?.('error', 'markdown-rich-reconciliation-failed');
      return;
    }
    callbacks.current.onActions?.(nextState === 'ready' && !readOnly ? current : undefined);
    setState(nextState);
    callbacks.current.onStateChange?.(nextState);
  }, [readOnly, reconcileToken, value]);

  return (
    <div className={className} data-rich-state={state}>
      <div className={mountClassName} ref={mount} />
    </div>
  );
}

async function createMilkdownRichSurfaceController({
  root,
  source,
  ariaLabel,
  readOnly,
  onSourceChange,
  onFocus,
  createExtensions,
}: {
  readonly root: HTMLElement;
  readonly source: string;
  readonly ariaLabel: string;
  readonly readOnly: boolean;
  readonly onSourceChange: (source: string) => void;
  readonly onFocus: () => void;
  readonly createExtensions?: (readSource: () => string) => MilkdownRichSurfaceExtensions;
}): Promise<{
  readonly status: ReadyState;
  readonly controller: MilkdownRichSurfaceController;
}> {
  let composing = false;
  let reconciling = false;
  let destroyed = false;
  let initialized = false;
  let lastSerialized = '';
  let mutationAvailable = false;
  let currentSource = source;
  const extensions = createExtensions?.(() => currentSource);
  const nodeViews = extensions?.nodeViews ?? [];
  const refreshPlugins = extensions?.refreshPlugins ?? [];
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, source);
      ctx.set(rootAttrsCtx, { 'aria-label': ariaLabel });
      ctx.set(editorViewOptionsCtx, { editable: () => false });
      if (nodeViews.length) {
        ctx.update(nodeViewCtx, (views) => [...views, ...nodeViews]);
      }
      ctx.update(prosePluginsCtx, (plugins) => [
        ...plugins,
        ...(extensions?.prosePlugins ?? []),
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

  const controller: MilkdownRichSurfaceController = {
    undo: () =>
      editor.action((ctx) => undo(ctx.get(editorViewCtx).state, ctx.get(editorViewCtx).dispatch)),
    redo: () =>
      editor.action((ctx) => redo(ctx.get(editorViewCtx).state, ctx.get(editorViewCtx).dispatch)),
    focus: () => editor.action((ctx) => ctx.get(editorViewCtx).focus()),
    revealHeading: (headingIndex) =>
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const headingPositions: number[] = [];
        view.state.doc.descendants((node, position) => {
          if (node.type.name === 'heading') headingPositions.push(position);
          return true;
        });
        const headingPosition = headingPositions[headingIndex];
        if (headingPosition === undefined) return false;
        const selection = TextSelection.near(view.state.doc.resolve(headingPosition + 1));
        view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
        view.focus();
        return true;
      }),
    reconcile(nextSource) {
      if (destroyed) return false;
      return editor.action((ctx) => {
        currentSource = nextSource;
        const nextDocument = ctx.get(parserCtx)(nextSource);
        if (!nextDocument) return false;
        const serializer = ctx.get(serializerCtx);
        const serialized = serializer(nextDocument);
        mutationAvailable =
          !readOnly &&
          assessOpenNekoMarkdownRichRoundTrip(nextSource, serialized).status === 'ready';
        const view = ctx.get(editorViewCtx);
        if (view.state.doc.eq(nextDocument)) {
          let transaction = view.state.tr.setMeta('addToHistory', false);
          for (const plugin of refreshPlugins) transaction = transaction.setMeta(plugin, true);
          view.dispatch(transaction);
          lastSerialized = serialized;
          applyEditableState();
          return presentationState();
        }
        const localSource = serializer(view.state.doc);
        if (!readOnly && lastSerialized === nextSource && localSource === nextSource) {
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
    },
  };
  return { status: presentationState(), controller };

  function presentationState(): ReadyState {
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
  return error instanceof Error ? error.message : 'markdown-rich-initialization-failed';
}
