import { describe, expect, it, vi } from 'vitest';
import type { ContentReadService } from '@neko/content';

import { createDesktopDshPromptImageAdmission } from './desktop-dsh-prompt-image-admission';

const conversationId = '00000000-01ARZ3NDEKTSV4RRFFQ69G5FAV';
const imageLocator = {
  file: { authority: 'workspace' as const, path: 'images/board.png' },
};
const fingerprint = { strategy: 'sha256' as const, value: 'sha256:image' };

describe('Desktop DSH Prompt image admission', () => {
  it('authorizes the exact Conversation Workspace and admits bounded image bytes', async () => {
    const stat = vi.fn(async () => ({
      status: 'ready' as const,
      locator: imageLocator,
      byteLength: 3,
      mimeType: 'image/png',
      fingerprint,
    }));
    const read = vi.fn(async () => ({
      status: 'ready' as const,
      locator: imageLocator,
      bytes: new Uint8Array([1, 2, 3]),
      offset: 0,
      totalByteLength: 3,
      mimeType: 'image/png',
      fingerprint,
    }));
    const restore = vi.fn(async () => ({
      workspace: {
        workspaceId: 'workspace-1',
        workspacePath: '/workspace/one',
      },
    }));
    const normalizeImage = vi.fn(async (bytes: Uint8Array, mimeType: string) => ({
      bytes,
      mimeType,
    }));
    const admission = createAdmission({ stat, read, restore, normalizeImage });

    await expect(
      admission.admit({
        conversationId,
        windowId: 'window-1',
        references: [{ label: 'board.png', contentLocator: imageLocator }],
        modelSupportsImageInput: true,
      }),
    ).resolves.toEqual([{ referenceIndex: 0, data: 'AQID', mimeType: 'image/png' }]);
    expect(restore).toHaveBeenCalledWith('window-1', 'grant-1', 'workspace-1');
    expect(read).toHaveBeenCalledWith(imageLocator, { maxBytes: 20 * 1024 * 1024 });
  });

  it('rejects image input before reading bytes when the exact model lacks the modality', async () => {
    const stat = vi.fn(async () => ({
      status: 'ready' as const,
      locator: imageLocator,
      byteLength: 3,
      mimeType: 'image/png',
      fingerprint,
    }));
    const read = vi.fn();
    const admission = createAdmission({ stat, read });

    await expect(
      admission.admit({
        conversationId,
        windowId: 'window-1',
        references: [{ label: 'board.png', contentLocator: imageLocator }],
        modelSupportsImageInput: false,
      }),
    ).rejects.toThrow(/does not support image input/u);
    expect(read).not.toHaveBeenCalled();
  });

  it('keeps an authorized non-image reference as a resource without reading its bytes', async () => {
    const documentLocator = {
      file: { authority: 'workspace' as const, path: 'docs/notes.pdf' },
    };
    const stat = vi.fn(async () => ({
      status: 'ready' as const,
      locator: documentLocator,
      byteLength: 100,
      mimeType: 'application/pdf',
      fingerprint,
    }));
    const read = vi.fn();
    const admission = createAdmission({ stat, read });

    await expect(
      admission.admit({
        conversationId,
        windowId: 'window-1',
        references: [{ label: 'notes.pdf', contentLocator: documentLocator }],
        modelSupportsImageInput: false,
      }),
    ).resolves.toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });

  it('rejects one unavailable image locally without publishing a partial batch', async () => {
    const stat = vi.fn(async () => ({
      status: 'ready' as const,
      locator: imageLocator,
      byteLength: 3,
      mimeType: 'image/png',
      fingerprint,
    }));
    const read = vi.fn(async () => ({
      status: 'unavailable' as const,
      locator: imageLocator,
      diagnostic: { code: 'content-missing' as const },
    }));
    const normalizeImage = vi.fn();
    const admission = createAdmission({ stat, read, normalizeImage });

    await expect(
      admission.admit({
        conversationId,
        windowId: 'window-1',
        references: [{ label: 'board.png', contentLocator: imageLocator }],
        modelSupportsImageInput: true,
      }),
    ).rejects.toThrow(/content-missing/u);
    expect(normalizeImage).not.toHaveBeenCalled();
  });
});

function createAdmission(overrides: {
  readonly stat: ContentReadService['stat'];
  readonly read: ContentReadService['read'];
  readonly restore?: (
    windowId: string,
    workspaceGrantId: string,
    workspaceId: string,
  ) => Promise<{
    readonly workspace: { readonly workspaceId: string; readonly workspacePath: string };
  }>;
  readonly normalizeImage?: (
    bytes: Uint8Array,
    mimeType: string,
  ) => Promise<{ readonly bytes: Uint8Array; readonly mimeType: string }>;
}) {
  return createDesktopDshPromptImageAdmission({
    contexts: {
      readContext: vi.fn(async () => ({
        kind: 'workspace' as const,
        workspaceId: 'workspace-1',
        workspaceGrantId: 'grant-1',
      })),
    },
    workspaceGrants: {
      restore:
        overrides.restore ??
        vi.fn(async () => ({
          workspace: { workspaceId: 'workspace-1', workspacePath: '/workspace/one' },
        })),
    },
    createContentRead: () => ({ stat: overrides.stat, read: overrides.read }),
    ...(overrides.normalizeImage === undefined ? {} : { normalizeImage: overrides.normalizeImage }),
  });
}
