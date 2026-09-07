import {
  MilkdownRichSurface,
  type MilkdownRichSurfaceActions,
  type MilkdownRichSurfaceExtensions,
  type MilkdownRichSurfaceSelectionActions,
  type MilkdownRichSurfaceState,
} from '@neko/markdown/rich-surface';
import type { TextDocumentProjection } from '@neko/text-editor-domain';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import type { TextEditorHostRuntime } from './host-runtime';
import { textEditorLabel, type TextEditorLocale } from './labels';
import {
  createMarkdownMediaMilkdownPlugins,
  MarkdownMediaPresentation,
} from './markdown-media-presentation';

export type MilkdownEditorActions = MilkdownRichSurfaceActions;
export type MilkdownEditorSelectionActions = MilkdownRichSurfaceSelectionActions;

export interface MilkdownRichEditorProps {
  readonly projection: TextDocumentProjection;
  readonly runtime: TextEditorHostRuntime;
  readonly locale: TextEditorLocale;
  readonly nextRequestId: () => string;
  readonly onProjection: (projection: TextDocumentProjection) => void;
  readonly onError: (message: string) => void;
  readonly onFocus: () => void;
  readonly onActions: (actions: MilkdownEditorActions | undefined) => void;
  readonly onSelectionActions: (actions: MilkdownEditorSelectionActions | undefined) => void;
  readonly onOpenSource: () => void;
  readonly onRevealSource: (offset: number) => void;
  readonly readOnly: boolean;
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
  onSelectionActions,
  onOpenSource,
  onRevealSource,
  readOnly,
}: MilkdownRichEditorProps): ReactElement {
  const presentationRoot = useRef<HTMLDivElement>(null);
  const accepted = useRef(projection);
  const pendingSource = useRef<string>();
  const queue = useRef(Promise.resolve());
  const queueToken = useRef(Symbol('text-editor-rich-queue'));
  const [state, setState] = useState<MilkdownRichSurfaceState>('loading');
  const [failure, setFailure] = useState<string>();
  const [reconcileToken, setReconcileToken] = useState(0);
  const [recoverySource, setRecoverySource] = useState<string>();
  const surfaceId = useRef<string>();
  if (!surfaceId.current) {
    markdownMediaSurfaceOrdinal += 1;
    surfaceId.current = `markdown-media-surface:${projection.sessionId}:${markdownMediaSurfaceOrdinal}`;
  }

  accepted.current = projection;

  const enqueue = useCallback(
    (source: string) => {
      pendingSource.current = source;
      setRecoverySource(undefined);
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
          setRecoverySource(accepted.current.source);
          setReconcileToken((current) => current + 1);
        }
      });
    },
    [nextRequestId, onError, onProjection, runtime],
  );

  const createExtensions = useCallback(
    (readSource: () => string): MilkdownRichSurfaceExtensions => {
      const mediaPlugins = createMarkdownMediaMilkdownPlugins(readSource);
      return {
        nodeViews: [mediaPlugins.imageNodeView],
        prosePlugins: [mediaPlugins.resourceDecorationPlugin],
        refreshPlugins: [mediaPlugins.resourceDecorationPlugin],
      };
    },
    [],
  );

  const handleStateChange = useCallback(
    (nextState: MilkdownRichSurfaceState, nextFailure?: string) => {
      setState(nextState);
      setFailure(nextFailure);
      if (nextState === 'error' && nextFailure) onError(nextFailure);
    },
    [onError],
  );

  useEffect(
    () => () => {
      queueToken.current = Symbol('text-editor-rich-queue');
      pendingSource.current = undefined;
      onActions(undefined);
      onSelectionActions(undefined);
    },
    [onActions, onSelectionActions],
  );

  return (
    <div className="neko-text-editor-rich" data-rich-state={state} ref={presentationRoot}>
      <MilkdownRichSurface
        value={pendingSource.current ?? recoverySource ?? projection.source}
        ariaLabel={textEditorLabel(locale, 'richEditor')}
        readOnly={readOnly}
        reconcileToken={reconcileToken}
        mountClassName="neko-text-editor-milkdown-mount"
        onChange={enqueue}
        onFocus={onFocus}
        onActions={onActions}
        onSelectionActions={onSelectionActions}
        onStateChange={handleStateChange}
        createExtensions={createExtensions}
      />
      {state === 'ready' || state === 'unavailable' ? (
        <MarkdownMediaPresentation
          root={presentationRoot.current}
          projection={projection}
          runtime={runtime}
          locale={locale}
          surfaceId={surfaceId.current}
          nextRequestId={nextRequestId}
          onError={onError}
          onRevealSource={onRevealSource}
        />
      ) : null}
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

let markdownMediaSurfaceOrdinal = 0;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'text-editor-rich-edit-failed';
}
