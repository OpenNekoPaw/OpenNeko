import { describe, expect, it, vi } from 'vitest';

import { DocumentDshHostAdapter } from './document-host-adapter';

const source = { file: { authority: 'workspace' as const, path: 'books/story.epub' } };

describe('Document DSH Host adapter', () => {
  it('delegates the canonical read operation to Content access', async () => {
    const resolveDocumentContent = vi.fn(async () => ({ status: 'ready' as const, text: 'story' }));
    const adapter = new DocumentDshHostAdapter({ resolveDocumentContent });

    await expect(
      adapter.execute({
        sessionId: 'session:one',
        turn: 1,
        toolCallId: 'call:one',
        tool: 'openneko.document',
        operation: 'read',
        input: { source, includeImages: false },
      }),
    ).resolves.toEqual({ outcome: 'success', result: { status: 'ready', text: 'story' } });
    expect(resolveDocumentContent).toHaveBeenCalledWith(
      expect.objectContaining({ source, includeImages: false }),
    );
  });

  it('rejects the retired tool name before Content access', async () => {
    const resolveDocumentContent = vi.fn();
    const adapter = new DocumentDshHostAdapter({ resolveDocumentContent });
    await expect(
      adapter.execute({
        sessionId: 'session:one',
        turn: 1,
        toolCallId: 'call:one',
        tool: 'ReadDocument',
        operation: 'read',
        input: { source },
      }),
    ).resolves.toMatchObject({
      outcome: 'failure',
      diagnostic: { code: 'DOCUMENT_DSH_TOOL_MISMATCH' },
    });
    expect(resolveDocumentContent).not.toHaveBeenCalled();
  });
});
