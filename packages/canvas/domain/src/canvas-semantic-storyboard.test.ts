import { describe, expect, it } from 'vitest';
import {
  projectCanvasStoryboardReviewRow,
  resolveCanvasStoryboardNextCreativeState,
  validateCanvasStoryboardActionIntent,
  validateCanvasStoryboardPromptState,
  validateCanvasStoryboardReferenceMedia,
  validateCanvasStoryboardSemanticPromptDocument,
  type CanvasStoryboardPromptState,
} from './canvas-semantic-storyboard';
import type { StoryboardMediaRef } from '@neko/canvas-domain';

describe('canvas semantic storyboard contracts', () => {
  it('validates semantic prompt documents as storyboard prompt authority', () => {
    const validation = validateCanvasStoryboardSemanticPromptDocument({
      documentId: 'shot-1:video:prompt',
      blockKind: 'video',
      text: 'Aki turns back in a rainy hallway',
      spans: [
        {
          id: 'span-action',
          kind: 'action',
          range: { start: 0, end: 14 },
          fieldId: 'shot.action',
          referenceStatus: 'resolved',
        },
      ],
      fieldProjections: [
        {
          fieldId: 'shot.action',
          value: 'Aki turns back',
          sourceSpanId: 'span-action',
          alignmentState: 'in-sync',
        },
      ],
    });

    expect(validation.valid).toBe(true);
    expect(validation.diagnostics).toEqual([]);
  });

  it('fails visibly for unresolved prompt refs', () => {
    const validation = validateCanvasStoryboardSemanticPromptDocument({
      documentId: 'shot-1:video:prompt',
      blockKind: 'video',
      text: 'Use @Aki',
      spans: [
        {
          kind: 'character',
          range: { start: 4, end: 8 },
          referenceStatus: 'ambiguous',
        },
      ],
    });

    expect(validation.valid).toBe(false);
    expect(validation.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unresolved-prompt-reference',
          target: 'spans[0]',
        }),
      ]),
    );
  });

  it('rejects malformed storyboard prompt documents', () => {
    const validation = validateCanvasStoryboardSemanticPromptDocument({
      documentId: '',
      blockKind: 'audio',
    });

    expect(validation.valid).toBe(false);
    expect(validation.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'malformed-storyboard-prompt-document',
          target: 'documentId',
        }),
        expect.objectContaining({
          code: 'unsupported-storyboard-prompt-block-kind',
          target: 'blockKind',
        }),
        expect.objectContaining({
          code: 'malformed-semantic-prompt',
          target: 'text',
        }),
      ]),
    );
  });

  it('rejects runtime-only media identities before reference media become durable', () => {
    const validation = validateCanvasStoryboardReferenceMedia({
      imageRefs: [
        {
          refId: 'preview',
          role: 'reference',
          locator: { type: 'asset', assetId: 'preview', uri: 'blob:neko-media/preview' },
        },
      ],
    });

    expect(validation.valid).toBe(false);
    expect(validation.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'runtime-only-storyboard-media-ref',
          target: 'imageRefs[0]',
        }),
      ]),
    );
  });

  it('rejects unsupported action ids and unsupported model parameters', () => {
    const validation = validateCanvasStoryboardActionIntent(
      {
        actionId: 'magic-render',
        target: { nodeId: 'shot-1' },
        generationParams: {
          advancedParameters: {
            seed: 42,
            loraStack: ['film'],
          },
        },
      },
      { supportedAdvancedParameters: ['aspectRatio'] },
    );

    expect(validation.valid).toBe(false);
    expect(validation.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unsupported-storyboard-action-intent',
          target: 'actionId',
        }),
        expect.objectContaining({
          code: 'unsupported-storyboard-advanced-parameter',
          target: 'advancedParameters.seed',
        }),
        expect.objectContaining({
          code: 'unsupported-storyboard-advanced-parameter',
          target: 'advancedParameters.loraStack',
        }),
      ]),
    );
  });

  it('rejects retired generic Task references instead of accepting a fallback path', () => {
    const stateValidation = validateCanvasStoryboardPromptState({
      executionRefs: {
        taskRefs: [{ source: 'agent', sourceTaskId: 'task-1' }],
      },
    });
    const intentValidation = validateCanvasStoryboardActionIntent({
      actionId: 'generate-image',
      target: { nodeId: 'shot-1' },
      taskRef: { source: 'agent', sourceTaskId: 'task-1' },
    });

    expect(stateValidation.valid).toBe(false);
    expect(intentValidation.valid).toBe(false);
    expect(stateValidation.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'retired-storyboard-task-contract',
          target: 'executionRefs.taskRefs',
        }),
      ]),
    );
    expect(intentValidation.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'retired-storyboard-task-contract',
          target: 'taskRef',
        }),
      ]),
    );
  });

  it('projects storyboard review rows from semantic prompt documents only', () => {
    const legacyRow = projectCanvasStoryboardReviewRow({
      nodeId: 'shot-legacy',
      data: {
        shotNumber: 2,
        duration: 5,
        generationPrompt: 'legacy plain prompt',
      },
    });

    expect(legacyRow.source).toBe('empty');
    expect(legacyRow.imagePrompt).toBe('');
    expect(legacyRow.videoPrompt).toBe('');
    expect(legacyRow.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing-semantic-storyboard-prompt' }),
      ]),
    );

    const promptState: CanvasStoryboardPromptState = {
      promptBlocks: {
        videoPromptDocument: {
          documentId: 'shot-2:video:prompt',
          blockKind: 'video',
          text: 'Aki turns back, slow dolly in',
        },
      },
      referenceMedia: { imageRefs: [stableMediaRef('source-panel')] },
      generationParams: { duration: 5, dialogue: 'Why are you here?' },
    };
    const semanticRow = projectCanvasStoryboardReviewRow({
      nodeId: 'shot-semantic',
      data: {
        shotNumber: 2,
        storyboardPrompt: promptState,
        generationPrompt: 'legacy prompt must not be read',
      },
    });

    expect(semanticRow.source).toBe('semantic-prompt-document');
    expect(semanticRow.shotNumber).toBe('2');
    expect(semanticRow.referenceMedia).toBe('image:1');
    expect(semanticRow.videoPrompt).toBe('Aki turns back, slow dolly in');
    expect(semanticRow.duration).toBe('5s');
    expect(semanticRow.dialogue).toBe('Why are you here?');
    expect(semanticRow.actionId).toBe('generate-video');
  });

  it('resolves storyboard next creative states for review and next action projection', () => {
    expect(resolveCanvasStoryboardNextCreativeState({}).id).toBe('missing-reference');
    expect(
      resolveCanvasStoryboardNextCreativeState({
        referenceMedia: {
          imageRefs: [stableMediaRef('source-panel')],
          diagnostics: [
            {
              severity: 'warning',
              code: 'reference-needs-processing',
              message: 'Reference frame needs cleanup.',
            },
          ],
        },
      }).id,
    ).toBe('needs-reference-processing');
    expect(
      resolveCanvasStoryboardNextCreativeState({
        promptBlocks: { imagePromptDocument: promptDocument('image', 'Clean keyframe') },
      }).id,
    ).toBe('image-prompt-ready');
    expect(
      resolveCanvasStoryboardNextCreativeState({
        referenceMedia: { imageRefs: [stableMediaRef('source-panel')] },
        promptBlocks: { videoPromptDocument: promptDocument('video', 'Slow dolly-in') },
      }).id,
    ).toBe('image-prompt-skipped');
    expect(
      resolveCanvasStoryboardNextCreativeState({
        referenceMedia: { imageRefs: [stableMediaRef('source-panel')] },
      }).id,
    ).toBe('missing-video-prompt');
    expect(
      resolveCanvasStoryboardNextCreativeState({
        referenceMedia: { imageRefs: [stableMediaRef('source-panel')] },
        promptBlocks: {
          imagePromptDocument: promptDocument('image', 'Prepared keyframe'),
          videoPromptDocument: promptDocument('video', 'Slow dolly-in'),
        },
      }).id,
    ).toBe('ready-to-generate-video');
    expect(
      resolveCanvasStoryboardNextCreativeState({
        referenceMedia: { imageRefs: [stableMediaRef('source-panel')] },
        promptBlocks: {
          imagePromptDocument: promptDocument(
            'image',
            '图像生成：雨夜走廊关键帧，保持原分格构图和角色一致性。',
          ),
          videoPromptDocument: promptDocument('video', 'Slow dolly-in'),
        },
      }).id,
    ).toBe('ready-to-generate-video');
    expect(
      resolveCanvasStoryboardNextCreativeState({
        referenceMedia: { imageRefs: [stableMediaRef('source-panel')] },
        promptBlocks: {
          imagePromptDocument: promptDocument(
            'image',
            '图像编辑：裁切左侧分格，旋转页面，上色并重绘线稿，保留角色五官。',
          ),
          videoPromptDocument: promptDocument(
            'video',
            '场景视频生成：两人站在平台尽头，镜头缓慢推近，保持场景空间关系。',
          ),
        },
      }),
    ).toEqual(
      expect.objectContaining({
        id: 'needs-reference-processing',
        target: 'reference-media',
        nextActionId: 'process-reference',
      }),
    );
    expect(
      resolveCanvasStoryboardNextCreativeState({
        executionRefs: { resultRefs: [{ mediaRef: stableMediaRef('generated-video') }] },
      }).id,
    ).toBe('needs-result-review');
    expect(
      resolveCanvasStoryboardNextCreativeState({
        diagnostics: [
          { severity: 'error', code: 'prompt-field-conflict', message: 'Prompt conflict.' },
        ],
      }).id,
    ).toBe('prompt-conflict');
    expect(
      resolveCanvasStoryboardNextCreativeState({
        diagnostics: [
          {
            severity: 'warning',
            code: 'approval-required',
            message: 'Approval required.',
            target: 'approval',
          },
        ],
      }).id,
    ).toBe('waiting-confirmation');
    expect(
      resolveCanvasStoryboardNextCreativeState({
        diagnostics: [
          {
            severity: 'error',
            code: 'provider-failed',
            message: 'Provider failed.',
            target: 'result-review',
            retryable: true,
          },
        ],
      }).id,
    ).toBe('failed-retry');
    expect(
      resolveCanvasStoryboardNextCreativeState({
        executionRefs: { resultRefs: [{ mediaRef: stableMediaRef('accepted-video') }] },
        diagnostics: [{ severity: 'info', code: 'result-accepted', message: 'Result accepted.' }],
      }).id,
    ).toBe('accepted');
  });
});

function stableMediaRef(refId: string): StoryboardMediaRef {
  return {
    refId,
    role: 'reference',
    locator: { type: 'asset', assetId: refId, uri: `assets/${refId}.png` },
    mimeType: 'image/png',
  };
}

function promptDocument(blockKind: 'image' | 'video' | 'voice', text: string) {
  return {
    documentId: `shot-test:${blockKind}:prompt`,
    blockKind,
    text,
  };
}
