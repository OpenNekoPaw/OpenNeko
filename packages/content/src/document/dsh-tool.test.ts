import { describe, expect, it } from 'vitest';

import {
  decodeDocumentDshToolInput,
  DOCUMENT_DSH_TOOL_NAME,
  DOCUMENT_DSH_TOOL_PARAMETERS,
  DOCUMENT_DSH_TOOL_OPERATIONS,
} from './dsh-tool';

const source = { file: { authority: 'workspace' as const, path: 'books/story.epub' } };

describe('OpenNeko document DSH contract', () => {
  it('uses the canonical domain name and operations', () => {
    expect(DOCUMENT_DSH_TOOL_NAME).toBe('openneko.document');
    expect(DOCUMENT_DSH_TOOL_OPERATIONS).toEqual(['read', 'continue', 'read-images']);
    expect(DOCUMENT_DSH_TOOL_PARAMETERS.input.type).toBe('object');
    expect(DOCUMENT_DSH_TOOL_PARAMETERS.input.properties).toHaveProperty('source');
    expect(JSON.stringify(DOCUMENT_DSH_TOOL_PARAMETERS)).toContain('source.file.authority');
    expect(JSON.stringify(DOCUMENT_DSH_TOOL_PARAMETERS)).toContain('neko/assets/<library>');
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
        source: { file: { authority: 'workspace', path: '/tmp/story.epub' } },
      }),
    ).toThrow(/canonical workspace-file ContentLocator/u);
  });
});
