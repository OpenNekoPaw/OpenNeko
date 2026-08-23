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
        sandboxMode: 'read-only',
        tool: 'openneko.document',
        operation: 'read',
        input: { source, includeImages: false },
      }),
    ).resolves.toEqual({ outcome: 'success', result: { status: 'ready', text: 'story' } });
    expect(resolveDocumentContent).toHaveBeenCalledWith(
      expect.objectContaining({ source, includeImages: false }),
    );
  });

  it('converts a selected ContentLocator to the private reader mode', async () => {
    const resolveDocumentContent = vi.fn(async () => ({
      status: 'ready' as const,
      source: {
        ...source,
        selector: { kind: 'entry' as const, path: 'OPS/chapter.xhtml' },
      },
    }));
    const adapter = new DocumentDshHostAdapter({ resolveDocumentContent });
    const selectedSource = {
      ...source,
      selector: { kind: 'entry' as const, path: 'OPS/chapter.xhtml' },
    };

    await adapter.execute({
      sessionId: 'session:one',
      turn: 1,
      toolCallId: 'call:selected',
      sandboxMode: 'read-only',
      tool: 'openneko.document',
      operation: 'read',
      input: { source: selectedSource, mode: 'content' },
    });

    expect(resolveDocumentContent).toHaveBeenCalledWith(
      expect.objectContaining({ source: selectedSource, mode: 'range' }),
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
        sandboxMode: 'read-only',
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

  it('rejects a non-canonical range before Content access', async () => {
    const resolveDocumentContent = vi.fn();
    const adapter = new DocumentDshHostAdapter({ resolveDocumentContent });
    await expect(
      adapter.execute({
        sessionId: 'session:one',
        turn: 1,
        toolCallId: 'call:range',
        sandboxMode: 'read-only',
        tool: 'openneko.document',
        operation: 'read',
        input: { source, mode: 'range', range: { start: 10, end: 22 } },
      }),
    ).resolves.toMatchObject({
      outcome: 'failure',
      diagnostic: { code: 'DOCUMENT_DSH_TOOL_INVALID_INPUT' },
    });
    expect(resolveDocumentContent).not.toHaveBeenCalled();
  });

  it('projects a failed Content result as an ACP Tool failure', async () => {
    const resolveDocumentContent = vi.fn(async () => ({
      status: 'missing-source' as const,
      diagnostics: [
        {
          code: 'content-missing',
          severity: 'error' as const,
          message: 'Document content is unavailable: content-missing',
        },
      ],
    }));
    const adapter = new DocumentDshHostAdapter({ resolveDocumentContent });

    await expect(
      adapter.execute({
        sessionId: 'session:one',
        turn: 1,
        toolCallId: 'call:missing',
        sandboxMode: 'read-only',
        tool: 'openneko.document',
        operation: 'read-images',
        input: { source },
      }),
    ).resolves.toEqual({
      outcome: 'failure',
      diagnostic: {
        code: 'content-missing',
        message: 'Document content is unavailable: content-missing',
      },
    });
  });
});
