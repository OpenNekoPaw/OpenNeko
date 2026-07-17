import type { AgentContentAccessRuntime } from '@neko/agent/runtime';
import {
  TOOL_NAMES_PERCEPTION,
  createResourceRef,
  type AgentCapabilityContext,
} from '@neko/shared';
import { describe, expect, it, vi } from 'vitest';

import { createPerceptionCapabilityProvider } from '../perceptionCapabilityProvider';

const context: AgentCapabilityContext = { extensionContext: {} };

const resourceRef = createResourceRef({
  id: 'asset:image:cat',
  scope: 'project',
  provider: 'generated-asset',
  kind: 'media',
  source: { kind: 'file', projectRelativePath: 'neko/generated/image/cat.png' },
  fingerprint: { strategy: 'hash', value: 'sha256:cat-v1' },
});

function contentAccessRuntime(
  loadProviderAsset: AgentContentAccessRuntime['loadProviderAsset'],
): AgentContentAccessRuntime {
  return {
    resolve: vi.fn(),
    resolveImageMetadata: vi.fn(),
    resolveDocumentContent: vi.fn(),
    loadProviderAsset,
    projectResource: vi.fn(),
  };
}

describe('PerceptionCapabilityProvider', () => {
  it('returns structured image evidence from the exact purpose model and stable ResourceRef', async () => {
    const loadProviderAsset = vi.fn().mockResolvedValue({
      status: 'ready',
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png',
      diagnostics: [],
    });
    const complete = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        summary: 'An orange cat sits beside a window.',
        notes: ['The subject is centered.', 'Warm side lighting is visible.'],
        confidence: 0.92,
        tags: ['cat', 'window'],
      }),
      usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
    });
    const provider = createPerceptionCapabilityProvider({
      getContentAccessRuntime: () => contentAccessRuntime(loadProviderAsset),
      now: vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(125),
    });
    const tool = provider
      .getTools(context)
      .find((candidate) => candidate.name === TOOL_NAMES_PERCEPTION.IMAGE_UNDERSTAND)!;

    const result = await tool.execute(
      { resourceRef, focus: 'Describe composition.' },
      {
        purposeModel: {
          purpose: 'image.understand',
          providerId: 'newapi',
          modelId: 'vision-v1',
          complete,
        },
        trace: {
          conversationId: 'conversation-1',
          turnId: 'turn-1',
          runId: 'run-1',
          toolRequestId: 'tool-call-1',
          phase: 'tool',
        },
      },
    );

    expect(tool.parameters.properties).toEqual(
      expect.objectContaining({ resourceRef: expect.any(Object), focus: expect.any(Object) }),
    );
    expect(tool.parameters.properties).not.toHaveProperty('providerId');
    expect(tool.parameters.properties).not.toHaveProperty('modelId');
    expect(tool.parameters.properties).not.toHaveProperty('path');
    expect(loadProviderAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        caller: 'perception-asset-loader',
        source: resourceRef,
        preferredTarget: 'bytes',
      }),
    );
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Describe composition.',
        images: [{ data: 'AQID', mimeType: 'image/png' }],
        maxTokens: 1_200,
      }),
    );
    expect(result).toMatchObject({
      success: true,
      data: {
        schema: 'neko.image-understanding.v1',
        resourceRef,
        model: {
          purpose: 'image.understand',
          providerId: 'newapi',
          modelId: 'vision-v1',
        },
        usage: { totalTokens: 30 },
      },
      perceptionCards: [
        {
          assetId: resourceRef.id,
          sourceToolCallId: 'tool-call-1',
          modality: 'image',
          structural: { mimeType: 'image/png', byteSize: 3 },
          cost: { totalMs: 25, tokenEstimate: 30, gpuUsed: false },
        },
      ],
    });
  });

  it('rejects path-shaped input and a missing purpose runtime without materializing content', async () => {
    const loadProviderAsset = vi.fn();
    const tool = createPerceptionCapabilityProvider({
      getContentAccessRuntime: () => contentAccessRuntime(loadProviderAsset),
    }).getTools(context)[0]!;

    await expect(tool.execute({ resourceRef: '/tmp/cat.png' })).rejects.toThrow(
      'image-understanding-resource-required',
    );
    await expect(tool.execute({ resourceRef })).rejects.toThrow(
      'image-understanding-purpose-unavailable',
    );
    expect(loadProviderAsset).not.toHaveBeenCalled();
  });

  it('fails visibly when the purpose model does not return structured evidence', async () => {
    const loadProviderAsset = vi.fn().mockResolvedValue({
      status: 'ready',
      bytes: new Uint8Array([1]),
      mimeType: 'image/png',
      diagnostics: [],
    });
    const tool = createPerceptionCapabilityProvider({
      getContentAccessRuntime: () => contentAccessRuntime(loadProviderAsset),
    }).getTools(context)[0]!;

    await expect(
      tool.execute(
        { resourceRef },
        {
          purposeModel: {
            purpose: 'image.understand',
            providerId: 'newapi',
            modelId: 'vision-v1',
            complete: vi.fn().mockResolvedValue({
              text: 'not json',
              usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            }),
          },
        },
      ),
    ).rejects.toThrow('image-understanding-invalid-response');
  });
});
