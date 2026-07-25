import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./CanonicalContentNodes.tsx', import.meta.url), 'utf8');

describe('canonical content node runtime boundaries', () => {
  it('keeps Markdown rendering and routes audio/video through the Preview stream surface', () => {
    expect(source).toContain('<MarkdownDocumentView');
    expect(source).toContain('<PreviewSurface');
    expect(source).toContain('surfaceKind="inline"');
    expect(source).not.toContain('<audio');
    expect(source).not.toContain('<video');
  });
});
