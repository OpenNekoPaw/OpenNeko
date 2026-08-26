import { parsePreviewMediaDescriptor, type PreviewMediaDescriptor } from '@neko/preview-domain';
import type { SupportedLocale } from '@neko/ui/i18n';
import { useCallback, useEffect, useMemo, type ReactElement } from 'react';
import { createPreviewI18nService } from '../i18n';
import { createPreviewViewerSnapshotStore, type PreviewViewerSnapshot } from './viewer-snapshot';
import { renderPreviewViewer } from './viewer-kernel';
import type { PreviewViewerControlDensity, PreviewViewerPlayback } from './viewer-kernel';
import './style.css';

export interface LightweightPreviewProps {
  readonly descriptor: PreviewMediaDescriptor;
  readonly locale: SupportedLocale;
  readonly controlDensity?: PreviewViewerControlDensity;
  readonly mediaPlayback?: 'interactive' | 'inline' | 'ambient';
  readonly playback?: PreviewViewerPlayback;
}

export type LightweightPreviewPlayback = PreviewViewerPlayback;

export function LightweightPreview({
  descriptor: inputDescriptor,
  locale,
  controlDensity = 'compact',
  mediaPlayback = 'interactive',
  playback,
}: LightweightPreviewProps): ReactElement {
  const descriptorResult = useMemo(() => {
    try {
      return { descriptor: parsePreviewMediaDescriptor(inputDescriptor) } as const;
    } catch (error: unknown) {
      return { error: describeError(error) } as const;
    }
  }, [inputDescriptor]);
  const snapshotStore = useMemo(() => createPreviewViewerSnapshotStore(), []);
  const previewI18n = useMemo(() => createPreviewI18nService(locale), [locale]);
  useEffect(() => () => snapshotStore.clear(), [snapshotStore]);
  const updateSnapshot = useCallback(
    (update: Partial<PreviewViewerSnapshot>) =>
      snapshotStore.update(inputDescriptor.descriptorId, update),
    [inputDescriptor.descriptorId, snapshotStore],
  );

  if ('error' in descriptorResult) {
    return (
      <div className="neko-preview-surface__status is-error" role="alert">
        {descriptorResult.error}
      </div>
    );
  }

  const descriptor = descriptorResult.descriptor;
  const snapshot = snapshotStore.read(descriptor.descriptorId);
  return (
    <section
      className="neko-preview-surface neko-preview-surface--lightweight"
      data-preview-kind={descriptor.contentKind}
      data-preview-ui="lightweight"
      data-preview-owner="preview-webview"
      aria-label={descriptor.displayName}
    >
      {renderPreviewViewer({
        descriptor,
        controlDensity,
        mediaPlayback,
        locale,
        i18nService: previewI18n,
        ...(playback ? { playback } : {}),
        ...(snapshot ? { snapshot } : {}),
        onSnapshotChange: updateSnapshot,
      })}
    </section>
  );
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
