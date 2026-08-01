import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./CanonicalContentNodes.tsx', import.meta.url), 'utf8');

describe('canonical content node runtime boundaries', () => {
  it('keeps Markdown rendering and routes audio/video through the Preview stream surface', () => {
    expect(source).toContain('<MarkdownDocumentView');
    expect(source).toContain('<PreviewSurface');
    expect(source).toContain('surfaceKind="inline"');
    expect(source).not.toContain('audioPresentation');
    expect(source).toContain('audioLayout={mediaType ===');
    expect(source).toContain("'node-card'");
    expect(source).toContain('canvas-audio-node-title');
    expect(source).toContain('onPointerEnter');
    expect(source).toContain('onPointerLeave');
    expect(source).toContain("persistence: 'transient'");
    expect(source).not.toContain('<audio');
    expect(source).not.toContain('<video');
  });

  it('renders missing ContentLocators as explicit unavailable content without path fallback', () => {
    expect(source).toContain("t('node.contentUnavailable')");
    expect(source).toContain("t('node.contentLocatorMissing')");
    expect(source).toContain('!contentLocator ?');
    expect(source).toContain('onActivate={contentLocator && onOpen');
  });
});
