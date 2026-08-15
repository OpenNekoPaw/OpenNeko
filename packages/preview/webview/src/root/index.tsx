import type {
  PreviewMediaDescriptor,
  PreviewProjection,
  PreviewHostRuntimeRoute,
} from '@neko/preview-domain';
import type {
  AuthorizedPreviewSessionProjection,
  AuthorizedPreviewSessionRuntime,
} from '@neko/preview-domain/authorized-session';
import { PREVIEW_HOST_RUNTIME_ROUTES } from '@neko/preview-domain';
import type { SupportedLocale } from '@neko/ui/i18n';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPreviewI18nService } from '../i18n';
import type { PreviewViewerSnapshot, PreviewViewerSnapshotStore } from './viewer-snapshot';
import { useOptionalPreviewViewerSnapshotStore } from './viewer-snapshot-context';
import { renderPreviewViewer } from './viewer-kernel';
import type { PreviewRuntimeBootstrap } from './runtime-bootstrap';
import './style.css';

export {
  LightweightPreview,
  type LightweightPreviewPlayback,
  type LightweightPreviewProps,
} from './lightweight-preview';

export interface PreviewRootProps {
  readonly bootstrap: PreviewRuntimeBootstrap;
  readonly locale: SupportedLocale;
  readonly chrome?: PreviewChrome;
  readonly lifecyclePresentation?: 'active' | 'suspended';
  readonly snapshotStore?: PreviewViewerSnapshotStore;
}

export type PreviewChrome = 'default' | 'content-only';

export interface AuthorizedPreviewRootProps {
  readonly runtime: AuthorizedPreviewSessionRuntime;
  readonly locale: SupportedLocale;
  readonly chrome?: PreviewChrome;
  readonly lifecyclePresentation?: 'active' | 'suspended';
  readonly snapshotStore?: PreviewViewerSnapshotStore;
}

type PreviewRootState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly projection: PreviewProjection }
  | { readonly kind: 'error'; readonly message: string };

export function PreviewPresentation({
  actions,
  authorizedPreviewSessionId,
  chrome = 'default',
  descriptor,
  locale,
  lifecyclePresentation = 'active',
  snapshotStore: explicitSnapshotStore,
}: {
  readonly actions?: ReactNode;
  readonly authorizedPreviewSessionId?: string;
  readonly chrome?: PreviewChrome;
  readonly descriptor: PreviewMediaDescriptor;
  readonly locale: SupportedLocale;
  readonly lifecyclePresentation?: 'active' | 'suspended';
  readonly snapshotStore?: PreviewViewerSnapshotStore;
}): ReactElement {
  const contextSnapshotStore = useOptionalPreviewViewerSnapshotStore();
  const snapshotStore = explicitSnapshotStore ?? contextSnapshotStore;
  const surfaceI18n = useMemo(() => createPreviewI18nService(locale), [locale]);
  if (!snapshotStore) {
    throw new Error('Preview Viewer snapshot owner is missing.');
  }
  const updateSnapshot = useCallback(
    (update: Partial<PreviewViewerSnapshot>) =>
      snapshotStore.update(descriptor.descriptorId, update),
    [descriptor.descriptorId, snapshotStore],
  );
  return (
    <section
      className="neko-preview-root"
      data-authorized-preview-session-id={authorizedPreviewSessionId}
      data-preview-chrome={chrome}
      data-preview-kind={descriptor.contentKind}
      data-preview-presentation-owner="preview-webview"
      data-lifecycle-presentation={lifecyclePresentation}
    >
      {chrome === 'default' ? (
        <header>
          <div className="neko-preview-root__heading">
            <strong>{descriptor.displayName}</strong>
            <span>{descriptor.mediaType}</span>
          </div>
          {actions}
        </header>
      ) : null}
      {lifecyclePresentation === 'active' ? (
        <div className="neko-preview-root__viewer">
          {renderPreviewViewer({
            descriptor,
            controlDensity: 'full',
            locale,
            i18nService: surfaceI18n,
            ...(snapshotStore.read(descriptor.descriptorId)
              ? { snapshot: snapshotStore.read(descriptor.descriptorId) }
              : {}),
            onSnapshotChange: updateSnapshot,
          })}
        </div>
      ) : (
        <div data-preview-suspended="true" hidden />
      )}
    </section>
  );
}

export function PreviewRoot({
  bootstrap,
  chrome = 'default',
  lifecyclePresentation = 'active',
  locale,
  snapshotStore,
}: PreviewRootProps): ReactElement {
  const [state, setState] = useState<PreviewRootState>({ kind: 'loading' });
  const [pendingRoute, setPendingRoute] = useState<PreviewHostRuntimeRoute>();
  const sequence = useRef(0);
  const runtime = bootstrap.runtime;

  useEffect(() => {
    let active = true;
    let runtimeEventObserved = false;
    sequence.current = 0;
    setState({ kind: 'loading' });
    const unsubscribe = runtime.subscribe((event) => {
      if (!active) return;
      runtimeEventObserved = true;
      if (event.sequence !== sequence.current + 1) {
        setState({
          kind: 'error',
          message: `Preview event sequence ${event.sequence} does not follow ${sequence.current}.`,
        });
        return;
      }
      sequence.current = event.sequence;
      setState({ kind: 'ready', projection: event.projection });
    });
    void bootstrap
      .getSnapshot()
      .then((projection) => {
        if (active && !runtimeEventObserved) setState({ kind: 'ready', projection });
      })
      .catch((error: unknown) => {
        if (active) setState({ kind: 'error', message: describeError(error) });
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [bootstrap, runtime]);

  if (state.kind === 'loading') {
    return (
      <PreviewStatus chrome={chrome} message={label(locale, '正在载入预览…', 'Loading preview…')} />
    );
  }
  if (state.kind === 'error') {
    return (
      <PreviewStatus
        chrome={chrome}
        error
        message={state.message}
        title={label(locale, '预览不可用', 'Preview unavailable')}
      />
    );
  }
  const projection = state.projection;
  if (projection.status === 'loading') {
    return (
      <PreviewStatus chrome={chrome} message={label(locale, '正在载入预览…', 'Loading preview…')} />
    );
  }
  if (projection.status !== 'ready') {
    return (
      <PreviewStatus
        chrome={chrome}
        error
        message={projection.diagnostic.message}
        title={
          projection.status === 'unsupported'
            ? label(locale, '暂不支持此文件', 'Unsupported file')
            : label(locale, '预览不可用', 'Preview unavailable')
        }
      />
    );
  }
  const executeViewRoute = async (route: PreviewHostRuntimeRoute): Promise<void> => {
    setPendingRoute(route);
    try {
      const next = await runtime.execute({
        requestId: globalThis.crypto.randomUUID(),
        route,
        identity: projection.identity,
      });
      setState({ kind: 'ready', projection: next });
    } catch (error: unknown) {
      setState({ kind: 'error', message: describeError(error) });
    } finally {
      setPendingRoute(undefined);
    }
  };
  return (
    <PreviewPresentation
      chrome={chrome}
      lifecyclePresentation={lifecyclePresentation}
      descriptor={projection.descriptor}
      locale={locale}
      snapshotStore={snapshotStore}
      actions={
        <div
          className="neko-preview-root__actions"
          aria-label={label(locale, '预览布局', 'Preview layout')}
        >
          {projection.presentation === 'temporary' ? (
            <PreviewActionButton
              disabled={pendingRoute !== undefined}
              icon="pin"
              label={label(locale, '固定预览', 'Pin preview')}
              onClick={() => void executeViewRoute(PREVIEW_HOST_RUNTIME_ROUTES.viewPin)}
            />
          ) : null}
          {projection.presentation !== 'side' ? (
            <PreviewActionButton
              disabled={pendingRoute !== undefined}
              icon="split-horizontal"
              label={label(locale, '在侧边打开', 'Open preview to the side')}
              onClick={() => void executeViewRoute(PREVIEW_HOST_RUNTIME_ROUTES.viewOpen)}
            />
          ) : null}
          <PreviewActionButton
            disabled={pendingRoute !== undefined}
            icon="close"
            label={label(locale, '关闭预览', 'Close preview')}
            onClick={() => void executeViewRoute(PREVIEW_HOST_RUNTIME_ROUTES.viewClose)}
          />
        </div>
      }
    />
  );
}

export function AuthorizedPreviewRoot({
  chrome = 'default',
  lifecyclePresentation = 'active',
  locale,
  runtime,
  snapshotStore,
}: AuthorizedPreviewRootProps): ReactElement {
  const [projection, setProjection] = useState<AuthorizedPreviewSessionProjection>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    const unsubscribe = runtime.subscribe((next) => {
      if (active) setProjection(next);
    });
    void runtime.getSnapshot().then(
      (next) => {
        if (active) setProjection(next);
      },
      (reason: unknown) => {
        if (active) setError(describeError(reason));
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [runtime]);
  if (error) {
    return <PreviewStatus chrome={chrome} error message={error} />;
  }
  if (!projection) {
    return (
      <PreviewStatus chrome={chrome} message={label(locale, '正在载入预览…', 'Loading preview…')} />
    );
  }
  if (projection.status !== 'ready') {
    return <PreviewStatus chrome={chrome} error message={projection.diagnostic.message} />;
  }
  return (
    <PreviewPresentation
      authorizedPreviewSessionId={projection.identity.previewSessionId}
      chrome={chrome}
      descriptor={projection.descriptor}
      locale={locale}
      lifecyclePresentation={lifecyclePresentation}
      snapshotStore={snapshotStore}
    />
  );
}

function PreviewStatus({
  chrome = 'default',
  error = false,
  message,
  title,
}: {
  readonly chrome?: PreviewChrome;
  readonly error?: boolean;
  readonly message: string;
  readonly title?: string;
}): ReactElement {
  return (
    <div
      className={`neko-preview-root__status${error ? ' is-error' : ''}`}
      data-preview-chrome={chrome}
      role={error ? 'alert' : 'status'}
    >
      {title ? <strong>{title}</strong> : null}
      <span>{message}</span>
    </div>
  );
}

function PreviewActionButton({
  disabled,
  icon,
  label: actionLabel,
  onClick,
}: {
  readonly disabled: boolean;
  readonly icon: 'pin' | 'split-horizontal' | 'close';
  readonly label: string;
  readonly onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      aria-label={actionLabel}
      title={actionLabel}
      disabled={disabled}
      onClick={onClick}
    >
      <span className={`codicon codicon-${icon}`} aria-hidden="true" />
    </button>
  );
}

function label(locale: SupportedLocale, chinese: string, english: string): string {
  return locale === 'zh-cn' ? chinese : english;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
