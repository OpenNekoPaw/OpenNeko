import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createResourceFingerprint, createResourceRef } from '@neko/shared';
import {
  createCanvasDocumentEntryContentReader,
  readCanvasNativeDocumentEntryPath,
} from './documentEntryReader';

const readEntry = vi.hoisted(() => vi.fn(async () => new Uint8Array([1, 2, 3])));

vi.mock('@neko/content/document/node', () => ({
  createNodeDocumentLowLevelAccess: () => ({ readEntry }),
}));

describe('createCanvasDocumentEntryContentReader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads an authorized source path through the narrow entry reader contract', async () => {
    const reader = createCanvasDocumentEntryContentReader();
    await expect(reader.readEntry('/workspace/book.epub', 'OPS/page-1.jpg')).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(readEntry).toHaveBeenCalledWith('/workspace/book.epub', 'OPS/page-1.jpg');
  });
});

describe('readCanvasNativeDocumentEntryPath', () => {
  it.each(['epub', 'docx', 'cbz'] as const)(
    'selects native %s archive entries for direct reads',
    (format) => {
      expect(readCanvasNativeDocumentEntryPath(createDocumentRef(format))).toBe('OPS/image.png');
    },
  );

  it.each(['pdf', 'pptx', 'xlsx'] as const)(
    'keeps %s raster output on the representation path',
    (format) => {
      expect(readCanvasNativeDocumentEntryPath(createDocumentRef(format))).toBeUndefined();
    },
  );
});

function createDocumentRef(format: 'epub' | 'docx' | 'cbz' | 'pdf' | 'pptx' | 'xlsx') {
  return createResourceRef({
    scope: 'project',
    provider: 'document-archive',
    kind: 'document',
    source: {
      kind: 'document',
      document: { filePath: `/workspace/document.${format}`, format },
    },
    locator: { kind: 'document', entryPath: 'OPS/image.png' },
    fingerprint: createResourceFingerprint({
      strategy: 'provider',
      value: `document-${format}`,
      providerId: 'document-archive',
    }),
  });
}
