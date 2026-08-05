// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDefaultAssetCenterFilter } from '@neko/assets-domain/asset-center/contract';
import { AssetCenterMainRoot } from './main-root';

const globalLibraryStyles = readFileSync(resolve(__dirname, './style.css'), 'utf8');

describe('AssetCenterMainRoot', () => {
  it('owns a stable full-frame size for the canonical Preview presentation', () => {
    expect(globalLibraryStyles).toMatch(
      /\.asset-center-main\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;/u,
    );
  });

  it('projects empty and unavailable states under the exact Session identity', () => {
    const empty = renderToStaticMarkup(
      <AssetCenterMainRoot
        locale="en"
        projection={projection({ status: 'empty' })}
        renderPreview={() => <div>unexpected</div>}
      />,
    );
    expect(empty).toContain('data-asset-center-main-session-id="asset-center:window-1"');
    expect(empty).toContain('Select a resource to preview');

    const unavailable = renderToStaticMarkup(
      <AssetCenterMainRoot
        locale="en"
        projection={projection({
          status: 'unavailable',
          itemId: 'media-library:item-1',
          diagnostic: {
            code: 'preview-unsupported-kind',
            message: 'Unsupported content.',
          },
        })}
        renderPreview={() => <div>unexpected</div>}
      />,
    );
    expect(unavailable).toContain('Unsupported content.');
  });

  it('delegates only the owner-qualified Preview session', () => {
    const markup = renderToStaticMarkup(
      <AssetCenterMainRoot
        locale="en"
        projection={projection({
          status: 'ready',
          itemId: 'media-library:item-1',
          previewSessionId: 'preview:asset-center:1',
        })}
        renderPreview={(previewSessionId) => (
          <div data-preview-session-id={previewSessionId}>preview</div>
        )}
      />,
    );
    expect(markup).toContain('data-preview-session-id="preview:asset-center:1"');
  });
});

function projection(preview: Parameters<typeof projectionForPreview>[0]) {
  return projectionForPreview(preview);
}

function projectionForPreview(
  preview:
    | { readonly status: 'empty' }
    | { readonly status: 'loading'; readonly itemId: string }
    | {
        readonly status: 'ready';
        readonly itemId: string;
        readonly previewSessionId: string;
      }
    | {
        readonly status: 'unavailable';
        readonly itemId: string;
        readonly diagnostic: {
          readonly code: 'preview-unsupported-kind' | 'preview-source-unavailable';
          readonly message: string;
        };
      },
) {
  return {
    identity: { assetCenterSessionId: 'asset-center:window-1', windowId: 'window-1' },
    filter: createDefaultAssetCenterFilter(),
    catalog: { status: 'loading' as const },
    preview,
  };
}
