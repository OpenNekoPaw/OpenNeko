import { describe, expect, it } from 'vitest';
import {
  inferCanvasDroppedAssetKind,
  inferCanvasMediaType,
  inferCanvasTextFileFormat,
} from '@neko/canvas-domain';

describe('canvas drop classification', () => {
  it('classifies sources into canonical Canvas source intents', () => {
    expect(inferCanvasDroppedAssetKind('shot-reference.png')).toBe('media');
    expect(inferCanvasDroppedAssetKind('pilot.fountain')).toBe('text');
    expect(inferCanvasDroppedAssetKind('brief.epub')).toBe('file');
    expect(inferCanvasDroppedAssetKind('notes.md')).toBe('text');
    expect(inferCanvasDroppedAssetKind('transcript.txt')).toBe('text');
    expect(inferCanvasDroppedAssetKind('character-lora.safetensors')).toBe('file');
    expect(inferCanvasDroppedAssetKind('storyboard.nkc')).toBe('canvas');
  });

  it('infers only media and Markdown/text rendering variants', () => {
    expect(inferCanvasMediaType('teaser.mov')).toBe('video');
    expect(inferCanvasTextFileFormat('style-guide.markdown')).toBe('markdown');
    expect(inferCanvasTextFileFormat('pilot.fountain')).toBe('plain');
    expect(inferCanvasTextFileFormat('notes.txt')).toBe('plain');
  });

  it('treats any named non-media source as File, including extensionless files', () => {
    expect(inferCanvasDroppedAssetKind('notes.rtf')).toBe('file');
    expect(inferCanvasDroppedAssetKind('README')).toBe('file');
    expect(inferCanvasMediaType('archive.zip')).toBeNull();
    expect(inferCanvasTextFileFormat('archive.zip')).toBeNull();
  });
});
