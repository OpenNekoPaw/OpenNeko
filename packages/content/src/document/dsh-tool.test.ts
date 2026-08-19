import { describe, expect, it } from 'vitest';

import {
  decodeDocumentDshToolInput,
  DOCUMENT_DSH_TOOL_NAME,
  DOCUMENT_DSH_TOOL_OPERATIONS,
} from './dsh-tool';

const source = { kind: 'workspace-file' as const, path: 'books/story.epub' };

describe('OpenNeko document DSH contract', () => {
  it('uses the canonical domain name and operations', () => {
    expect(DOCUMENT_DSH_TOOL_NAME).toBe('openneko.document');
    expect(DOCUMENT_DSH_TOOL_OPERATIONS).toEqual(['read', 'continue', 'read-images']);
  });

  it('decodes a canonical read request and rejects legacy/raw shapes', () => {
    expect(decodeDocumentDshToolInput('read', { source, maxChars: 1000 })).toEqual({
      operation: 'read',
      input: { source, maxChars: 1000 },
    });
    expect(() => decodeDocumentDshToolInput('read_document', { source })).toThrow(
      /operation must be one of/u,
    );
    expect(() => decodeDocumentDshToolInput('read', { path: 'books/story.epub' })).toThrow(
      /input contains unsupported fields/u,
    );
  });

  it('requires a cursor for continuation and a canonical source for images', () => {
    expect(() => decodeDocumentDshToolInput('continue', { source })).toThrow(/cursor/u);
    expect(() =>
      decodeDocumentDshToolInput('read-images', {
        source: { kind: 'workspace-file', path: '/tmp/story.epub' },
      }),
    ).toThrow(/canonical workspace-file ContentLocator/u);
  });
});
