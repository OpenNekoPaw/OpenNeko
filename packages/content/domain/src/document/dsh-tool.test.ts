import { describe, expect, it } from 'vitest';

import {
  decodeDocumentDshToolArgs,
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
    expect(DOCUMENT_DSH_TOOL_PARAMETERS).toHaveProperty('source');
    expect(DOCUMENT_DSH_TOOL_PARAMETERS).not.toHaveProperty('input');
    expect(JSON.stringify(DOCUMENT_DSH_TOOL_PARAMETERS)).toContain('source.file.authority');
    expect(JSON.stringify(DOCUMENT_DSH_TOOL_PARAMETERS)).toContain('neko/assets/<library>');
  });

  it('decodes a canonical read request and rejects legacy/raw shapes', () => {
    expect(
      decodeDocumentDshToolArgs({
        operation: 'read',
        source,
        mode: 'manifest',
        includeManifest: true,
        maxChars: 1000,
      }),
    ).toEqual({
      operation: 'read',
      input: { source, mode: 'manifest', includeManifest: true, maxChars: 1000 },
    });
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
    expect(() =>
      decodeDocumentDshToolArgs({ operation: 'read', source, input: { mode: 'manifest' } }),
    ).toThrow(/arguments\.input is not supported/u);
    expect(() => decodeDocumentDshToolArgs({ operation: 'read', input: { source } })).toThrow(
      /arguments\.input is not supported/u,
    );
  });

  it('publishes and decodes exact ContentLocator document selections', () => {
    expect(DOCUMENT_DSH_TOOL_PARAMETERS).not.toHaveProperty('range');
    expect(JSON.stringify(DOCUMENT_DSH_TOOL_PARAMETERS.source)).toContain('selector');
    expect(JSON.stringify(DOCUMENT_DSH_TOOL_PARAMETERS)).not.toMatch(
      /fingerprint|DocumentLocator|DocumentReadCoordinate|DocumentRange/iu,
    );
    const selectedSource = {
      ...source,
      selector: { kind: 'entry' as const, path: 'OPS/chapter.xhtml' },
    };
    expect(
      decodeDocumentDshToolInput('read', {
        source: selectedSource,
        mode: 'content',
        maxChars: 4_000,
      }),
    ).toEqual({
      operation: 'read',
      input: {
        source: selectedSource,
        mode: 'content',
        maxChars: 4_000,
      },
    });
    expect(() =>
      decodeDocumentDshToolInput('read', { source: selectedSource, mode: 'manifest' }),
    ).toThrow(/mode manifest cannot be used/u);
    expect(() =>
      decodeDocumentDshToolInput('read', { source: selectedSource, mode: 'range' }),
    ).toThrow(/mode must be content or manifest/u);
    expect(() =>
      decodeDocumentDshToolInput('read', {
        source: {
          file: { authority: 'workspace', path: 'books/story.pdf' },
          selector: selectedSource.selector,
        },
      }),
    ).toThrow(/PDF document selection requires page/u);
  });

  it('rejects the replaced parallel range before document access', () => {
    expect(() =>
      decodeDocumentDshToolInput('read', {
        source,
        mode: 'range',
        range: { start: 10, end: 22 },
      }),
    ).toThrow(/input contains unsupported fields/u);
  });

  it('rejects reader-private strategy at the top level', () => {
    expect(() =>
      decodeDocumentDshToolInput('read', {
        source,
        mode: 'manifest',
        strategy: 'manifest-order',
      }),
    ).toThrow(/input contains unsupported fields/u);
    expect(JSON.stringify(DOCUMENT_DSH_TOOL_PARAMETERS.operation)).toContain(
      'Never add strategy at the top level',
    );
  });

  it.each([
    ['books/story.epub', { kind: 'entry', path: 'OPS/chapter.xhtml' }],
    ['comics/story.cbz', { kind: 'entry', path: 'images/page-01.jpg' }],
    ['books/story.pdf', { kind: 'page', pageNumber: 2, pageIndex: 1 }],
    ['notes/story.docx', { kind: 'text-range', paragraphIndex: 3 }],
  ] as const)('accepts the canonical %s selector', (path, selector) => {
    const selectedSource = { file: { authority: 'workspace' as const, path }, selector };
    expect(decodeDocumentDshToolInput('read', { source: selectedSource })).toEqual({
      operation: 'read',
      input: { source: selectedSource },
    });
  });

  it('requires a cursor for continuation and a canonical source for images', () => {
    expect(() => decodeDocumentDshToolInput('continue', { source })).toThrow(/cursor/u);
    const cursor = {
      source,
      strategy: 'manifest-order' as const,
      next: {
        ...source,
        selector: { kind: 'entry' as const, path: 'OPS/chapter-2.xhtml' },
      },
      batchIndex: 1,
      done: false,
      maxChars: 4_000,
    };
    expect(decodeDocumentDshToolInput('continue', { source, cursor })).toEqual({
      operation: 'continue',
      input: { source, cursor },
    });
    expect(() =>
      decodeDocumentDshToolInput('continue', {
        source,
        cursor: { ...cursor, source: { ...source, selector: cursor.next.selector } },
      }),
    ).toThrow(/must match input\.source exactly/u);
    expect(() =>
      decodeDocumentDshToolInput('continue', {
        source,
        cursor: { ...cursor, next: undefined, done: true, fileId: 'internal-fingerprint' },
      }),
    ).toThrow(/unsupported fields/u);
    expect(() =>
      decodeDocumentDshToolInput('read-images', {
        source: { file: { authority: 'workspace', path: '/tmp/story.epub' } },
      }),
    ).toThrow(/canonical workspace-file ContentLocator/u);
    const selected = {
      ...source,
      selector: { kind: 'entry' as const, path: 'OPS/chapter.xhtml' },
    };
    expect(decodeDocumentDshToolInput('read', { source: selected })).toEqual({
      operation: 'read',
      input: { source: selected },
    });
  });
});
