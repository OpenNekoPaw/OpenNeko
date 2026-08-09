import { describe, expect, it, vi } from 'vitest';
import type { AuthorizedWorkspaceWriter } from '../../contracts';
import {
  CreativeDocumentContractError,
  CreativeDocumentCreationService,
  parseCreativeDocumentCreateRequest,
} from '../creative-document-creation';

describe('CreativeDocumentCreationService', () => {
  it('uses the exact owner and publishes only after owner validation', async () => {
    const writer = createWriter();
    const canvas = {
      extension: '.nkc' as const,
      createBytes: vi.fn(() => new TextEncoder().encode('{"canvas":true}')),
      validateBytes: vi.fn(() => true),
    };
    const cut = {
      extension: '.otio' as const,
      createBytes: vi.fn(() => new Uint8Array()),
      validateBytes: vi.fn(() => true),
    };
    const service = new CreativeDocumentCreationService({ writer, owners: { canvas, cut } });

    await expect(
      service.create({ kind: 'canvas', targetDirectory: 'boards', name: 'Storyboard' }),
    ).resolves.toEqual({ status: 'created', kind: 'canvas', path: 'boards/Storyboard.nkc' });
    expect(canvas.createBytes).toHaveBeenCalledWith('Storyboard');
    expect(cut.createBytes).not.toHaveBeenCalled();
    expect(writer.write).toHaveBeenCalledWith(
      { kind: 'workspace-file', path: 'boards/Storyboard.nkc' },
      new TextEncoder().encode('{"canvas":true}'),
      { conflict: 'fail-if-exists' },
    );
  });

  it('rejects a mismatched extension before owner publication', async () => {
    const writer = createWriter();
    const service = new CreativeDocumentCreationService({
      writer,
      owners: {
        canvas: {
          extension: '.nkc',
          createBytes: () => new Uint8Array(),
          validateBytes: () => true,
        },
        cut: {
          extension: '.otio',
          createBytes: () => new Uint8Array(),
          validateBytes: () => true,
        },
      },
    });

    await expect(
      service.create({ kind: 'cut', targetDirectory: '', name: 'Story.nkc' }),
    ).rejects.toThrow('must use .otio');
    expect(writer.write).not.toHaveBeenCalled();
  });

  it.each([
    { kind: 'canvas', targetDirectory: '../outside', name: 'Board' },
    { kind: 'unknown', targetDirectory: '', name: 'Board' },
    { kind: 'cut', targetDirectory: '', name: '../Story' },
    { kind: 'cut', targetDirectory: '', name: 'Story', extra: true },
  ])('rejects a non-canonical request %#', (request) => {
    expect(() => parseCreativeDocumentCreateRequest(request)).toThrow(
      CreativeDocumentContractError,
    );
  });

  it('rejects invalid owner output without publishing any bytes', async () => {
    const writer = createWriter();
    const service = new CreativeDocumentCreationService({
      writer,
      owners: {
        canvas: {
          extension: '.nkc',
          createBytes: () => new Uint8Array([1]),
          validateBytes: () => false,
        },
        cut: {
          extension: '.otio',
          createBytes: () => new Uint8Array(),
          validateBytes: () => true,
        },
      },
    });

    await expect(
      service.create({ kind: 'canvas', targetDirectory: '', name: 'Board' }),
    ).rejects.toThrow('owner produced invalid bytes');
    expect(writer.write).not.toHaveBeenCalled();
  });
});

function createWriter(): AuthorizedWorkspaceWriter & { readonly write: ReturnType<typeof vi.fn> } {
  const write = vi.fn<AuthorizedWorkspaceWriter['write']>(async (locator, bytes) => ({
    status: 'written',
    locator,
    byteLength: bytes.byteLength,
  }));
  return { write };
}
