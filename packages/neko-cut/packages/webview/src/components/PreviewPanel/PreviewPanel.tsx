import { forwardRef, memo } from 'react';
import { useTranslation } from '../../i18n/I18nContext';

export interface PreviewPanelProps {
  readonly title?: string;
  readonly source?: string;
  readonly projectWidth?: number;
  readonly projectHeight?: number;
}

export interface PreviewPanelRef {
  readonly canvas: HTMLCanvasElement | null;
}

export const PreviewPanel = memo(
  forwardRef<HTMLCanvasElement, PreviewPanelProps>(function PreviewPanel(
    { title, projectWidth = 1920, projectHeight = 1080 },
    canvasRef,
  ) {
    const { t } = useTranslation();
    return (
      <div className="cut-preview-panel cut-basic-preview flex h-full min-h-0 flex-col bg-vscode-bg">
        <div className="cut-preview-stage relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
          <div className="cut-basic-preview-stage relative flex items-center justify-center overflow-hidden bg-black">
            <canvas
              ref={canvasRef}
              width={projectWidth}
              height={projectHeight}
              className="block max-h-full max-w-full bg-black object-contain"
              aria-label={title ?? t('preview.noProjectLoaded')}
            />
            {title ? null : (
              <span className="pointer-events-none absolute text-sm text-vscode-description">
                {t('preview.noProjectLoaded')}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }),
);
