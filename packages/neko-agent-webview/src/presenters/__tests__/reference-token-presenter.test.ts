import { describe, expect, it } from 'vitest';
import type { AgentContextPayload, MessageAttachment, ResourceRef } from '@neko/shared';
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

  it('projects 3D reference roles and guide restrictions into chip metadata', () => {
    const payload: AgentContextPayload = {
      id: '3d-reference:session-1:2',
      type: '3d-reference',
      label: 'Neutral mannequin',
      summary: 'Pose and camera reference',
      data: threeReferenceData(),
    };

    expect(projectContextPayloadReferenceToken(payload)).toMatchObject({
      kind: 'image',
      meta: 'pose · camera · guide-only',
    });
  });

  it('rejects invalid 3D reference chip data instead of disguising it as a file', () => {
    expect(() =>
      projectContextPayloadReferenceToken({
        id: '3d-reference:invalid',
        type: '3d-reference',
        label: 'Invalid',
        summary: 'Invalid',
        data: {},
      }),
    ).toThrow(/3D Reference context is invalid/);
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

  it('formats shared path and size labels consistently', () => {
    expect(formatReferenceBasename('assets/live2d/face.exp3.json')).toBe('face.exp3.json');
    expect(formatReferenceParentPath('assets/live2d/face.exp3.json')).toBe('assets/live2d');
    expect(formatReferenceParentPath('face.exp3.json')).toBeNull();
    expect(formatReferenceSize(128)).toBe('128 B');
    expect(formatReferenceSize(1024)).toBe('1.0 KB');
  });
});

function threeReferenceData() {
  return {
    contractVersion: 1,
    staging: {
      schemaVersion: 1,
      sessionId: 'session-1',
      revision: 2,
      subject: {
        kind: 'builtin-preset',
        presetId: 'guide-neutral-mannequin',
        presetVersion: 1,
        fingerprint: 'preset-fingerprint',
        presetKind: 'mannequin',
        appearancePolicy: 'guide-only',
        allowedPurposes: ['pose', 'camera'],
      },
      selectedPurposes: ['pose', 'camera'],
      camera: {
        cameraId: 'front',
        position: { x: 0, y: 1, z: 3 },
        target: { x: 0, y: 1, z: 0 },
        fieldOfViewDeg: 45,
        aspectRatio: 1,
      },
      pose: { poseId: 'standing', joints: [] },
    },
    outputs: [
      {
        kind: 'pose',
        sessionId: 'session-1',
        revision: 2,
        controlImage: resourceRef('pose-control'),
        controlMode: 'pose',
        joints: [],
      },
      {
        kind: 'camera',
        sessionId: 'session-1',
        revision: 2,
        camera: {
          cameraId: 'front',
          position: { x: 0, y: 1, z: 3 },
          target: { x: 0, y: 1, z: 0 },
          fieldOfViewDeg: 45,
          aspectRatio: 1,
        },
      },
    ],
  };
}

function resourceRef(id: string): ResourceRef {
  return {
    id,
    scope: 'project',
    provider: 'preview-variant',
    kind: 'preview',
    source: {
      kind: 'preview-asset',
      previewAssetId: id,
      filePath: `/workspace/.neko/.cache/resources/three-reference-captures/${id}.png`,
    },
    locator: { kind: 'preview-asset', assetId: id },
    fingerprint: {
      strategy: 'provider',
      value: `preview:${id}`,
      providerId: 'preview-variant',
    },
  };
}
