import { beforeEach, describe, expect, it, vi } from 'vitest';

const { stat, withEpubEntryReader, resolvePreviewPath } = vi.hoisted(() => ({
  stat: vi.fn(),
  withEpubEntryReader: vi.fn(),
  resolvePreviewPath: vi.fn(),
}));

vi.mock('vscode', () => {
  class Range {
    constructor(
      readonly startLine: number,
      readonly startCharacter: number,
      readonly endLine: number,
      readonly endCharacter: number,
    ) {}
  }

  class DocumentSymbol {
    readonly children: DocumentSymbol[] = [];

    constructor(
      readonly name: string,
      readonly detail: string,
      readonly kind: number,
      readonly range: Range,
      readonly selectionRange: Range,
    ) {}
  }

  return {
    Range,
    DocumentSymbol,
    SymbolKind: {
      Module: 1,
    },
  };
});

vi.mock('fs/promises', () => ({
  default: { stat },
  stat,
}));

vi.mock('../../providers/document/workspacePathResolver', () => ({
  resolvePreviewPath,
}));

vi.mock('../../providers/document/PreviewFileServer', () => ({
  previewFileServer: { withEpubEntryReader },
}));

import { EpubSymbolProvider } from '../EpubSymbolProvider';

describe('EpubSymbolProvider', () => {
  beforeEach(() => {
    stat.mockReset();
    withEpubEntryReader.mockReset();
    resolvePreviewPath.mockReset();
  });

  it('resolves preview paths before reading document symbols', async () => {
    resolvePreviewPath.mockResolvedValue('/resolved/library/book.epub');
    stat.mockResolvedValue({ mtimeMs: 123 });
    withEpubEntryReader.mockResolvedValue([
      { label: 'Chapter 1', href: 'Text/ch1.xhtml', depth: 0 },
    ]);

    const provider = new EpubSymbolProvider();
    const symbols = await provider.provideDocumentSymbols(
      { uri: { fsPath: '/${A}/library/book.epub' } } as never,
      { isCancellationRequested: false } as never,
    );

    expect(resolvePreviewPath).toHaveBeenCalledWith('/${A}/library/book.epub', {
      sourceDocumentUri: { fsPath: '/${A}/library/book.epub' },
    });
    expect(stat).toHaveBeenCalledWith('/resolved/library/book.epub');
    expect(withEpubEntryReader).toHaveBeenCalledWith(
      '/resolved/library/book.epub',
      expect.any(Function),
      undefined,
    );
    expect(symbols[0]?.name).toBe('Chapter 1');
  });

  it('resolves preview paths before fetching TOC entries', async () => {
    resolvePreviewPath.mockResolvedValue('/resolved/library/book.epub');
    withEpubEntryReader.mockResolvedValue([
      { label: 'Chapter 2', href: 'Text/ch2.xhtml', depth: 0 },
    ]);

    const provider = new EpubSymbolProvider();
    const toc = await provider.getToc('/${A}/library/book.epub');

    expect(resolvePreviewPath).toHaveBeenCalledWith('/${A}/library/book.epub', {
      sourceDocumentUri: undefined,
    });
    expect(withEpubEntryReader).toHaveBeenCalledWith(
      '/resolved/library/book.epub',
      expect.any(Function),
      undefined,
    );
    expect(toc[0]?.label).toBe('Chapter 2');
  });
});
