import { ConsoleLogger, LogLevel } from '@neko/shared';
import { WebviewErrorBoundary } from '@neko/ui/error-boundary';
import { useTranslation } from '@neko/ui/i18n/react';
import type { ReactNode } from 'react';

const desktopRendererLogger = new ConsoleLogger('DesktopRenderer', LogLevel.Info);

export function DesktopRootErrorBoundary({
  children,
  description,
  retryLabel,
  title,
}: {
  readonly children: ReactNode;
  readonly description: string;
  readonly retryLabel: string;
  readonly title: string;
}): JSX.Element {
  return (
    <WebviewErrorBoundary
      logger={desktopRendererLogger}
      title={title}
      description={(error) => `${description} ${error.message}`}
      retryLabel={retryLabel}
      className="desktop-render-error desktop-render-error--root"
      contentClassName="desktop-render-error__content"
      buttonClassName="desktop-render-error__retry"
    >
      {children}
    </WebviewErrorBoundary>
  );
}

export function DesktopSurfaceErrorBoundary({
  children,
  surfaceIdentity,
}: {
  readonly children: ReactNode;
  readonly surfaceIdentity: string;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <WebviewErrorBoundary
      logger={desktopRendererLogger.child(surfaceIdentity)}
      title={t('shell.surfaceRenderFailure')}
      description={(error) =>
        t('shell.surfaceRenderFailureDetail', {
          error: error.message,
          surface: surfaceIdentity,
        })
      }
      retryLabel={t('shell.retrySurface')}
      className="desktop-render-error desktop-render-error--surface"
      contentClassName="desktop-render-error__content"
      buttonClassName="desktop-render-error__retry"
    >
      {children}
    </WebviewErrorBoundary>
  );
}
