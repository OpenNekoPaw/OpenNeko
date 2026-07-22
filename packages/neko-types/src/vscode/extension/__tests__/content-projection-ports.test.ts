import { describe, expect, it, vi } from 'vitest';
import type { ContentReadService } from '../../../types';
import {
  HostEngineContentProjectionPort,
  HostProcessorContentProjectionPort,
  HostWebviewContentProjectionPort,
} from '../content-projection-ports';

const locator = {
  kind: 'workspace-file' as const,
  path: 'neko/assets/Books/book.epub',
  fingerprint: { strategy: 'sha256' as const, value: 'sha256:book' },
};

describe('capability-scoped Host content projection ports', () => {
  it('returns one opaque consumer projection after the narrow read precondition', async () => {
    const stat = vi.fn().mockResolvedValue({
      status: 'ready',
      locator,
      byteLength: 4,
      fingerprint: locator.fingerprint,
    });
    const contentRead = { stat, read: vi.fn() } satisfies ContentReadService;

    await expect(
      new HostWebviewContentProjectionPort({
        contentRead,
        resolver: { resolve: vi.fn().mockResolvedValue('vscode-webview://content/book') },
      }).project(locator, { expectedFingerprint: locator.fingerprint }),
    ).resolves.toEqual({
      status: 'ready',
      kind: 'webview',
      locator,
      uri: 'vscode-webview://content/book',
    });
    await expect(
      new HostEngineContentProjectionPort({
        contentRead,
        resolver: { resolve: vi.fn().mockResolvedValue('engine-source:book') },
      }).project(locator),
    ).resolves.toEqual({
      status: 'ready',
      kind: 'engine',
      locator,
      token: 'engine-source:book',
    });
    await expect(
      new HostProcessorContentProjectionPort({
        contentRead,
        resolver: { resolve: vi.fn().mockResolvedValue('processor-handle:book') },
      }).project(locator),
    ).resolves.toEqual({
      status: 'ready',
      kind: 'processor',
      locator,
      handle: 'processor-handle:book',
    });
    expect(stat).toHaveBeenCalledWith(locator, {
      expectedFingerprint: locator.fingerprint,
    });
  });

  it('does not invoke a resolver when source authorization fails', async () => {
    const resolve = vi.fn();
    const contentRead = {
      stat: vi.fn().mockResolvedValue({
        status: 'unavailable',
        locator,
        diagnostic: { code: 'content-unauthorized' },
      }),
      read: vi.fn(),
    } satisfies ContentReadService;

    await expect(
      new HostEngineContentProjectionPort({ contentRead, resolver: { resolve } }).project(locator),
    ).resolves.toEqual({
      status: 'unavailable',
      locator,
      diagnostic: { code: 'content-unauthorized' },
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('sanitizes resolver failures and rejects physical or derived-storage paths', async () => {
    const contentRead = readyContentRead();
    const failing = new HostProcessorContentProjectionPort({
      contentRead,
      resolver: {
        resolve: vi.fn().mockRejectedValue(new Error('/Users/private/source.epub ENOENT')),
      },
    });
    await expect(failing.project(locator)).resolves.toEqual({
      status: 'unavailable',
      locator,
      diagnostic: { code: 'content-projection-failed' },
    });

    for (const leaked of [
      '/Users/private/source.epub',
      'file:///Users/private/source.epub',
      'opaque:/.neko/.cache/resources/source.epub',
    ]) {
      const port = new HostWebviewContentProjectionPort({
        contentRead,
        resolver: { resolve: vi.fn().mockResolvedValue(leaked) },
      });
      await expect(port.project(locator)).resolves.toMatchObject({
        status: 'unavailable',
        diagnostic: { code: 'content-projection-failed' },
      });
    }
  });

  it('fails visibly for old target selection and returns cancellation without projection', async () => {
    const resolve = vi.fn();
    const port = new HostWebviewContentProjectionPort({
      contentRead: readyContentRead(),
      resolver: { resolve },
    });
    await expect(port.project(locator, { target: 'local-path' } as never)).rejects.toThrow(
      'Content projection options are invalid.',
    );
    const controller = new AbortController();
    controller.abort();
    await expect(port.project(locator, { signal: controller.signal })).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'content-cancelled' },
    });
    expect(resolve).not.toHaveBeenCalled();
  });
});

function readyContentRead(): ContentReadService {
  return {
    stat: vi.fn().mockResolvedValue({
      status: 'ready',
      locator,
      byteLength: 4,
      fingerprint: locator.fingerprint,
    }),
    read: vi.fn(),
  };
}
