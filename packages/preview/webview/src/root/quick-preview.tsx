import type { PreviewMediaDescriptor } from '@neko/preview-domain';
import type { SupportedLocale } from '@neko/ui/i18n';
import { lazy, Suspense, useEffect, type ReactElement } from 'react';
import { I18nProvider } from '../i18n/I18nContext';
import { i18nService, setLocale } from '../i18n';
import './style.css';

const AudioPlayer = lazy(async () => {
  const module = await import('../audio/AudioPlayer');
  return { default: module.AudioPlayer };
});

const VideoPlayer = lazy(async () => {
  const module = await import('../video/VideoPlayer');
  return { default: module.VideoPlayer };
});

export interface QuickPreviewSurfaceProps {
  readonly descriptor: Pick<
    PreviewMediaDescriptor,
    | 'byteLength'
    | 'contentKind'
    | 'contentLocator'
    | 'descriptorId'
    | 'displayName'
    | 'mediaType'
    | 'url'
  > &
    Partial<Pick<PreviewMediaDescriptor, 'sourceFingerprint'>>;
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
        <Suspense fallback={null}>
          <I18nProvider service={i18nService}>
            <VideoPlayer
              sourceUrl={sourceUrl}
              displayName={descriptor.displayName}
              autoPlay
              compact
              muted
            />
          </I18nProvider>
        </Suspense>
      ) : null}
      {descriptor.contentKind === 'audio' ? (
        <Suspense fallback={null}>
          <I18nProvider service={i18nService}>
            <AudioPlayer
              sourceUrl={sourceUrl}
              displayName={descriptor.displayName}
              autoPlay
              compact
            />
          </I18nProvider>
        </Suspense>
      ) : null}
    </section>
  );
}
