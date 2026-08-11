import type {
  ModelPreviewFormat,
  ModelPreviewSourceDescriptor,
  PreviewContentKind,
  PreviewMediaDescriptor,
} from '@neko/preview-domain';
import type { II18nService, SupportedLocale } from '@neko/ui/i18n';
import { MarkdownDocumentView } from '@neko/ui/markdown';
import {
  cloneElement,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { I18nProvider } from '../i18n/I18nContext';
import { createSourceModelViewerHost } from '../model/sourceModelViewerHost';
import { PersistedStateProvider } from '../shared/usePersistedState';
import type { PreviewViewerSnapshot } from './viewer-snapshot';

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

export type PreviewViewerPresentation = 'main' | 'quick' | 'embedded';

export interface PreviewViewerKernelProps {
  readonly descriptor: PreviewMediaDescriptor;
  readonly presentation: PreviewViewerPresentation;
  readonly locale: SupportedLocale;
  readonly i18nService: II18nService;
  readonly snapshot?: PreviewViewerSnapshot;
  readonly onSnapshotChange: (update: Partial<PreviewViewerSnapshot>) => void;
}

interface PreviewViewerRegistration {
  readonly kind: PreviewContentKind;
  readonly render: (props: PreviewViewerKernelProps) => ReactElement;
}

const VIEWERS: readonly PreviewViewerRegistration[] = [
  { kind: 'image', render: (props) => <ImagePreview {...props} /> },
  { kind: 'video', render: (props) => <VideoPreview {...props} /> },
  { kind: 'audio', render: (props) => <AudioPreview {...props} /> },
  { kind: 'text', render: (props) => <TextPreview {...props} /> },
  { kind: 'document', render: (props) => <DocumentPreview {...props} /> },
  { kind: 'model', render: (props) => <ModelPreview {...props} /> },
];

export function getRegisteredPreviewContentKinds(): readonly PreviewContentKind[] {
  return VIEWERS.map((viewer) => viewer.kind);
}

export function renderPreviewViewer(props: PreviewViewerKernelProps): ReactElement {
  const viewer = VIEWERS.find((candidate) => candidate.kind === props.descriptor.contentKind);
  if (!viewer) {
    return <ViewerDiagnostic locale={props.locale} message="unsupported" />;
  }
  return cloneElement(viewer.render(props), { key: props.descriptor.descriptorId });
}

function ImagePreview(props: PreviewViewerKernelProps): ReactElement {
  if (props.presentation === 'embedded') {
    return <EmbeddedImagePreview {...props} />;
  }
  return <BoundedImagePreview {...props} />;
}

function BoundedImagePreview({ descriptor, locale }: PreviewViewerKernelProps): ReactElement {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  return (
    <div className="neko-preview-viewer neko-preview-viewer--image" data-viewer-state={state}>
      <img
        src={descriptor.url}
        alt={descriptor.displayName}
        onLoad={() => setState('ready')}
        onError={() => setState('error')}
      />
      {state === 'loading' ? <ViewerLoading /> : null}
      {state === 'error' ? <ViewerDiagnostic locale={locale} message="source" /> : null}
    </div>
  );
}

function EmbeddedImagePreview({
  descriptor,
  locale,
  onSnapshotChange,
  snapshot,
}: PreviewViewerKernelProps): ReactElement {
  const initial = snapshot?.image ?? { scale: 1, translateX: 0, translateY: 0 };
  const [view, setView] = useState(initial);
  const drag = useRef<
    | {
        readonly pointerId: number;
        readonly startX: number;
        readonly startY: number;
        readonly originX: number;
        readonly originY: number;
      }
    | undefined
  >();
  useEffect(() => onSnapshotChange({ image: view }), [onSnapshotChange, view]);
  const setScale = (scale: number): void => {
    setView((current) => ({ ...current, scale: clamp(scale, 0.25, 8) }));
  };
  const onWheel = (event: ReactWheelEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setScale(view.scale * (event.deltaY < 0 ? 1.1 : 0.9));
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: view.translateX,
      originY: view.translateY,
    };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    setView((previous) => ({
      ...previous,
      translateX: current.originX + event.clientX - current.startX,
      translateY: current.originY + event.clientY - current.startY,
    }));
  };
  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (drag.current?.pointerId === event.pointerId) drag.current = undefined;
  };
  return (
    <div
      className="neko-preview-viewer neko-preview-viewer--embedded-image"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
    >
      <img
        src={descriptor.url}
        alt={descriptor.displayName}
        draggable={false}
        style={{
          transform: `translate3d(${view.translateX}px, ${view.translateY}px, 0) scale(${view.scale})`,
        }}
      />
      <div
        className="neko-preview-viewer__zoom"
        aria-label={label(locale, '图片缩放', 'Image zoom')}
      >
        <button
          type="button"
          onClick={() => setScale(view.scale / 1.2)}
          aria-label={label(locale, '缩小', 'Zoom out')}
        >
          −
        </button>
        <output>{Math.round(view.scale * 100)}%</output>
        <button
          type="button"
          onClick={() => setScale(view.scale * 1.2)}
          aria-label={label(locale, '放大', 'Zoom in')}
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setView({ scale: 1, translateX: 0, translateY: 0 })}
          aria-label={label(locale, '重置视图', 'Reset view')}
        >
          1:1
        </button>
      </div>
    </div>
  );
}

function VideoPreview(props: PreviewViewerKernelProps): ReactElement {
  if (props.presentation === 'quick') {
    return <NativeMediaPreview descriptor={props.descriptor} kind="video" />;
  }
  return (
    <ViewerModuleBoundary locale={props.locale}>
      <I18nProvider service={props.i18nService}>
        <VideoPlayer
          sourceUrl={props.descriptor.url}
          displayName={props.descriptor.displayName}
          initialSnapshot={props.snapshot?.media}
          onSnapshotChange={(media) => props.onSnapshotChange({ media })}
        />
      </I18nProvider>
    </ViewerModuleBoundary>
  );
}

function AudioPreview(props: PreviewViewerKernelProps): ReactElement {
  if (props.presentation === 'quick') {
    return <NativeMediaPreview descriptor={props.descriptor} kind="audio" />;
  }
  return (
    <ViewerModuleBoundary locale={props.locale}>
      <I18nProvider service={props.i18nService}>
        <AudioPlayer
          sourceUrl={props.descriptor.url}
          displayName={props.descriptor.displayName}
          initialSnapshot={props.snapshot?.media}
          onSnapshotChange={(media) => props.onSnapshotChange({ media })}
        />
      </I18nProvider>
    </ViewerModuleBoundary>
  );
}

function NativeMediaPreview({
  descriptor,
  kind,
}: {
  readonly descriptor: PreviewMediaDescriptor;
  readonly kind: 'audio' | 'video';
}): ReactElement {
  const mediaRef = useRef<HTMLMediaElement>(null);
  useEffect(() => {
    const media = mediaRef.current;
    return () => media?.pause();
  }, []);
  if (kind === 'video') {
    return (
      <video
        ref={mediaRef as React.RefObject<HTMLVideoElement>}
        className="neko-preview-viewer neko-preview-viewer--native-media"
        src={descriptor.url}
        aria-label={descriptor.displayName}
        controls
        playsInline
        preload="metadata"
      />
    );
  }
  return (
    <audio
      ref={mediaRef as React.RefObject<HTMLAudioElement>}
      className="neko-preview-viewer neko-preview-viewer--native-audio"
      src={descriptor.url}
      aria-label={descriptor.displayName}
      controls
      preload="metadata"
    />
  );
}

function TextPreview(props: PreviewViewerKernelProps): ReactElement {
  if (props.presentation === 'quick') {
    return <ViewerDiagnostic locale={props.locale} message="summary" />;
  }
  return <ReadOnlyTextPreview {...props} />;
}

function ReadOnlyTextPreview({ descriptor }: PreviewViewerKernelProps): ReactElement {
  const [state, setState] = useState<
    | { readonly kind: 'loading' }
    | { readonly kind: 'ready'; readonly text: string }
    | { readonly kind: 'error'; readonly message: string }
  >({ kind: 'loading' });
  useEffect(() => {
    const abort = new AbortController();
    void fetch(descriptor.url, { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Preview source returned ${response.status}.`);
        return response.text();
      })
      .then((text) => setState({ kind: 'ready', text }))
      .catch((error: unknown) => {
        if (!abort.signal.aborted) setState({ kind: 'error', message: describeError(error) });
      });
    return () => abort.abort();
  }, [descriptor.url]);
  if (state.kind === 'loading') return <ViewerLoading />;
  if (state.kind === 'error') return <span role="alert">{state.message}</span>;
  if (descriptor.mediaType === 'text/markdown' || descriptor.mediaType === 'text/x-markdown') {
    return <MarkdownDocumentView value={state.text} className="neko-preview-root__markdown" />;
  }
  return <pre className="neko-preview-root__text">{state.text}</pre>;
}

function DocumentPreview(props: PreviewViewerKernelProps): ReactElement {
  if (props.presentation === 'quick') {
    return <ViewerDiagnostic locale={props.locale} message="summary" />;
  }
  let viewer: ReactElement;
  switch (props.descriptor.mediaType) {
    case 'application/pdf':
      viewer = <PdfViewer sourceUrl={props.descriptor.url} />;
      break;
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      viewer = <DocxViewer sourceUrl={props.descriptor.url} />;
      break;
    case 'application/epub+zip':
      viewer = <EpubViewer sourceUrl={props.descriptor.url} />;
      break;
    case 'application/x-cbz':
      viewer = <CbzViewer sourceUrl={props.descriptor.url} />;
      break;
    default:
      return <ViewerDiagnostic locale={props.locale} message="unsupported" />;
  }
  return (
    <PersistedStateProvider
      key={props.descriptor.descriptorId}
      initialState={props.snapshot?.documentState}
      onStateChange={(documentState) => props.onSnapshotChange({ documentState })}
    >
      <ViewerModuleBoundary locale={props.locale}>
        <I18nProvider service={props.i18nService}>{viewer}</I18nProvider>
      </ViewerModuleBoundary>
    </PersistedStateProvider>
  );
}

function ModelPreview(props: PreviewViewerKernelProps): ReactElement {
  if (props.presentation === 'quick') {
    return <ViewerDiagnostic locale={props.locale} message="summary" />;
  }
  return <CompleteModelPreview {...props} />;
}

function CompleteModelPreview({
  descriptor,
  snapshot,
  onSnapshotChange,
  locale,
  i18nService,
}: PreviewViewerKernelProps): ReactElement {
  const source = useMemo(() => createModelSourceDescriptor(descriptor), [descriptor]);
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
      fallback={<ViewerLoading label={label(locale, '正在载入查看器…', 'Loading viewer…')} />}
    >
      {children}
    </Suspense>
  );
}

function ViewerLoading({ label: loadingLabel }: { readonly label?: string }): ReactElement {
  return (
    <div className="neko-preview-viewer__status" role="status">
      {loadingLabel}
    </div>
  );
}

function ViewerDiagnostic({
  locale,
  message,
}: {
  readonly locale: SupportedLocale;
  readonly message: 'source' | 'summary' | 'unsupported';
}): ReactElement {
  const text =
    message === 'source'
      ? label(locale, '预览资源不可用。', 'Preview source is unavailable.')
      : message === 'summary'
        ? label(
            locale,
            '轻量预览不读取完整文件。',
            'Quick preview does not read the complete file.',
          )
        : label(locale, '没有可用的预览器。', 'No viewer is available.');
  return (
    <div className="neko-preview-viewer__status is-error" role="alert">
      {text}
    </div>
  );
}

function createModelSourceDescriptor(
  descriptor: PreviewMediaDescriptor,
): ModelPreviewSourceDescriptor {
  return {
    source: descriptor.contentLocator,
    sourceFingerprint: descriptor.sourceFingerprint,
    format: modelFormat(descriptor.displayName),
    entryUri: descriptor.url,
    uriMap: descriptor.resourceUris ?? { [descriptor.displayName]: descriptor.url },
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function label(locale: SupportedLocale, chinese: string, english: string): string {
  return locale === 'zh-cn' ? chinese : english;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
