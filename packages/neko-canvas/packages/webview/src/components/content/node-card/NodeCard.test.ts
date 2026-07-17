import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CanvasNode } from '@neko/shared';
import { CardPreviewSlot, NodeCard } from './index';
import type { CardPreviewSource } from './types';

describe('NodeCard rendering', () => {
  it('renders heterogeneous Scene child summaries through generic node cards', () => {
    const shot = createNode('shot-1', 'shot', {
      shotNumber: 1,
      visualDescription: 'Train door',
      generationStatus: 'done',
      generationHistory: [
        {
          id: 'candidate-1',
          dataUrl: 'data:image/png;base64,shot',
          selected: true,
        },
      ],
    });
    const media = createNode('media-1', 'media', {
      assetPath: 'assets/ref.png',
      mediaType: 'image',
    });
    const text = createNode('text-1', 'text', { content: 'Pinned note' });

    const markup = [shot, media, text]
      .map((node) => renderToStaticMarkup(React.createElement(NodeCard, { node })))
      .join('\n');

    expect(markup).toContain('data-node-card-id="shot-1"');
    expect(markup).toContain('Shot 1');
    expect(markup).toContain('data:image/png;base64,shot');
    expect(markup).toContain('ref.png');
    expect(markup).toContain('Pinned note');
  });

  it('renders unknown node unsupported cards', () => {
    const node = createNode('storyboard-1', 'storyboard', { title: 'Legacy' });

    const markup = renderToStaticMarkup(React.createElement(NodeCard, { node }));

    expect(markup).toContain('data-node-card-id="storyboard-1"');
    expect(markup).toContain('Storyboard');
  });

  it('supports compact row variants for constrained container slots', () => {
    const node = createNode('text-1', 'text', { content: 'Pinned note for a narrow scene' });

    const markup = renderToStaticMarkup(React.createElement(NodeCard, { node, variant: 'row' }));

    expect(markup).toContain('data-node-card-variant="row"');
    expect(markup).toContain('min-h-[42px]');
    expect(markup).toContain('h-10 w-14');
    expect(markup).toContain('Pinned note');
  });

  it('supports large summary and gallery preview variants for container child cards', () => {
    const node = createNode('media-1', 'media', {
      assetPath: 'data:image/png;base64,preview',
      mediaType: 'image',
    });

    const summaryMarkup = renderToStaticMarkup(
      React.createElement(CardPreviewSlot, {
        source: {
          renderForm: 'asset-thumbnail',
          aspectRatio: '3/2',
          source: {
            id: 'summary-preview',
            role: 'image',
            variants: [
              {
                id: 'summary-preview',
                role: 'image',
                sourcePath: 'data:image/png;base64,preview',
              },
            ],
          },
        } satisfies CardPreviewSource,
        title: 'Summary',
        variant: 'summary-large',
      }),
    );
    const galleryMarkup = renderToStaticMarkup(
      React.createElement(NodeCard, { node, variant: 'gallery' }),
    );

    expect(summaryMarkup).toContain('min-h-[72px]');
    expect(summaryMarkup).toContain('bg-gray-100');
    expect(galleryMarkup).toContain('data-node-card-variant="gallery"');
    expect(galleryMarkup).toContain('min-h-[104px]');
    expect(galleryMarkup).toContain('data:image/png;base64,preview');
  });
});

describe('CardPreviewSlot rendering', () => {
  it('uses safe inline variant for asset preview without persisting runtime fields', () => {
    const source: CardPreviewSource = {
      renderForm: 'asset-thumbnail',
      aspectRatio: '3/2',
      source: {
        id: 'shot-preview',
        role: 'generation-candidate',
        variants: [
          {
            id: 'candidate-1',
            role: 'generation-candidate',
            sourcePath: 'data:image/png;base64,inline',
          },
        ],
      },
    };

    const markup = renderToStaticMarkup(
      React.createElement(CardPreviewSlot, { source, title: 'Shot preview' }),
    );

    expect(markup).toContain('data:image/png;base64,inline');
    expect(JSON.stringify(source)).not.toContain('runtimeUrl');
  });

  it('renders review-full image previews with bounded natural dimensions', () => {
    const source: CardPreviewSource = {
      renderForm: 'asset-thumbnail',
      aspectRatio: '3/2',
      source: {
        id: 'shot-review',
        role: 'source-image',
        variants: [
          {
            id: 'reference-image',
            role: 'source-image',
            sourcePath: 'data:image/png;base64,tall-source',
          },
        ],
      },
    };

    const markup = renderToStaticMarkup(
      React.createElement(CardPreviewSlot, {
        source,
        title: 'Tall source',
        variant: 'review-full',
        imageFit: 'contain',
      }),
    );

    expect(markup).toContain('relative inline-flex max-h-[220px] max-w-[180px]');
    expect(markup).toContain('h-auto max-h-[220px] w-auto max-w-full object-contain');
    expect(markup).not.toContain('aspect-ratio');
    expect(markup).not.toContain('object-cover');
    expect(markup).not.toContain('max-h-[720px]');
  });

  it('renders waveform, text, icon, and unsafe asset fallback forms', () => {
    const waveform = renderToStaticMarkup(
      React.createElement(CardPreviewSlot, {
        source: { renderForm: 'waveform', waveformStyle: 'bars' } satisfies CardPreviewSource,
        title: 'Audio',
      }),
    );
    const text = renderToStaticMarkup(
      React.createElement(CardPreviewSlot, {
        source: { renderForm: 'text', textExcerpt: 'Caption' } satisfies CardPreviewSource,
        title: 'Caption',
      }),
    );
    const icon = renderToStaticMarkup(
      React.createElement(CardPreviewSlot, {
        source: { renderForm: 'icon', icon: 'N' } satisfies CardPreviewSource,
        title: 'Fallback',
      }),
    );
    const unsafe = renderToStaticMarkup(
      React.createElement(CardPreviewSlot, {
        source: {
          renderForm: 'asset-thumbnail',
          aspectRatio: '3/2',
          source: {
            id: 'unsafe',
            role: 'image',
            variants: [{ id: 'unsafe', role: 'image', sourcePath: 'javascript:alert(1)' }],
          },
        } satisfies CardPreviewSource,
        title: 'Unsafe',
      }),
    );

    expect(waveform).toContain('Play');
    expect(text).toContain('Caption');
    expect(icon).toContain('N');
    expect(unsafe).toContain('IMG');
    expect(unsafe).not.toContain('javascript:alert');
  });

  it('renders static preview shells during low-cost interaction mode', () => {
    const shell = renderToStaticMarkup(
      React.createElement(CardPreviewSlot, {
        source: {
          renderForm: 'asset-thumbnail',
          aspectRatio: '3/2',
          source: {
            id: 'preview',
            role: 'image',
            variants: [{ id: 'preview', role: 'image', sourcePath: 'data:image/png;base64,image' }],
          },
        } satisfies CardPreviewSource,
        title: 'Preview',
        interactionRenderMode: 'shell',
      }),
    );
    const video = renderToStaticMarkup(
      React.createElement(CardPreviewSlot, {
        source: {
          renderForm: 'media-poster',
          aspectRatio: '3/2',
          source: {
            id: 'video',
            role: 'video-poster',
            variants: [
              { id: 'poster', role: 'video-poster', sourcePath: 'data:image/png;base64,poster' },
            ],
          },
        } satisfies CardPreviewSource,
        title: 'Video',
        interactionRenderMode: 'shell',
      }),
    );

    expect(shell).toContain('data-node-card-preview-shell="true"');
    expect(shell).not.toContain('data:image/png;base64,image');
    expect(video).not.toContain('data-node-card-preview-shell="true"');
    expect(video).toContain('data:image/png;base64,poster');
  });

  it('does not render a video file URL as a poster image', () => {
    const markup = renderToStaticMarkup(
      React.createElement(CardPreviewSlot, {
        source: {
          renderForm: 'media-poster',
          aspectRatio: '3/2',
          source: {
            id: 'video',
            role: 'video-poster',
            variants: [
              {
                id: 'source-video',
                role: 'video-poster',
                sourcePath: 'https://file+.vscode-resource.vscode-cdn.net/workspace/clip.mp4',
              },
            ],
          },
        } satisfies CardPreviewSource,
        title: 'Video',
      }),
    );

    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('clip.mp4');
    expect(markup).toContain('VID');
    expect(markup).toContain('rounded-full');
  });
});

function createNode(
  id: string,
  type: CanvasNode['type'],
  data: Record<string, unknown>,
): CanvasNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 80 },
    zIndex: 1,
    data,
  } as CanvasNode;
}
