import type {
  ModelPreviewFormat,
  ModelPreviewSourceDescriptor,
  PreviewContentKind,
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
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { I18nProvider } from '../i18n/I18nContext';
import { i18nService, setLocale } from '../i18n';
import { createSourceModelViewerHost } from '../model/sourceModelViewerHost';
import { PersistedStateProvider } from '../shared/usePersistedState';
import type { PreviewViewerSnapshot, PreviewViewerSnapshotStore } from './viewer-snapshot';
import { useOptionalPreviewViewerSnapshotStore } from './viewer-snapshot-context';
import type { PreviewRuntimeBootstrap } from './runtime-bootstrap';
import './style.css';

const AudioPlayer = lazy(async () => {
  const module = await import('../audio/AudioPlayer');
  return { default: module.AudioPlayer };
});
const VideoPlayer = lazy(async () => {
  const module = await import('../video/VideoPlayer');
  return { default: module.VideoPlayer };
});
const PdfViewer = lazy(async () => {
  const module = await import('../pdf/PdfViewer');
  return { default: module.PdfViewer };
});
const DocxViewer = lazy(async () => {
  const module = await import('../docx/DocxViewer');
  return { default: module.DocxViewer };
});
const EpubViewer = lazy(async () => {
  const module = await import('../epub/EpubViewer');
  return { default: module.EpubViewer };
});
const CbzViewer = lazy(async () => {
  const module = await import('../cbz/CbzViewer');
  return { default: module.CbzViewer };
});
const ModelViewer = lazy(async () => {
  const module = await import('../model/ModelViewer');
  return { default: module.ModelViewer };
});

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

export interface PreviewViewerProps {
  readonly descriptor: PreviewMediaDescriptor;
  readonly sourceUrl: string;
  readonly locale: SupportedLocale;
  readonly snapshot?: PreviewViewerSnapshot;
  readonly onSnapshotChange: (update: Partial<PreviewViewerSnapshot>) => void;
}

export interface PreviewViewerRegistration {
  readonly kind: PreviewContentKind;
  readonly render: (props: PreviewViewerProps) => ReactElement;
}

const VIEWERS: readonly PreviewViewerRegistration[] = [
  { kind: 'image', render: (props) => <ImagePreview {...props} /> },
  { kind: 'video', render: (props) => <VideoPreview {...props} /> },
  { kind: 'audio', render: (props) => <AudioPreview {...props} /> },
  { kind: 'text', render: (props) => <TextPreview {...props} /> },
  { kind: 'document', render: (props) => <DocumentPreview {...props} /> },
  { kind: 'model', render: (props) => <ModelPreview {...props} /> },
];

export function getPreviewViewerRegistry(): readonly PreviewViewerRegistration[] {
  return VIEWERS;
}

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
  if (!snapshotStore) {
    throw new Error('Preview Viewer snapshot owner is missing.');
  }
  const updateSnapshot = useCallback(
    (update: Partial<PreviewViewerSnapshot>) =>
      snapshotStore.update(descriptor.descriptorId, update),
    [descriptor.descriptorId, snapshotStore],
  );
  const viewer = VIEWERS.find((candidate) => candidate.kind === descriptor.contentKind);
  if (!viewer) {
    return (
      <PreviewStatus
        chrome={chrome}
        message={label(locale, '没有可用的预览器', 'No viewer is available')}
      />
    );
  }
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
          {viewer.render({
            descriptor,
            sourceUrl: descriptor.url,
            locale,
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
    setLocale(locale);
  }, [locale]);

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
    setLocale(locale);
  }, [locale]);
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

function ImagePreview({ descriptor, sourceUrl }: PreviewViewerProps): ReactElement {
  return <img className="neko-preview-root__image" src={sourceUrl} alt={descriptor.displayName} />;
}

function VideoPreview({
  descriptor,
  locale,
  onSnapshotChange,
  snapshot,
  sourceUrl,
}: PreviewViewerProps): ReactElement {
  return (
    <ViewerModuleBoundary locale={locale}>
      <I18nProvider service={i18nService}>
        <VideoPlayer
          sourceUrl={sourceUrl}
          displayName={descriptor.displayName}
          initialSnapshot={snapshot?.media}
          onSnapshotChange={(media) => onSnapshotChange({ media })}
        />
      </I18nProvider>
    </ViewerModuleBoundary>
  );
}

function AudioPreview({
  descriptor,
  locale,
  onSnapshotChange,
  snapshot,
  sourceUrl,
}: PreviewViewerProps): ReactElement {
  return (
    <ViewerModuleBoundary locale={locale}>
      <I18nProvider service={i18nService}>
        <AudioPlayer
          sourceUrl={sourceUrl}
          displayName={descriptor.displayName}
          initialSnapshot={snapshot?.media}
          onSnapshotChange={(media) => onSnapshotChange({ media })}
        />
      </I18nProvider>
    </ViewerModuleBoundary>
  );
}

function TextPreview({ sourceUrl, locale }: PreviewViewerProps): ReactElement {
  const [state, setState] = useState<
    | { readonly kind: 'loading' }
    | { readonly kind: 'ready'; readonly text: string }
    | { readonly kind: 'error'; readonly message: string }
  >({ kind: 'loading' });
  useEffect(() => {
    const abort = new AbortController();
    void fetch(sourceUrl, { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Preview source returned ${response.status}.`);
        return response.text();
      })
      .then((text) => setState({ kind: 'ready', text }))
      .catch((error: unknown) => {
        if (!abort.signal.aborted) setState({ kind: 'error', message: describeError(error) });
      });
    return () => abort.abort();
  }, [sourceUrl]);
  if (state.kind === 'loading')
    return <span>{label(locale, '正在读取文本…', 'Loading text…')}</span>;
  if (state.kind === 'error') return <span role="alert">{state.message}</span>;
  return <pre className="neko-preview-root__text">{state.text}</pre>;
}

function DocumentPreview({
  descriptor,
  locale,
  onSnapshotChange,
  snapshot,
  sourceUrl,
}: PreviewViewerProps): ReactElement {
  let viewer: ReactElement;
  switch (descriptor.mediaType) {
    case 'application/pdf':
      viewer = <PdfViewer sourceUrl={sourceUrl} />;
      break;
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      viewer = <DocxViewer sourceUrl={sourceUrl} />;
      break;
    case 'application/epub+zip':
      viewer = <EpubViewer sourceUrl={sourceUrl} />;
      break;
    case 'application/x-cbz':
      viewer = <CbzViewer sourceUrl={sourceUrl} />;
      break;
    default:
      return (
        <div className="neko-preview-root__status">
          {label(locale, '没有可用的文档预览器。', 'No document viewer is available.')}
        </div>
      );
  }
  return (
    <PersistedStateProvider
      key={descriptor.descriptorId}
      initialState={snapshot?.documentState}
      onStateChange={(documentState) => onSnapshotChange({ documentState })}
    >
      <ViewerModuleBoundary locale={locale}>
        <I18nProvider service={i18nService}>{viewer}</I18nProvider>
      </ViewerModuleBoundary>
    </PersistedStateProvider>
  );
}

function ModelPreview({
  descriptor,
  locale,
  onSnapshotChange,
  snapshot,
  sourceUrl,
}: PreviewViewerProps): ReactElement {
  const source = useMemo(
    () => createModelSourceDescriptor(descriptor, sourceUrl),
    [descriptor, sourceUrl],
  );
  const host = useMemo(() => {
    const next = createSourceModelViewerHost({
      sessionId: descriptor.descriptorId,
      source,
    });
    if (snapshot?.modelState !== undefined) next.setState(snapshot.modelState);
    return next;
  }, [descriptor.descriptorId, snapshot?.modelState, source]);
  useEffect(
    () => () => onSnapshotChange({ modelState: host.getState() }),
    [host, onSnapshotChange],
  );
  useEffect(() => {
    setLocale(locale);
  }, [locale]);
  return (
    <ViewerModuleBoundary locale={locale}>
      <I18nProvider service={i18nService}>
        <ModelViewer host={host} sessionId={descriptor.descriptorId} />
      </I18nProvider>
    </ViewerModuleBoundary>
  );
}

function ViewerModuleBoundary({
  children,
  locale,
}: {
  readonly children: ReactNode;
  readonly locale: SupportedLocale;
}): ReactElement {
  return (
    <Suspense
      fallback={
        <div className="neko-preview-root__status" role="status">
          {label(locale, '正在载入查看器…', 'Loading viewer…')}
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

function createModelSourceDescriptor(
  descriptor: PreviewMediaDescriptor,
  sourceUrl: string,
): ModelPreviewSourceDescriptor {
  const format = modelFormat(descriptor.displayName);
  return {
    source: descriptor.contentLocator,
    sourceFingerprint: descriptor.sourceFingerprint,
    format,
    entryUri: sourceUrl,
    uriMap: descriptor.resourceUris ?? { [descriptor.displayName]: sourceUrl },
    sizeBytes: descriptor.byteLength,
  };
}

function modelFormat(fileName: string): ModelPreviewFormat {
  const extension = fileName.slice(fileName.lastIndexOf('.') + 1).toLocaleLowerCase();
  if (
    extension === 'glb' ||
    extension === 'gltf' ||
    extension === 'obj' ||
    extension === 'stl' ||
    extension === 'ply'
  ) {
    return extension;
  }
  throw new Error(`Unsupported model format '${extension}'.`);
}

function label(locale: SupportedLocale, chinese: string, english: string): string {
  return locale === 'zh-cn' ? chinese : english;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
