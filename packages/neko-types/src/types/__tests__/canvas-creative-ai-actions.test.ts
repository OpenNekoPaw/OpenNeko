import { describe, expect, it } from 'vitest';
import {
  CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
  type CreativeAiDocumentRef,
  type CreativeAiSourceRef,
  type CreativeAiTargetRef,
  isCanvasCreativeAiActionRequest,
  validateCanvasCreativeAiActionRequest,
} from '../index';

const documentRef: CreativeAiDocumentRef = {
  kind: 'nk-document',
  packageId: 'neko-canvas',
  documentId: 'canvas-document-1',
  projectRelativePath: 'boards/intro.nkc',
  format: 'nkc',
};

const sourceRef: CreativeAiSourceRef = {
  kind: 'canvas-node',
  packageId: 'neko-canvas',
  id: 'canvas-node:shot-1',
  documentRef,
  entityId: 'shot-1',
  revision: 'source-rev-1',
};

const targetRef: CreativeAiTargetRef = {
  kind: 'canvas-field',
  packageId: 'neko-canvas',
  id: 'canvas-node:shot-1#/storyboardPrompt/promptBlocks/videoPromptDocument',
  documentRef,
  entityId: 'shot-1',
  fieldPath: '/storyboardPrompt/promptBlocks/videoPromptDocument',
  revision: 'target-rev-1',
};

const candidateTargetRef: CreativeAiTargetRef = {
  ...targetRef,
  kind: 'candidate-target',
  id: 'canvas-node:shot-1#/candidates/videoPromptDocument',
  candidateOnly: true,
};

function validGenerateVideoRequest() {
  return {
    schemaVersion: CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
    requestId: 'canvas-action-1',
    actionId: 'generate-video',
    documentRef,
    sourceRef,
    targetRef,
    candidateTargetRef,
    documentRevision: 'doc-rev-1',
    targetRevision: 'target-rev-1',
    idempotencyKey: 'canvas-action:doc-1:shot-1:generate-video:target-rev-1',
    target: {
      nodeId: 'shot-1',
      sceneNodeId: 'scene-1',
      shotId: 'shot-001',
      shotNumber: 1,
    },
    creativeParameters: {
      promptDocuments: [
        {
          blockKind: 'video',
          documentId: 'shot-1:video:prompt',
          version: 1,
          baseRevision: 'prompt-rev-1',
        },
      ],
      generation: {
        duration: 5,
        aspectRatio: '16:9',
        advancedParameters: {
          seed: 1234,
        },
      },
      modelCapability: {
        providerId: 'newapi',
        modelId: 'video-model',
        videoGeneration: true,
        advancedParameters: ['seed'],
      },
    },
  } as const;
}

describe('Canvas creative AI action contracts', () => {
  it('validates explicit candidate-first Canvas creative action requests', () => {
    const valid = validGenerateVideoRequest();

    expect(validateCanvasCreativeAiActionRequest(valid).valid).toBe(true);
    expect(isCanvasCreativeAiActionRequest(valid)).toBe(true);
  });

  it('rejects missing fill targets and revisions before Agent execution', () => {
    const result = validateCanvasCreativeAiActionRequest({
      ...validGenerateVideoRequest(),
      candidateTargetRef: undefined,
      targetRevision: undefined,
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'creative-ai-invalid-ref',
          target: 'candidateTargetRef.targetRef',
        }),
        expect.objectContaining({
          code: 'creative-ai-missing-revision',
          target: 'targetRevision',
        }),
      ]),
    );
  });

  it('requires videoPromptDocument for video generation and editing', () => {
    const result = validateCanvasCreativeAiActionRequest({
      ...validGenerateVideoRequest(),
      creativeParameters: {
        promptDocuments: [
          {
            blockKind: 'image',
            documentId: 'shot-1:image:prompt',
            version: 1,
          },
        ],
      },
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'canvas-creative-ai-video-prompt-required',
          target: 'creativeParameters.promptDocuments',
        }),
      ]),
    );
  });

  it('rejects image and video edit actions without source media', () => {
    const imageEdit = validateCanvasCreativeAiActionRequest({
      ...validGenerateVideoRequest(),
      actionId: 'edit-image',
      creativeParameters: {
        promptDocuments: [
          {
            blockKind: 'image',
            documentId: 'shot-1:image:prompt',
            version: 1,
          },
        ],
        referenceMedia: {
          imageRefs: [],
        },
      },
    });

    expect(imageEdit.valid).toBe(false);
    expect(imageEdit.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'canvas-creative-ai-missing-image-edit-source',
          target: 'creativeParameters.referenceMedia.imageRefs',
        }),
      ]),
    );

    const videoEdit = validateCanvasCreativeAiActionRequest({
      ...validGenerateVideoRequest(),
      actionId: 'edit-video',
      creativeParameters: {
        promptDocuments: [
          {
            blockKind: 'video',
            documentId: 'shot-1:video:prompt',
            version: 1,
          },
        ],
        referenceMedia: {
          imageRefs: [],
          videoRefs: [],
        },
      },
    });

    expect(videoEdit.valid).toBe(false);
    expect(videoEdit.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'canvas-creative-ai-missing-video-edit-source',
          target: 'creativeParameters.referenceMedia',
        }),
      ]),
    );
  });

  it('rejects unsupported model capabilities and advanced parameters', () => {
    const result = validateCanvasCreativeAiActionRequest({
      ...validGenerateVideoRequest(),
      creativeParameters: {
        promptDocuments: [
          {
            blockKind: 'video',
            documentId: 'shot-1:video:prompt',
            version: 1,
          },
        ],
        generation: {
          advancedParameters: {
            motionStrength: 0.6,
          },
        },
        modelCapability: {
          videoGeneration: false,
          advancedParameters: ['seed'],
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'canvas-creative-ai-model-capability-unsupported',
          target: 'creativeParameters.modelCapability',
        }),
        expect.objectContaining({
          code: 'canvas-creative-ai-unsupported-advanced-parameter',
          target: 'creativeParameters.generation.advancedParameters.motionStrength',
        }),
      ]),
    );
  });
});
