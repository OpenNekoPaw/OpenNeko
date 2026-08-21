import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import { describe, expect, it, vi } from 'vitest';

import { admitAcpPrompt } from './index';

describe('DSH ACP image prompt admission', () => {
  it('does not expose a resource name or URI as model-visible pseudo text', async () => {
    await expect(
      admitAcpPrompt([
        { type: 'text', text: 'Analyze this.' },
        {
          type: 'resource_link',
          name: 'story.epub',
          uri: 'openneko-content:encoded-private-identity',
        },
      ]),
    ).resolves.toEqual([{ type: 'text', text: 'Analyze this.' }]);

    const resourceOnly = await admitAcpPrompt([
      {
        type: 'resource_link',
        name: 'story.epub',
        uri: 'openneko-content:encoded-private-identity',
      },
    ]);
    expect(resourceOnly).toEqual([
      { type: 'text', text: 'Use the user-selected resource context for this request.' },
    ]);
    expect(JSON.stringify(resourceOnly)).not.toContain('story.epub');
    expect(JSON.stringify(resourceOnly)).not.toContain('openneko-content:');
  });

  it('persists ACP image bytes through the native DSH attachment store', async () => {
    const ref: ImageAttachmentRef = {
      attachmentId: 'attachment-1' as ImageAttachmentRef['attachmentId'],
      mediaType: 'image/png',
      bytes: 3,
      width: 1,
      height: 1,
    };
    const saveImages = vi.fn(async () => [ref]);

    await expect(
      admitAcpPrompt(
        [
          { type: 'text', text: 'Describe this.' },
          { type: 'image', data: 'YWJj', mimeType: 'image/png' },
        ],
        { saveImages },
      ),
    ).resolves.toEqual([
      { type: 'text', text: 'Describe this.' },
      { type: 'image', attachment: ref },
    ]);
    expect(saveImages).toHaveBeenCalledWith([
      { data: new Uint8Array([97, 98, 99]), mediaType: 'image/png' },
    ]);
  });

  it('allows an image-only prompt when native attachment storage is available', async () => {
    const ref: ImageAttachmentRef = {
      attachmentId: 'attachment-1' as ImageAttachmentRef['attachmentId'],
      mediaType: 'image/jpeg',
      bytes: 3,
      width: 1,
      height: 1,
    };

    await expect(
      admitAcpPrompt([{ type: 'image', data: 'YWJj', mimeType: 'image/jpeg' }], {
        saveImages: async () => [ref],
      }),
    ).resolves.toEqual([{ type: 'image', attachment: ref }]);
  });

  it('rejects image input when the active profile has no native attachment store', async () => {
    await expect(
      admitAcpPrompt([{ type: 'image', data: 'YWJj', mimeType: 'image/png' }]),
    ).rejects.toThrow(/attachments are unavailable/i);
  });

  it('rejects non-canonical bytes and unsupported image media types before storage', async () => {
    const saveImages = vi.fn();
    await expect(
      admitAcpPrompt([{ type: 'image', data: 'not-base64', mimeType: 'image/png' }], {
        saveImages,
      }),
    ).rejects.toThrow(/canonical base64/i);
    await expect(
      admitAcpPrompt([{ type: 'image', data: 'YWJj', mimeType: 'image/svg+xml' }], {
        saveImages,
      }),
    ).rejects.toThrow(/unsupported image MIME type/i);
    await expect(
      admitAcpPrompt([{ type: 'image', data: 'YR==', mimeType: 'image/png' }], {
        saveImages,
      }),
    ).rejects.toThrow(/canonical base64/i);
    expect(saveImages).not.toHaveBeenCalled();
  });

  it('admits multiple images as one ordered DSH batch before publishing refs', async () => {
    const first = {
      attachmentId: 'attachment-1',
      mediaType: 'image/png',
      bytes: 1,
      width: 1,
      height: 1,
    } as ImageAttachmentRef;
    const second = {
      attachmentId: 'attachment-2',
      mediaType: 'image/jpeg',
      bytes: 1,
      width: 1,
      height: 1,
    } as ImageAttachmentRef;
    const saveImages = vi.fn(async () => [first, second]);

    await expect(
      admitAcpPrompt(
        [
          { type: 'image', data: 'YQ==', mimeType: 'image/png' },
          { type: 'text', text: 'compare' },
          { type: 'image', data: 'Yg==', mimeType: 'image/jpeg' },
        ],
        { saveImages },
      ),
    ).resolves.toEqual([
      { type: 'image', attachment: first },
      { type: 'text', text: 'compare' },
      { type: 'image', attachment: second },
    ]);
    expect(saveImages).toHaveBeenCalledTimes(1);
  });

  it('rejects an oversized image count before persisting any attachment', async () => {
    const saveImages = vi.fn();
    await expect(
      admitAcpPrompt(
        Array.from({ length: 5 }, () => ({
          type: 'image' as const,
          data: 'YQ==',
          mimeType: 'image/png',
        })),
        { saveImages },
      ),
    ).rejects.toThrow(/limit of 4/u);
    expect(saveImages).not.toHaveBeenCalled();
  });
});
