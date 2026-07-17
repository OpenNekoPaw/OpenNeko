import { describe, expect, it, vi } from 'vitest';
import { CANVAS_TEXT_DOCUMENT_MAX_BYTES, type CanvasTextDocumentReadRequest } from '@neko/shared';
import { readCanvasTextDocumentProjection } from './textDocumentProjection';

const request: CanvasTextDocumentReadRequest = {
  type: 'textDocument:read',
  requestId: 'read-1',
  nodeId: 'document-1',
  docPath: 'assets/notes.md',
  docType: 'markdown',
};

describe('readCanvasTextDocumentProjection', () => {
  it('returns a correlated strict UTF-8 projection', async () => {
    const readFile = vi.fn(async () => new TextEncoder().encode('# Hello'));
    const result = await readCanvasTextDocumentProjection(request, '/workspace/assets/notes.md', {
      stat: async () => ({ size: 7, isFile: true }),
      readFile,
    });

    expect(result).toEqual({
      type: 'textDocument:readResult',
      requestId: 'read-1',
      nodeId: 'document-1',
      docPath: 'assets/notes.md',
      docType: 'markdown',
      status: 'ready',
      text: '# Hello',
    });
    expect(readFile).toHaveBeenCalledWith('/workspace/assets/notes.md');
  });

  it('reads Fountain through the plain-text profile without Script indexing', async () => {
    const fountainRequest: CanvasTextDocumentReadRequest = {
      ...request,
      requestId: 'read-fountain',
      docPath: 'assets/pilot.fountain',
      docType: 'text',
    };
    const result = await readCanvasTextDocumentProjection(
      fountainRequest,
      '/workspace/assets/pilot.fountain',
      {
        stat: async () => ({ size: 15, isFile: true }),
        readFile: async () => new TextEncoder().encode('INT. ROOM - DAY'),
      },
    );

    expect(result).toMatchObject({ status: 'ready', text: 'INT. ROOM - DAY' });
  });

  it('rejects a format mismatch before reading', async () => {
    const readFile = vi.fn(async () => new Uint8Array());
    const result = await readCanvasTextDocumentProjection(
      { ...request, docPath: 'assets/notes.txt' },
      '/workspace/assets/notes.txt',
      { stat: async () => ({ size: 0, isFile: true }), readFile },
    );

    expect(result).toMatchObject({ status: 'error', code: 'unsupported-type' });
    expect(readFile).not.toHaveBeenCalled();
  });

  it('rejects missing, non-file, and oversized sources without returning empty success', async () => {
    const readFile = vi.fn(async () => new Uint8Array());
    const missing = await readCanvasTextDocumentProjection(request, '/missing.md', {
      stat: async () => {
        throw new Error('missing');
      },
      readFile,
    });
    const directory = await readCanvasTextDocumentProjection(request, '/directory.md', {
      stat: async () => ({ size: 0, isFile: false }),
      readFile,
    });
    const oversized = await readCanvasTextDocumentProjection(request, '/large.md', {
      stat: async () => ({ size: CANVAS_TEXT_DOCUMENT_MAX_BYTES + 1, isFile: true }),
      readFile,
    });

    expect(missing).toMatchObject({ status: 'error', code: 'not-found' });
    expect(directory).toMatchObject({ status: 'error', code: 'not-a-file' });
    expect(oversized).toMatchObject({ status: 'error', code: 'too-large' });
    expect(readFile).not.toHaveBeenCalled();
  });

  it('rejects bytes that grow past the limit and invalid UTF-8', async () => {
    const grew = await readCanvasTextDocumentProjection(request, '/grew.md', {
      stat: async () => ({ size: 10, isFile: true }),
      readFile: async () => new Uint8Array(CANVAS_TEXT_DOCUMENT_MAX_BYTES + 1),
    });
    const invalid = await readCanvasTextDocumentProjection(request, '/invalid.md', {
      stat: async () => ({ size: 2, isFile: true }),
      readFile: async () => new Uint8Array([0xc3, 0x28]),
    });

    expect(grew).toMatchObject({ status: 'error', code: 'too-large' });
    expect(invalid).toMatchObject({ status: 'error', code: 'invalid-utf8' });
  });
});
