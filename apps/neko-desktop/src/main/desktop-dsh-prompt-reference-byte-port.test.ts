import type { ContentLocator, ContentReadService } from '@neko/content-domain';
import { describe, expect, it, vi } from 'vitest';

import { createDesktopDshPromptReferenceBytePort } from './desktop-dsh-prompt-reference-byte-port';

const conversationId = '00000000-01ARZ3NDEKTSV4RRFFQ69G5FAV';
const imageLocator = {
  file: { authority: 'workspace' as const, path: 'images/board.png' },
};
const fingerprint = { strategy: 'sha256' as const, value: 'sha256:image' };

describe('Desktop DSH Prompt reference byte port', () => {
  it('authorizes the exact Conversation Workspace before stat and bounded read', async () => {
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
      workspace: { workspaceId: 'workspace-1', workspacePath: '/workspace/one' },
    }));
    const port = createPort({ stat, read, restore }).authorize({
      conversationId,
      windowId: 'window-1',
    });
    const reference = { label: 'board.png', contentLocator: imageLocator };

    await expect(port.stat(reference)).resolves.toEqual({ mimeType: 'image/png' });
    await expect(port.read(reference, { maxBytes: 1024 })).resolves.toEqual({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png',
    });
    expect(restore).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledWith('window-1', 'grant-1', 'workspace-1');
    expect(read).toHaveBeenCalledWith(imageLocator, { maxBytes: 1024 });
  });

  it('rejects a locator outside the authorized Workspace file boundary', async () => {
    const stat = vi.fn();
    const read = vi.fn();
    const restore = vi.fn();
    const port = createPort({ stat, read, restore }).authorize({
      conversationId,
      windowId: 'window-1',
    });

    await expect(
      port.stat({
        label: 'remote.png',
        contentLocator: {
          file: { authority: 'package' },
        } as unknown as ContentLocator,
      }),
    ).rejects.toThrow(/not an authorized Workspace file/u);
    expect(restore).not.toHaveBeenCalled();
    expect(stat).not.toHaveBeenCalled();
  });

  it('fails locally when the authorized content is unavailable', async () => {
    const stat = vi.fn(async () => ({
      status: 'unavailable' as const,
      locator: imageLocator,
      diagnostic: { code: 'content-missing' as const },
    }));
    const read = vi.fn();
    const port = createPort({ stat, read }).authorize({
      conversationId,
      windowId: 'window-1',
    });

    await expect(port.stat({ label: 'board.png', contentLocator: imageLocator })).rejects.toThrow(
      /content-missing/u,
    );
    expect(read).not.toHaveBeenCalled();
  });
});

function createPort(overrides: {
  readonly stat: ContentReadService['stat'];
  readonly read: ContentReadService['read'];
  readonly restore?: (
    windowId: string,
    workspaceGrantId: string,
    workspaceId: string,
  ) => Promise<{
    readonly workspace: { readonly workspaceId: string; readonly workspacePath: string };
  }>;
}) {
  return createDesktopDshPromptReferenceBytePort({
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
  });
}
