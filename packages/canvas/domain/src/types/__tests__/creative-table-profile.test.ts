import { describe, expect, it } from 'vitest';
import {
  STORYBOARD_CREATIVE_TABLE_PROFILE,
  STORYBOARD_CREATIVE_TABLE_RECOMMENDED_HEADERS,
  classifyCreativeTableHeaders,
  getCreativeTableOperationRequirement,
  normalizeCreativeTableHeader,
  resolveCreativeTableField,
} from '../creative-table-profile';

describe('creative table profile descriptor', () => {
  it('resolves localized storyboard aliases to stable field ids', () => {
    expect(resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, '建议操作')?.id).toBe(
      'nextAction',
    );
    expect(resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, '来源分格')?.id).toBe(
      'sourcePanel',
    );
    expect(resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, '视频提示词')?.id).toBe(
      'videoPrompt',
    );
    expect(resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, '场景视频提示词')?.id).toBe(
      'videoPrompt',
    );
    expect(
      resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, 'imageEditPrompt')?.id,
    ).toBe('imagePrompt');
    expect(resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, 'custom review')?.id).toBe(
      undefined,
    );
  });

  it('keeps review fields open while classifying known storyboard fields', () => {
    const result = classifyCreativeTableHeaders(STORYBOARD_CREATIVE_TABLE_PROFILE, [
      '场景',
      '镜头',
      '来源',
      '画面',
      '图像提示词',
      '自定义审阅列',
    ]);

    expect(result.matchedProfile).toBe(true);
    expect(result.knownFields.map((field) => field.id)).toEqual([
      'scene',
      'shot',
      'source',
      'visual',
      'imagePrompt',
    ]);
    expect(result.unknownHeaders).toEqual(['自定义审阅列']);
  });

  it('keeps canonical prompt fields limited to image and video prompts', () => {
    const imagePrompt = STORYBOARD_CREATIVE_TABLE_PROFILE.fields.find(
      (field) => field.id === 'imagePrompt',
    );
    const videoPrompt = STORYBOARD_CREATIVE_TABLE_PROFILE.fields.find(
      (field) => field.id === 'videoPrompt',
    );
    const splitPromptFieldIds = [
      'imageEditPrompt',
      'shotVideoPrompt',
      'videoEditPrompt',
      'sceneStylePrompt',
      'sceneVideoPrompt',
      'sceneVideoEditPrompt',
    ];

    expect(
      splitPromptFieldIds.filter((fieldId) =>
        STORYBOARD_CREATIVE_TABLE_PROFILE.fields.some((field) => field.id === fieldId),
      ),
    ).toEqual([]);
    expect(
      STORYBOARD_CREATIVE_TABLE_PROFILE.recommendedHeaders.filter((fieldId) =>
        splitPromptFieldIds.includes(fieldId),
      ),
    ).toEqual([]);
    expect(
      STORYBOARD_CREATIVE_TABLE_PROFILE.fields
        .filter((field) => field.promptSlot && field.id !== 'prompt')
        .map((field) => field.id),
    ).toEqual(['imagePrompt', 'videoPrompt']);

    expect(imagePrompt?.promptSlot).toEqual({
      scope: 'shot',
      mediaType: 'image',
      operation: 'generate',
    });
    expect(videoPrompt?.promptSlot).toEqual({
      scope: 'scene',
      mediaType: 'video',
      operation: 'generate',
    });
    expect(imagePrompt?.productionMapping?.target).toBe('storyboardPrompt.imagePromptDocument');
    expect(videoPrompt?.productionMapping?.target).toBe('storyboardPrompt.videoPromptDocument');
    expect(JSON.stringify(STORYBOARD_CREATIVE_TABLE_PROFILE)).not.toContain(
      'shot.generationPrompt',
    );
    expect(JSON.stringify(STORYBOARD_CREATIVE_TABLE_PROFILE)).not.toContain('shot.promptSlots');
    expect(JSON.stringify(STORYBOARD_CREATIVE_TABLE_PROFILE)).not.toContain('scene.promptSlots');
  });

  it('maps split prompt headers to canonical prompt fields without making video shot-scoped', () => {
    expect(resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, '图像编辑提示词')?.id).toBe(
      'imagePrompt',
    );
    expect(
      resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, 'sceneStylePrompt')?.id,
    ).toBe('imagePrompt');
    expect(
      resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, 'videoEditPrompt')?.id,
    ).toBe('videoPrompt');
    expect(
      resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, 'sceneVideoEditPrompt')?.id,
    ).toBe('videoPrompt');
  });

  it('keeps nextAction as plan text and actionId as execution', () => {
    expect(resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, 'nextAction')?.role).toBe(
      'plan',
    );
    expect(resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, 'actionId')?.role).toBe(
      'execution',
    );
  });

  it('returns operation-specific requirements only when requested', () => {
    expect(
      getCreativeTableOperationRequirement(
        STORYBOARD_CREATIVE_TABLE_PROFILE,
        'video.scene.generate',
      ),
    ).toEqual({
      operationId: 'video.scene.generate',
      label: 'Generate scene video',
      requiredFieldIds: ['videoPrompt'],
      acceptedPromptFieldIds: ['videoPrompt'],
    });
    expect(
      getCreativeTableOperationRequirement(
        STORYBOARD_CREATIVE_TABLE_PROFILE,
        'video.shot.generate',
      ),
    ).toBeUndefined();
    expect(
      getCreativeTableOperationRequirement(STORYBOARD_CREATIVE_TABLE_PROFILE, 'video.shot.edit'),
    ).toBeUndefined();
    expect(
      getCreativeTableOperationRequirement(STORYBOARD_CREATIVE_TABLE_PROFILE, 'image.shot.edit')
        ?.requiredFieldIds,
    ).toEqual(['imagePrompt']);
  });

  it('normalizes headers consistently with existing storyboard behavior', () => {
    expect(normalizeCreativeTableHeader('Source Panel')).toBe('sourcepanel');
    expect(normalizeCreativeTableHeader('source_panel')).toBe('sourcepanel');
    expect(STORYBOARD_CREATIVE_TABLE_RECOMMENDED_HEADERS).toEqual([
      'scene',
      'shot',
      'source',
      'imagePrompt',
      'videoPrompt',
      'duration',
      'dialogue',
    ]);
    expect(STORYBOARD_CREATIVE_TABLE_RECOMMENDED_HEADERS).not.toContain('decisionReason');
  });

  it('keeps storyboard descriptor references internally consistent', () => {
    const fieldIds = new Set(STORYBOARD_CREATIVE_TABLE_PROFILE.fields.map((field) => field.id));

    expect(
      STORYBOARD_CREATIVE_TABLE_PROFILE.recommendedHeaders.filter(
        (fieldId) => !fieldIds.has(fieldId),
      ),
    ).toEqual([]);
    expect(
      STORYBOARD_CREATIVE_TABLE_PROFILE.minimumFieldGroups
        .flat()
        .filter((fieldId) => !fieldIds.has(fieldId)),
    ).toEqual([]);

    for (const requirement of STORYBOARD_CREATIVE_TABLE_PROFILE.operationRequirements) {
      expect(requirement.requiredFieldIds.filter((fieldId) => !fieldIds.has(fieldId))).toEqual([]);
      expect(
        requirement.acceptedPromptFieldIds.filter((fieldId) => !fieldIds.has(fieldId)),
      ).toEqual([]);
    }
  });

  it('keeps storyboard prompt slots in the minimum production anchor group', () => {
    const productionAnchorGroup = STORYBOARD_CREATIVE_TABLE_PROFILE.minimumFieldGroups.find(
      (group) => group.includes('visual') && group.includes('source') && group.includes('prompt'),
    );
    const promptSlotFieldIds = STORYBOARD_CREATIVE_TABLE_PROFILE.fields
      .filter((field) => field.promptSlot)
      .map((field) => field.id);

    expect(productionAnchorGroup).toBeDefined();
    expect(
      promptSlotFieldIds.filter((fieldId) => !productionAnchorGroup?.includes(fieldId)),
    ).toEqual([]);
  });

  it('keeps operation requirements aligned with prompt media type', () => {
    for (const requirement of STORYBOARD_CREATIVE_TABLE_PROFILE.operationRequirements) {
      const [mediaType] = requirement.operationId.split('.');

      for (const fieldId of requirement.requiredFieldIds) {
        const field = STORYBOARD_CREATIVE_TABLE_PROFILE.fields.find(
          (candidate) => candidate.id === fieldId,
        );

        expect(field?.promptSlot?.mediaType).toBe(mediaType);
      }
    }
  });

  it('keeps imagePrompt localized label out of legacy prompt aliases', () => {
    const promptField = STORYBOARD_CREATIVE_TABLE_PROFILE.fields.find(
      (field) => field.id === 'prompt',
    );

    expect(resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, '图像提示词')?.id).toBe(
      'imagePrompt',
    );
    expect(promptField?.aliases).not.toContain('图像提示词');
  });
});
