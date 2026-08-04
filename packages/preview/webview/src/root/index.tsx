import type {
  ModelPreviewFormat,
  ModelPreviewSourceDescriptor,
  PreviewContentKind,
  PreviewHostRuntime,
  PreviewMediaDescriptor,
  PreviewProjection,
  PreviewHostRuntimeRoute,
} from '@neko/preview-domain';
import type {
  AuthorizedPreviewSessionProjection,
  AuthorizedPreviewSessionRuntime,
} from '@neko/preview-domain/authorized-session';
import { PREVIEW_HOST_RUNTIME_ROUTES, PREVIEW_HOST_RUNTIME_VERSION } from '@neko/preview-domain';
import type { SupportedLocale } from '@neko/ui/i18n';
import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { I18nProvider } from '../i18n/I18nContext';
import { i18nService, setLocale } from '../i18n';
import { ModelViewer } from '../model/ModelViewer';
import { createSourceModelViewerHost } from '../model/sourceModelViewerHost';
import { CbzViewer } from '../cbz/CbzViewer';
import { DocxViewer } from '../docx/DocxViewer';
import { EpubViewer } from '../epub/EpubViewer';
import { PdfViewer } from '../pdf/PdfViewer';
import { AudioPlayer } from '../audio/AudioPlayer';
import { VideoPlayer } from '../video/VideoPlayer';
import '../model/model.css';
import '../styles/player.css';
import './style.css';

export interface PreviewRootProps {
  readonly runtime: PreviewHostRuntime;
  readonly locale: SupportedLocale;
  readonly chrome?: PreviewChrome;
}

export type PreviewChrome = 'default' | 'content-only';

export interface AuthorizedPreviewRootProps {
  readonly runtime: AuthorizedPreviewSessionRuntime;
  readonly locale: SupportedLocale;
  readonly chrome?: PreviewChrome;
}

export interface QuickPreviewSurfaceProps {
  readonly descriptor: PreviewMediaDescriptor;
  readonly locale: SupportedLocale;
}

export function QuickPreviewSurface({
  descriptor,
  locale,
}: QuickPreviewSurfaceProps): ReactElement {
  useEffect(() => {
    setLocale(locale);
  }, [locale]);
  const sourceUrl = descriptor.url;
  return (
    <section
      className="neko-preview-quick"
      data-preview-kind={descriptor.contentKind}
      aria-label={descriptor.displayName}
    >
      {descriptor.contentKind === 'image' ? (
        <img src={sourceUrl} alt={descriptor.displayName} />
      ) : null}
      {descriptor.contentKind === 'video' ? (
        <I18nProvider service={i18nService}>
          <VideoPlayer
            sourceUrl={sourceUrl}
            displayName={descriptor.displayName}
            autoPlay
            compact
            muted
          />
        </I18nProvider>
      ) : null}
      {descriptor.contentKind === 'audio' ? (
        <I18nProvider service={i18nService}>
          <AudioPlayer
            sourceUrl={sourceUrl}
            displayName={descriptor.displayName}
            autoPlay
            compact
          />
        </I18nProvider>
      ) : null}
    </section>
  );
}

type PreviewRootState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly projection: PreviewProjection }
  | { readonly kind: 'error'; readonly message: string };

export interface PreviewViewerProps {
  readonly descriptor: PreviewMediaDescriptor;
  readonly sourceUrl: string;
  readonly locale: SupportedLocale;
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
}: {
  readonly actions?: ReactNode;
  readonly authorizedPreviewSessionId?: string;
  readonly chrome?: PreviewChrome;
  readonly descriptor: PreviewMediaDescriptor;
  readonly locale: SupportedLocale;
}): ReactElement {
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
      <div className="neko-preview-root__viewer">
        {viewer.render({ descriptor, sourceUrl: descriptor.url, locale })}
      </div>
    </section>
  );
}

export function PreviewRoot({
  chrome = 'default',
  locale,
  runtime,
}: PreviewRootProps): ReactElement {
  const [state, setState] = useState<PreviewRootState>({ kind: 'loading' });
  const [pendingRoute, setPendingRoute] = useState<PreviewHostRuntimeRoute>();
  const sequence = useRef(0);

  useEffect(() => {
    setLocale(locale);
  }, [locale]);

  useEffect(() => {
    let active = true;
    sequence.current = 0;
    setState({ kind: 'loading' });
    const unsubscribe = runtime.subscribe((event) => {
      if (!active) return;
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
    void runtime
      .getSnapshot()
      .then((projection) => {
        if (active) setState({ kind: 'ready', projection });
      })
      .catch((error: unknown) => {
        if (active) setState({ kind: 'error', message: describeError(error) });
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [runtime]);

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
        schemaVersion: PREVIEW_HOST_RUNTIME_VERSION,
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
      descriptor={projection.descriptor}
      locale={locale}
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
  locale,
  runtime,
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

function VideoPreview({ descriptor, sourceUrl }: PreviewViewerProps): ReactElement {
  return (
    <I18nProvider service={i18nService}>
      <VideoPlayer sourceUrl={sourceUrl} displayName={descriptor.displayName} />
    </I18nProvider>
  );
}

function AudioPreview({ descriptor, sourceUrl }: PreviewViewerProps): ReactElement {
  return (
    <I18nProvider service={i18nService}>
      <AudioPlayer sourceUrl={sourceUrl} displayName={descriptor.displayName} />
    </I18nProvider>
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

function DocumentPreview({ descriptor, locale, sourceUrl }: PreviewViewerProps): ReactElement {
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
  return <I18nProvider service={i18nService}>{viewer}</I18nProvider>;
}

function ModelPreview({ descriptor, locale, sourceUrl }: PreviewViewerProps): ReactElement {
  const source = useMemo(
    () => createModelSourceDescriptor(descriptor, sourceUrl),
    [descriptor, sourceUrl],
  );
  const host = useMemo(
    () =>
      createSourceModelViewerHost({
        sessionId: descriptor.descriptorId,
        source,
      }),
    [descriptor.descriptorId, source],
  );
  useEffect(() => {
    setLocale(locale);
  }, [locale]);
  return (
    <I18nProvider service={i18nService}>
      <ModelViewer host={host} sessionId={descriptor.descriptorId} />
    </I18nProvider>
  );
}

function createModelSourceDescriptor(
  descriptor: PreviewMediaDescriptor,
  sourceUrl: string,
): ModelPreviewSourceDescriptor {
  const format = modelFormat(descriptor.displayName);
  return {
    source: descriptor.contentLocator,
    sourceFingerprint: descriptor.revision,
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
