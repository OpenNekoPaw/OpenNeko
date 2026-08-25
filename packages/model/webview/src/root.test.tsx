// @vitest-environment jsdom
import type { ModelPreviewSourceDescriptor } from '@neko/model-domain';
import type { II18nService } from '@neko/ui/i18n';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@neko/ui/i18n/react', () => ({
  I18nProvider: ({ children }: { readonly children: ReactNode }) => children,
}));

vi.mock('./ModelViewer', () => ({
  ModelViewer: () => <div data-testid="model-viewer" />,
}));

import { ModelPreviewPresentation } from './root';

describe('ModelPreviewPresentation', () => {
  it('restores and returns package-owned model state at the presentation boundary', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div');
    const root = createRoot(container);
    const initialState = { selectedNode: 'mesh-1' };
    const onStateChange = vi.fn();

    await act(async () => {
      root.render(
        <ModelPreviewPresentation
          sessionId="model-session-1"
          source={modelSource}
          i18nService={{} as II18nService}
          initialState={initialState}
          onStateChange={onStateChange}
        />,
      );
    });

    expect(container.querySelector('[data-testid="model-viewer"]')).not.toBeNull();

    await act(async () => root.unmount());

    expect(onStateChange).toHaveBeenCalledOnce();
    expect(onStateChange).toHaveBeenCalledWith(initialState);
  });
});

const modelSource: ModelPreviewSourceDescriptor = {
  sourceFingerprint: 'model-fingerprint-1',
  source: {
    file: { authority: 'workspace', path: 'models/fixture.glb' },
  },
  format: 'glb',
  entryUri: 'http://127.0.0.1:43125/resources/model-token',
  uriMap: { 'fixture.glb': 'http://127.0.0.1:43125/resources/model-token' },
  sizeBytes: 42,
};
