import { forwardRef, memo, type Ref } from 'react';
import { useTranslation } from '../../i18n/I18nContext';

export interface PreviewPanelProps {
  readonly title?: string;
  readonly source?: string;
  readonly projectWidth?: number;
  readonly projectHeight?: number;
  readonly videoRef?: Ref<HTMLVideoElement>;
  readonly secondaryVideoRef?: Ref<HTMLVideoElement>;
  readonly activeVideoSlot?: 0 | 1;
}

export interface PreviewPanelRef {
  readonly canvas: HTMLCanvasElement | null;
}

export const PreviewPanel = memo(
  forwardRef<HTMLCanvasElement, PreviewPanelProps>(function PreviewPanel(
    {
      title,
      projectWidth = 1920,
      projectHeight = 1080,
      videoRef,
      secondaryVideoRef,
      activeVideoSlot = 0,
    },
    canvasRef,
  ) {
    const { t } = useTranslation();
    return (
      <div className="cut-preview-panel cut-basic-preview flex h-full min-h-0 flex-col bg-neko-bg">
        <div className="cut-preview-stage relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-neko-bg">
          <div
            className="cut-basic-preview-stage relative flex items-center justify-center overflow-hidden bg-black"
            style={{ aspectRatio: `${projectWidth} / ${projectHeight}` }}
          >
            <canvas
              ref={canvasRef}
              width={projectWidth}
              height={projectHeight}
              className="block max-h-full max-w-full bg-black object-contain"
              aria-label={title ?? t('preview.noProjectLoaded')}
            />
            <video
              ref={videoRef}
              muted
              playsInline
              preload="auto"
              className={`absolute inset-0 block h-full w-full bg-black object-contain ${
                activeVideoSlot === 0 ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
              aria-label={title ?? t('preview.noProjectLoaded')}
              aria-hidden={activeVideoSlot !== 0}
            />
            <video
              ref={secondaryVideoRef}
              muted
              playsInline
              preload="auto"
              className={`absolute inset-0 block h-full w-full bg-black object-contain ${
                activeVideoSlot === 1 ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
              aria-label={title ?? t('preview.noProjectLoaded')}
              aria-hidden={activeVideoSlot !== 1}
            />
            {title ? null : (
              <span className="pointer-events-none absolute text-sm text-neko-description">
                {t('preview.noProjectLoaded')}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }),
);
