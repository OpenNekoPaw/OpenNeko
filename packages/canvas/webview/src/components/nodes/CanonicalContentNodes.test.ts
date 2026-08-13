import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  resolveCanvasFileName,
  resolveCanvasNodeName,
  transitionMediaPlaybackOwner,
} from './CanonicalContentNodes';

const source = readFileSync(new URL('./CanonicalContentNodes.tsx', import.meta.url), 'utf8');
const baseNodeSource = readFileSync(new URL('./BaseNode.tsx', import.meta.url), 'utf8');

describe('canonical content node runtime boundaries', () => {
  it('keeps Markdown rendering and routes audio/video through the Preview stream surface', () => {
    expect(source).toContain('<MarkdownDocumentView');
    expect(source).toContain("import('@neko/markdown/rich-surface')");
    expect(source).not.toContain('streamdown');
    expect(source).not.toContain('@neko/text-editor');
    expect(source).not.toContain('TextEditor');
    expect(source).toContain('<CanvasMilkdownRichSurface');
    expect(source).toContain('onActivate={() => setIsEditing(true)}');
    expect(source).not.toContain('<textarea');
    expect(source).toContain('<PreviewSurface');
    expect(source).toContain('surfaceKind="inline"');
    expect(source).not.toContain('audioPresentation');
    expect(source).toContain('audioLayout={mediaType ===');
    expect(source).toContain("'node-card'");
    expect(source).not.toContain('canvas-audio-node-title');
    expect(source).toContain('onPointerEnter');
    expect(source).toContain('onPointerLeave');
    expect(source).toContain("'transient' as const");
    expect(source).not.toContain('<audio');
    expect(source).not.toContain('<video');
  });

  it('renders missing ContentLocators as explicit unavailable content without path fallback', () => {
    expect(source).toContain("t('node.contentUnavailable')");
    expect(source).toContain("t('node.contentLocatorMissing')");
    expect(source).toContain('!contentLocator ?');
    expect(source).toContain(
      'contentLocator && onEmbeddedPreview ? () => onEmbeddedPreview(node.id) : undefined',
    );
    expect(source).toContain('isEmbeddedPreviewFile(node.data)');
    expect(source).toContain('contentLocator && onOpen');
  });

  it('presents only the File basename in the label above the node card', () => {
    expect(
      resolveCanvasFileName({
        path: '',
        title: 'Assets/epub/animation/Blame/volume-01.epub',
      }),
    ).toBe('volume-01.epub');
    expect(
      resolveCanvasFileName({
        path: 'documents\\story\\outline.md',
        title: 'Ignored title',
      }),
    ).toBe('outline.md');
    expect(source).toContain('text: fileName');
    expect(source).toContain('text: title');
    expect(baseNodeSource).toContain('data-canvas-node-label');
    expect(baseNodeSource.indexOf('data-canvas-node-label')).toBeLessThan(
      baseNodeSource.indexOf('{/* Node content */}'),
    );
    expect(source).not.toContain('{node.data.title || fileName}');
    expect(source).not.toContain('{node.data.mediaType || fileName}');
  });

  it('normalizes path-shaped media names and does not append media titles below previews', () => {
    expect(resolveCanvasNodeName(['Media/video/scene-01.mp4'])).toBe('scene-01.mp4');
    expect(resolveCanvasNodeName(['page_001.jpg', 'Media/fallback.jpg'])).toBe('page_001.jpg');
    expect(resolveCanvasNodeName(['', undefined])).toBe('');
    expect(source).not.toContain('truncate border-t px-2 py-1.5 text-xs');
  });

  it('stops only transient hover playback when the pointer leaves', () => {
    expect(transitionMediaPlaybackOwner('idle', 'pointer-enter')).toBe('hover');
    expect(transitionMediaPlaybackOwner('hover', 'pointer-leave')).toBe('idle');
    expect(transitionMediaPlaybackOwner('hover', 'playing')).toBe('manual-playing');
    expect(transitionMediaPlaybackOwner('manual-playing', 'pointer-leave')).toBe('manual-playing');
    expect(transitionMediaPlaybackOwner('manual-playing', 'paused')).toBe('manual-paused');
    expect(transitionMediaPlaybackOwner('manual-paused', 'pointer-leave')).toBe('manual-paused');
  });
});
