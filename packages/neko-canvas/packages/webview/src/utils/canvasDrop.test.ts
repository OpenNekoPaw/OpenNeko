import { describe, expect, it } from 'vitest';
import {
  inferCanvasDocumentType,
  inferCanvasDroppedAssetKind,
  inferCanvasMediaType,
  inferCanvasModelType,
  inferCanvasTextFileFormat,
} from '@neko/shared';

describe('canvas drop classification', () => {
  it('classifies media and input-node file types', () => {
    expect(inferCanvasDroppedAssetKind('shot-reference.png')).toBe('media');
    expect(inferCanvasDroppedAssetKind('pilot.fountain')).toBe('text');
    expect(inferCanvasDroppedAssetKind('brief.epub')).toBe('document');
    expect(inferCanvasDroppedAssetKind('notes.md')).toBe('text');
    expect(inferCanvasDroppedAssetKind('transcript.txt')).toBe('text');
    expect(inferCanvasDroppedAssetKind('character-lora.safetensors')).toBe('model');
    expect(inferCanvasDroppedAssetKind('storyboard.nkc')).toBe('canvas');
  });

  it('infers detailed media, document, and model subtypes', () => {
    expect(inferCanvasMediaType('teaser.mov')).toBe('video');
    expect(inferCanvasDocumentType('storyboard.cbz')).toBe('cbz');
    expect(inferCanvasDocumentType('style-guide.markdown')).toBe('markdown');
    expect(inferCanvasDocumentType('notes.log')).toBe('text');
    expect(inferCanvasTextFileFormat('style-guide.markdown')).toBe('markdown');
    expect(inferCanvasTextFileFormat('pilot.fountain')).toBe('plain');
    expect(inferCanvasTextFileFormat('notes.txt')).toBe('plain');
    expect(inferCanvasModelType('depth-controlnet.safetensors')).toBe('controlnet');
    expect(inferCanvasModelType('sdxl-base.safetensors')).toBe('checkpoint');
  });

  it('returns null for unsupported files', () => {
    expect(inferCanvasDroppedAssetKind('notes.rtf')).toBeNull();
    expect(inferCanvasMediaType('archive.zip')).toBeNull();
    expect(inferCanvasDocumentType('archive.zip')).toBeNull();
    expect(inferCanvasModelType('archive.zip')).toBeNull();
    expect(inferCanvasTextFileFormat('archive.zip')).toBeNull();
  });
});
