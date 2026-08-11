import { parsePreviewMediaDescriptor, type PreviewMediaDescriptor } from '@neko/preview-domain';
import type { SupportedLocale } from '@neko/ui/i18n';
import { useCallback, useEffect, useMemo, type ReactElement } from 'react';
import { createPreviewI18nService } from '../i18n';
import { createPreviewViewerSnapshotStore, type PreviewViewerSnapshot } from './viewer-snapshot';
import { renderPreviewViewer, type PreviewViewerPresentation } from './viewer-kernel';
import './style.css';

export interface PreviewEmbeddedSurfaceProps {
  readonly descriptor: PreviewMediaDescriptor;
  readonly locale: SupportedLocale;
}

export type QuickPreviewSurfaceProps = PreviewEmbeddedSurfaceProps;
export type EmbeddedPreviewSurfaceProps = PreviewEmbeddedSurfaceProps;

export function QuickPreviewSurface(props: QuickPreviewSurfaceProps): ReactElement {
  return <PreviewEmbeddedSurface {...props} presentation="quick" />;
}

export function EmbeddedPreviewSurface(props: EmbeddedPreviewSurfaceProps): ReactElement {
  return <PreviewEmbeddedSurface {...props} presentation="embedded" />;
}

function PreviewEmbeddedSurface({
  descriptor: inputDescriptor,
  locale,
  presentation,
}: PreviewEmbeddedSurfaceProps & {
  readonly presentation: Exclude<PreviewViewerPresentation, 'main'>;
}): ReactElement {
  const descriptorResult = useMemo(() => {
    try {
      return { descriptor: parsePreviewMediaDescriptor(inputDescriptor) } as const;
    } catch (error: unknown) {
      return { error: describeError(error) } as const;
    }
  }, [inputDescriptor]);
  const snapshotStore = useMemo(() => createPreviewViewerSnapshotStore(), []);
  const surfaceI18n = useMemo(() => createPreviewI18nService(locale), [locale]);
  useEffect(() => () => snapshotStore.clear(), [snapshotStore]);
  const updateSnapshot = useCallback(
    (update: Partial<PreviewViewerSnapshot>) =>
      snapshotStore.update(inputDescriptor.descriptorId, update),
    [inputDescriptor.descriptorId, snapshotStore],
  );
  if ('error' in descriptorResult) {
    return (
      <div
        className="neko-preview-surface__status is-error"
        data-preview-presentation={presentation}
        role="alert"
      >
        {descriptorResult.error}
      </div>
    );
  }
  const descriptor = descriptorResult.descriptor;
  return (
    <section
      className={`neko-preview-surface neko-preview-surface--${presentation}`}
      data-preview-kind={descriptor.contentKind}
      data-preview-presentation={presentation}
      data-preview-presentation-owner="preview-webview"
      aria-label={descriptor.displayName}
    >
      {renderPreviewViewer({
        descriptor,
        presentation,
        locale,
        i18nService: surfaceI18n,
        ...(snapshotStore.read(descriptor.descriptorId)
          ? { snapshot: snapshotStore.read(descriptor.descriptorId) }
          : {}),
        onSnapshotChange: updateSnapshot,
      })}
    </section>
  );
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
