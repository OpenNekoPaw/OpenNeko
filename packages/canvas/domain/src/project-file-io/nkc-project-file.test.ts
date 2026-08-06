import { describe, expect, it, vi } from 'vitest';
import { createEmptyCanvasData } from '../utils/canvasHeadlessAuthoring';
import {
  ProjectFileStore,
  ProjectFormatCodecRegistry,
  type ProjectFormatCodec,
} from '@neko/content/project-file-io';
import { createNkcProjectFormatCodecRegistry } from './nkc-codec';

describe('ProjectFormatCodecRegistry', () => {
  it('registers codecs by format id and extension', () => {
    const registry = new ProjectFormatCodecRegistry();
    registry.register(createJsonCodec('demo', '.ndemo'));

    expect(registry.get('demo')?.formatId).toBe('demo');
    expect(registry.getByExtension('/workspace/file.ndemo')?.formatId).toBe('demo');
  });

  it('rejects duplicate extensions', () => {
    const registry = new ProjectFormatCodecRegistry();
    registry.register(createJsonCodec('left', '.nkt'));

    expect(() => registry.register(createJsonCodec('right', '.nkt'))).toThrow('already registered');
  });
});

describe('NKC-only project file ownership', () => {
  it('registers the NKC project format', () => {
    const registry = createNkcProjectFormatCodecRegistry();

    expect(registry.list().map((codec) => codec.formatId)).toEqual(['nkc']);
    expect(registry.getByExtension('board.nkc')?.formatId).toBe('nkc');
  });

  it('round-trips an NKC document through the shared storage boundary', async () => {
    let stored = new Uint8Array();
    const store = new ProjectFileStore({
      registry: createNkcProjectFormatCodecRegistry(),
      fileOps: {
        readFile: vi.fn(async () => stored),
        writeFile: vi.fn(async (_filePath, content) => {
          stored = Uint8Array.from(content);
        }),
      },
    });
    const document = createEmptyCanvasData('Board');

    await expect(store.save({ filePath: '/workspace/board.nkc', document })).resolves.toMatchObject(
      { ok: true, written: true },
    );
    await expect(store.load({ filePath: '/workspace/board.nkc' })).resolves.toMatchObject({
      ok: true,
      document: { name: 'Board' },
    });
  });
});

function createJsonCodec(formatId: string, extension: string): ProjectFormatCodec<unknown> {
  return {
    formatId,
    fileExtensions: [extension],
    load: (json) => ({ document: JSON.parse(json) as unknown, diagnostics: [] }),
    save: (document) => ({ content: JSON.stringify(document), diagnostics: [] }),
  };
}
