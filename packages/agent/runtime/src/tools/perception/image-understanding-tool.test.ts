import { TOOL_NAMES_PERCEPTION, type ToolPurposeModelRuntime } from '@neko/agent-contracts';
import { describe, expect, it, vi } from 'vitest';

import { PerceptionImageUnderstandTool } from './image-understanding-tool';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('PerceptionImageUnderstandTool', () => {
  it('uses only the Turn-bound image.understand model and returns bounded evidence', async () => {
    const complete = vi.fn(async () => ({
      text: 'A single white pixel is visible.',
      usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 },
    }));
    const purposeModel: ToolPurposeModelRuntime = {
      purpose: 'image.understand',
      providerId: 'openai',
      modelId: 'gpt-vision',
      complete,
    };
    const tool = new PerceptionImageUnderstandTool({
      now: () => 123,
      contentAccessRuntime: {
        loadContentAsset: vi.fn(async () => ({
          status: 'ready' as const,
          diagnostics: [],
          bytes: PNG,
          mimeType: 'image/png',
        })),
      },
    });

    const result = await tool.execute(
      {
        images: [
          {
            contentLocator: { file: { authority: 'workspace' as const, path: 'reference.png' } },
            label: 'reference.png',
          },
        ],
        focus: 'Read the visible content.',
      },
      { purposeModel },
    );

    expect(tool.name).toBe(TOOL_NAMES_PERCEPTION.IMAGE_UNDERSTAND);
    expect(tool.requiresConfirmation).toBe(true);
    expect(complete).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Read the visible content.',
        maxTokens: 2_048,
        images: [expect.objectContaining({ mimeType: 'image/png' })],
      }),
    );
    expect(result).toMatchObject({
      success: true,
      data: {
        source: 'tool',
        summary: 'A single white pixel is visible.',
        toolName: TOOL_NAMES_PERCEPTION.IMAGE_UNDERSTAND,
        modelContext: { providerId: 'openai', modelId: 'gpt-vision' },
        data: {
          kind: 'perception.image.understand',
          imageCount: 1,
          sources: [{ index: 0, label: 'reference.png' }],
          usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 },
        },
        createdAt: 123,
        status: 'active',
      },
    });
    expect(JSON.stringify(result)).not.toContain('workspace-file');
    expect(JSON.stringify(result)).not.toContain('iVBORw0KGgo');
  });

  it('fails locally when no exact purpose model is supplied', async () => {
    const loadContentAsset = vi.fn();
    const tool = new PerceptionImageUnderstandTool({ contentAccessRuntime: { loadContentAsset } });

    await expect(
      tool.execute({
        images: [
          { contentLocator: { file: { authority: 'workspace' as const, path: 'reference.png' } } },
        ],
      }),
    ).resolves.toEqual({
      success: false,
      error: 'Image understanding requires the Turn-bound image.understand model.',
    });
    expect(loadContentAsset).not.toHaveBeenCalled();
  });
});
