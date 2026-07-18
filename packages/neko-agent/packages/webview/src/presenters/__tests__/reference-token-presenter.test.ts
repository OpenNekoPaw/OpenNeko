import { describe, expect, it } from 'vitest';
import type { AgentContextPayload, MessageAttachment } from '@neko/shared';
import {
  formatReferenceBasename,
  formatReferenceParentPath,
  formatReferenceSize,
  inferReferenceKindFromPath,
  projectAmbientCanvasReferenceToken,
  projectAttachmentReferenceToken,
  projectContextPayloadReferenceToken,
  projectMessageContextReferenceToken,
  projectPathReferenceToken,
  toAttachmentTypeFromPathReference,
} from '../reference-token-presenter';

describe('reference-token-presenter', () => {
  it('projects path-backed references into stable token metadata', () => {
    expect(
      projectPathReferenceToken({
        path: 'cases/1080P.mp4',
        label: '1080P.mp4',
      }),
    ).toEqual({
      kind: 'video',
      label: '1080P.mp4',
      title: 'cases/1080P.mp4',
      meta: 'cases',
      countLabel: null,
      thumbnailSrc: null,
    });
  });

  it('uses media type hints before falling back to file extension inference', () => {
    expect(inferReferenceKindFromPath('assets/storyboard.frames', 'sequence')).toBe('video');
    expect(toAttachmentTypeFromPathReference({ path: 'assets/hero.png' })).toBe('image');
    expect(toAttachmentTypeFromPathReference({ path: 'assets/readme.md' })).toBe('file');
    expect(toAttachmentTypeFromPathReference({ path: 'books/story.epub' })).toBe('file');
  });

  it('projects uploaded attachments with parent path, size, and preview metadata', () => {
    const attachment: MessageAttachment = {
      id: 'attachment-1',
      name: 'brief.md',
      type: 'file',
      path: 'docs/brief.md',
      size: 2048,
    };

    expect(projectAttachmentReferenceToken(attachment)).toEqual({
      kind: 'file',
      label: 'brief.md',
      title: 'docs/brief.md (2.0 KB)',
      meta: 'docs · 2.0 KB',
      countLabel: null,
      thumbnailSrc: null,
    });
  });

  it('projects context payloads and stored message references through the same token model', () => {
    const payload: AgentContextPayload = {
      id: 'scene-1',
      type: 'scene',
      label: 'Scene 1',
      summary: 'Gate scene',
      data: null,
    };

    expect(projectContextPayloadReferenceToken(payload)).toEqual({
      kind: 'entity',
      label: 'Scene 1',
      title: 'Gate scene',
      meta: null,
      countLabel: null,
      thumbnailSrc: null,
    });
    expect(
      projectMessageContextReferenceToken({
        id: 'node-1',
        type: 'canvas-node',
        label: '#1 wide shot',
      }),
    ).toEqual({
      kind: 'canvas',
      label: '#1 wide shot',
      title: '#1 wide shot',
      meta: null,
      countLabel: null,
      thumbnailSrc: null,
    });
  });

  it('projects ambient canvas references as ambient tokens', () => {
    expect(
      projectAmbientCanvasReferenceToken({
        label: '#1 wide shot',
        title: '#1 wide shot\n#2 close-up',
        meta: '+1',
        countLabel: '2 shots',
      }),
    ).toEqual({
      kind: 'canvas',
      label: '#1 wide shot',
      title: '#1 wide shot\n#2 close-up',
      meta: '+1',
      countLabel: '2 shots',
      thumbnailSrc: null,
      variant: 'ambient',
    });
  });

  it('projects model preview contexts without accepting the removed model-scene path', () => {
    expect(
      projectContextPayloadReferenceToken({
        id: 'model-1',
        type: 'model-preview',
        label: 'hero.glb',
        summary: 'Staged model view',
        data: {},
      }),
    ).toMatchObject({ kind: 'canvas', label: 'hero.glb' });
    expect(inferReferenceKindFromPath('models/hero.glb')).toBe('file');
  });

  it('formats shared path and size labels consistently', () => {
    expect(formatReferenceBasename('assets/live2d/face.exp3.json')).toBe('face.exp3.json');
    expect(formatReferenceParentPath('assets/live2d/face.exp3.json')).toBe('assets/live2d');
    expect(formatReferenceParentPath('face.exp3.json')).toBeNull();
    expect(formatReferenceSize(128)).toBe('128 B');
    expect(formatReferenceSize(1024)).toBe('1.0 KB');
  });
});
