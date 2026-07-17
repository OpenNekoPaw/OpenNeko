import {
  TOOL_NAMES_MEDIA,
  TOOL_NAMES_PERCEPTION,
  TOOL_NAMES_QUALITY,
  type Tool,
} from '@neko/shared';
import { describe, expect, it, vi } from 'vitest';

import {
  projectOpenNekoTool,
  OpenNekoPiToolExecutionError,
  resolveOpenNekoToolModelPurpose,
} from '../openneko-tool';

function tool(overrides: Partial<Tool> = {}): Tool {
  return {
    name: 'InspectAsset',
    description: 'Inspect one asset',
    localization: { zh: { description: '检查一个资源' } },
    category: 'analysis',
    parameters: {
      type: 'object',
      properties: {
        assetId: { type: 'string', minLength: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
      required: ['assetId'],
      additionalProperties: false,
    },
    requirements: { writableProject: true },
    execute: vi.fn(async () => ({ success: true, data: { evidence: 'ok' } })),
    ...overrides,
  };
}

const context = {
  identity: {
    workspaceId: 'workspace-1',
    conversationId: 'conversation-1',
    branchId: 'branch-1',
    turnId: 'turn-1',
    runId: 'run-1',
    toolCallId: 'tool-call-1',
  },
  workspaceTrusted: true,
};

describe('OpenNeko tool projection to Pi', () => {
  it.each([
    [TOOL_NAMES_QUALITY.QUALITY_CHECK, 'image.understand'],
    [TOOL_NAMES_PERCEPTION.IMAGE_UNDERSTAND, 'image.understand'],
    [TOOL_NAMES_MEDIA.GENERATE_IMAGE, 'image.generate'],
    [TOOL_NAMES_MEDIA.TRANSFORM_IMAGE, 'image.edit'],
    [TOOL_NAMES_MEDIA.GENERATE_VIDEO, 'video.generate'],
    [TOOL_NAMES_MEDIA.GENERATE_MUSIC, 'audio.music.generate'],
    [TOOL_NAMES_MEDIA.GENERATE_TTS, 'audio.tts'],
  ] as const)('maps %s to its flat model purpose', (name, purpose) => {
    expect(resolveOpenNekoToolModelPurpose({ name })).toBe(purpose);
  });

  it('does not invent a purpose for a tool without a configured model contract', () => {
    expect(resolveOpenNekoToolModelPurpose({ name: 'InspectAsset' })).toBeUndefined();
  });

  it('preserves the strict JSON schema and localized description', () => {
    const projected = projectOpenNekoTool(tool(), {
      locale: 'zh',
      modelPurpose: 'image.understand',
    });

    expect(projected.description).toBe('检查一个资源');
    expect(projected.parameters).toMatchObject({
      type: 'object',
      required: ['assetId'],
      additionalProperties: false,
      properties: {
        assetId: { type: 'string', minLength: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
    });
    expect(projected.modelPurpose).toBe('image.understand');
    expect(projected.requirements).toEqual({ workspaceTrust: true });
  });

  it('executes through the owning Tool with explicit identity and model facts', async () => {
    const execute = vi.fn(async () => ({ success: true, data: { evidence: 'ok' } }));
    const projected = projectOpenNekoTool(tool({ execute }), {
      modelPurpose: 'image.understand',
    });
    const result = await projected.execute({
      args: { assetId: 'asset-1' },
      context: {
        ...context,
        modelUse: {
          purpose: 'image.understand',
          model: {
            id: 'vision-model',
            name: 'Vision',
            provider: 'provider-1',
            api: 'openai-completions',
            baseUrl: 'https://example.invalid/v1',
            reasoning: false,
            input: ['text', 'image'],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 32_000,
            maxTokens: 4_096,
          },
          parameters: { temperature: 0.2 },
        },
        purposeModel: {
          purpose: 'image.understand',
          providerId: 'provider-1',
          modelId: 'vision-model',
          complete: vi.fn(),
        },
      },
    });

    expect(execute).toHaveBeenCalledWith(
      { assetId: 'asset-1' },
      expect.objectContaining({
        metadata: expect.objectContaining({
          conversationId: 'conversation-1',
          turnId: 'turn-1',
          runId: 'run-1',
          toolCallId: 'tool-call-1',
          modelPurpose: 'image.understand',
          modelId: 'vision-model',
        }),
        purposeModel: expect.objectContaining({
          purpose: 'image.understand',
          providerId: 'provider-1',
          modelId: 'vision-model',
        }),
      }),
    );
    expect(result).toEqual({
      content: [{ type: 'text', text: '{"evidence":"ok"}' }],
      details: { success: true, data: { evidence: 'ok' } },
    });
  });

  it('propagates failed Tool results instead of presenting fallback success', async () => {
    const projected = projectOpenNekoTool(
      tool({ execute: async () => ({ success: false, error: 'permission denied' }) }),
    );

    await expect(projected.execute({ args: {}, context })).rejects.toEqual(
      expect.objectContaining({
        name: 'OpenNekoPiToolExecutionError',
        message: 'permission denied',
      }) satisfies Partial<OpenNekoPiToolExecutionError>,
    );
  });
});
