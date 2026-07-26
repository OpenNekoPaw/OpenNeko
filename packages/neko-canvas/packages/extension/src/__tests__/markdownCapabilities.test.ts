import { describe, expect, it, vi } from 'vitest';
import type { CanvasMarkdownCapabilityInput } from '@neko/shared';
import { invokeCanvasMarkdownCapability } from '../markdownCapabilities';

describe('canonical Canvas Markdown capabilities', () => {
  it.each(['canvas.ingestMarkdown', 'canvas.createMarkdownNote'] as const)(
    'routes %s to one Markdown authoring mutation',
    async (capabilityId) => {
      const applyAgentContent = vi.fn(async () => ({
        changed: true,
        mode: 'insert' as const,
        nodeId: 'markdown-1',
        createdNodeIds: ['markdown-1'],
      }));

      const result = await invokeCanvasMarkdownCapability(
        {
          capabilityId,
          markdown: '# Canonical content',
          title: 'Draft',
        },
        { applyAgentContent },
      );

      expect(applyAgentContent).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'text',
          format: 'markdown',
          text: '# Canonical content',
          title: 'Draft',
        }),
      );
      expect(result).toMatchObject({
        capabilityId,
        status: 'created',
        resolvedKind: 'markdown-note',
        nodeIds: ['markdown-1'],
      });
    },
  );

  it.each([
    'canvas.createTableFromMarkdown',
    'canvas.createStoryboardFromMarkdown',
    'canvas.attachResource',
    'canvas.validateMarkdownStoryboard',
  ])('rejects retired capability %s visibly', async (capabilityId) => {
    await expect(
      invokeCanvasMarkdownCapability(
        { capabilityId, markdown: '| old | path |' } as CanvasMarkdownCapabilityInput,
        {
          applyAgentContent: vi.fn(),
        },
      ),
    ).rejects.toThrow('Unknown Canvas Markdown capability');
  });

  it('returns contract diagnostics before attempting a mutation', async () => {
    const applyAgentContent = vi.fn();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createMarkdownNote',
        markdown: 42,
      } as unknown as CanvasMarkdownCapabilityInput,
      { applyAgentContent },
    );

    expect(result.status).toBe('blocked');
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(applyAgentContent).not.toHaveBeenCalled();
  });
});
