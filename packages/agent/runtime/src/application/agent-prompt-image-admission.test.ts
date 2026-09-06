import { describe, expect, it, vi } from 'vitest';

import {
  createAgentPromptImageAdmissionService,
  type AgentPromptReferenceBytePort,
} from './agent-prompt-image-admission';

const imageLocator = {
  file: { authority: 'workspace' as const, path: 'images/board.png' },
};

describe('Agent Prompt image admission', () => {
  it('preserves large inline sources and more than four images for DSH', async () => {
    const data = Buffer.alloc(21 * 1024 * 1024, 97).toString('base64');
    const normalizeImage = vi.fn(async (bytes: Uint8Array, mimeType: string) => ({
      bytes,
      mimeType,
    }));
    const images = Array.from({ length: 8 }, (_, index) => ({
      name: `image-${index}.png`,
      mimeType: 'image/png',
      data: index === 0 ? data : 'AQID',
    }));
    const result = await createAdmission({ stat: vi.fn(), read: vi.fn(), normalizeImage }).admit({
      references: [],
      images,
      modelSupportsImageInput: true,
      referenceBytes: { stat: vi.fn(), read: vi.fn() },
    });
    expect(result).toHaveLength(8);
    expect(result.map((image) => image.data)).toEqual(images.map((image) => image.data));
    expect(normalizeImage).toHaveBeenCalledTimes(8);
  });

  it('reads reference image bytes using the exact authorized resource size', async () => {
    const stat = vi.fn(async () => ({ mimeType: 'image/png', byteLength: 3 }));
    const read = vi.fn(async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png',
    }));
    const normalizeImage = vi.fn(async (bytes: Uint8Array, mimeType: string) => ({
      bytes,
      mimeType,
    }));
    const admission = createAdmission({ stat, read, normalizeImage });

    await expect(
      admission.admit({
        references: [{ label: 'board.png', contentLocator: imageLocator }],
        images: [],
        modelSupportsImageInput: true,
        referenceBytes: { stat, read },
      }),
    ).resolves.toEqual([
      {
        source: { kind: 'reference', referenceIndex: 0 },
        data: 'AQID',
        mimeType: 'image/png',
      },
    ]);
    expect(read).toHaveBeenCalledWith(
      { label: 'board.png', contentLocator: imageLocator },
      { maxBytes: 3 },
    );
  });

  it('rejects changed reference size before normalizing or publishing the image', async () => {
    const stat = vi.fn(async () => ({ mimeType: 'image/png', byteLength: 4 }));
    const read = vi.fn(async () => ({ bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' }));
    const normalizeImage = vi.fn();
    await expect(
      createAdmission({ stat, read, normalizeImage }).admit({
        references: [{ label: 'board.png', contentLocator: imageLocator }],
        images: [],
        modelSupportsImageInput: true,
        referenceBytes: { stat, read },
      }),
    ).rejects.toThrow(/changed size/u);
    expect(normalizeImage).not.toHaveBeenCalled();
  });

  it('rejects before reading bytes when the exact model lacks image input', async () => {
    const stat = vi.fn(async () => ({ mimeType: 'image/png', byteLength: 3 }));
    const read = vi.fn();
    const admission = createAdmission({ stat, read });

    await expect(
      admission.admit({
        references: [{ label: 'board.png', contentLocator: imageLocator }],
        images: [],
        modelSupportsImageInput: false,
        referenceBytes: { stat, read },
      }),
    ).rejects.toThrow(
      'The selected Agent model does not support image input. Select an image-capable Agent model and retry.',
    );
    expect(read).not.toHaveBeenCalled();
  });

  it('admits a canonical pasted image without reading reference bytes', async () => {
    const stat = vi.fn();
    const read = vi.fn();
    const normalizeImage = vi.fn(async (bytes: Uint8Array, mimeType: string) => ({
      bytes,
      mimeType,
    }));
    const admission = createAdmission({ stat, read, normalizeImage });

    await expect(
      admission.admit({
        references: [],
        images: [{ name: 'clipboard.png', mimeType: 'image/png', data: 'AQID' }],
        modelSupportsImageInput: true,
        referenceBytes: { stat, read },
      }),
    ).resolves.toEqual([
      {
        source: { kind: 'inline', imageIndex: 0, name: 'clipboard.png' },
        data: 'AQID',
        mimeType: 'image/png',
      },
    ]);
    expect(Array.from(normalizeImage.mock.calls[0]?.[0] ?? [])).toEqual([1, 2, 3]);
    expect(stat).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it('rejects malformed pasted bytes before normalization', async () => {
    const stat = vi.fn();
    const read = vi.fn();
    const normalizeImage = vi.fn();
    const admission = createAdmission({ stat, read, normalizeImage });

    await expect(
      admission.admit({
        references: [],
        images: [{ name: 'clipboard.png', mimeType: 'image/png', data: 'YR==' }],
        modelSupportsImageInput: true,
        referenceBytes: { stat, read },
      }),
    ).rejects.toThrow(/canonical base64/u);
    expect(normalizeImage).not.toHaveBeenCalled();
  });

  it('keeps a non-image reference out of the provider image batch', async () => {
    const stat = vi.fn(async () => ({ mimeType: 'application/pdf', byteLength: 3 }));
    const read = vi.fn();
    const admission = createAdmission({ stat, read });

    await expect(
      admission.admit({
        references: [{ label: 'notes.pdf', contentLocator: imageLocator }],
        images: [],
        modelSupportsImageInput: false,
        referenceBytes: { stat, read },
      }),
    ).resolves.toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });

  it('rejects a failed authorized read without publishing a partial batch', async () => {
    const stat = vi.fn(async () => ({ mimeType: 'image/png', byteLength: 3 }));
    const read = vi.fn(async () => {
      throw new Error('content-missing');
    });
    const normalizeImage = vi.fn();
    const admission = createAdmission({ stat, read, normalizeImage });

    await expect(
      admission.admit({
        references: [{ label: 'board.png', contentLocator: imageLocator }],
        images: [],
        modelSupportsImageInput: true,
        referenceBytes: { stat, read },
      }),
    ).rejects.toThrow(/content-missing/u);
    expect(normalizeImage).not.toHaveBeenCalled();
  });
});

function createAdmission(overrides: {
  readonly stat: AgentPromptReferenceBytePort['stat'];
  readonly read: AgentPromptReferenceBytePort['read'];
  readonly normalizeImage?: (
    bytes: Uint8Array,
    mimeType: string,
  ) => Promise<{ readonly bytes: Uint8Array; readonly mimeType: string }>;
}) {
  return createAgentPromptImageAdmissionService(
    overrides.normalizeImage === undefined
      ? undefined
      : { normalizeImage: overrides.normalizeImage },
  );
}
