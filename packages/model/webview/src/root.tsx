import type { ModelPreviewSourceDescriptor } from '@neko/model-domain';
import type { II18nService } from '@neko/ui/i18n';
import { I18nProvider } from '@neko/ui/i18n/react';
import { useEffect, useMemo, type ReactElement } from 'react';
import { ModelViewer } from './ModelViewer';
import { createSourceModelViewerHost } from './sourceModelViewerHost';

export interface ModelPreviewPresentationProps {
  readonly sessionId: string;
  readonly source: ModelPreviewSourceDescriptor;
  readonly i18nService: II18nService;
  readonly initialState?: unknown;
  readonly onStateChange: (state: unknown) => void;
}

export function ModelPreviewPresentation({
  sessionId,
  source,
  i18nService,
  initialState,
  onStateChange,
}: ModelPreviewPresentationProps): ReactElement {
  const host = useMemo(() => {
    const next = createSourceModelViewerHost({
      sessionId,
      source,
    });
    if (initialState !== undefined) next.setState(initialState);
    return next;
  }, [initialState, sessionId, source]);

  useEffect(() => () => onStateChange(host.getState()), [host, onStateChange]);

  return (
    <I18nProvider service={i18nService}>
      <ModelViewer host={host} sessionId={sessionId} />
    </I18nProvider>
  );
}
