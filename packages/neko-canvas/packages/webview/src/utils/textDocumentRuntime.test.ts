import { describe, expect, it } from 'vitest';
import type { TextDocumentRuntimeProjection } from '../components/nodes/nodeRendererTypes';
import { applyTextDocumentReadResult } from './textDocumentRuntime';

const loading: TextDocumentRuntimeProjection = {
  status: 'loading',
  requestId: 'read-current',
  docPath: 'assets/notes.md',
  docType: 'markdown',
};

describe('applyTextDocumentReadResult', () => {
  it('applies a fully correlated result to the target node', () => {
    const next = applyTextDocumentReadResult(
      { 'document-1': loading },
      {
        type: 'textDocument:readResult',
        requestId: 'read-current',
        nodeId: 'document-1',
        docPath: 'assets/notes.md',
        docType: 'markdown',
        status: 'ready',
        text: '# Notes',
      },
    );

    expect(next['document-1']).toEqual({
      status: 'ready',
      requestId: 'read-current',
      docPath: 'assets/notes.md',
      docType: 'markdown',
      text: '# Notes',
    });
  });

  it('ignores stale request, node, path, and type identities', () => {
    const current = { 'document-1': loading };
    const base = {
      type: 'textDocument:readResult' as const,
      requestId: 'read-current',
      nodeId: 'document-1',
      docPath: 'assets/notes.md',
      docType: 'markdown' as const,
      status: 'ready' as const,
      text: '# Notes',
    };

    expect(applyTextDocumentReadResult(current, { ...base, requestId: 'read-stale' })).toBe(
      current,
    );
    expect(applyTextDocumentReadResult(current, { ...base, nodeId: 'document-2' })).toBe(current);
    expect(applyTextDocumentReadResult(current, { ...base, docPath: 'assets/other.md' })).toBe(
      current,
    );
    expect(
      applyTextDocumentReadResult(current, {
        ...base,
        docPath: 'assets/notes.txt',
        docType: 'text',
      }),
    ).toBe(current);
  });
});
