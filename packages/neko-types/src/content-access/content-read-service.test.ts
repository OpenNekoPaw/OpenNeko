import { describe, expect, it, vi } from 'vitest';
import type { ContentBytes, ContentReadOptions, ContentStat } from '../types/content-io';
import type { ContentLocator } from '../types/content-locator';
import {
  ExplicitContentReadService,
  type ContentReadHandler,
  type ContentReadHandlers,
} from './content-read-service';

const locators = [
  { kind: 'workspace-file', path: 'media/image.png' },
  {
    kind: 'document-entry',
    source: { kind: 'workspace-file', path: 'books/comic.epub' },
    entryPath: 'OPS/image.png',
  },
  {
    kind: 'generated-output',
    outputId: 'image-1',
    revision: 'revision-1',
    digest: 'sha256:image-1',
    path: 'neko/generated/image-1.png',
  },
  {
    kind: 'package-resource',
    packageId: 'avatar-1',
    revision: 'revision-1',
    resourcePath: 'model/avatar.model3.json',
  },
] as const satisfies readonly ContentLocator[];

describe('ExplicitContentReadService', () => {
  it('dispatches each locator kind to exactly one owner handler', async () => {
    const calls: string[] = [];
    const service = new ExplicitContentReadService(createHandlers((kind) => calls.push(kind)));

    for (const locator of locators) {
      await expect(service.read(locator, { maxBytes: 16 })).resolves.toMatchObject({
        status: 'ready',
        locator,
      });
    }
    expect(calls).toEqual([
      'workspace-file',
      'document-entry',
      'generated-output',
      'package-resource',
    ]);
  });

  it('does not try another handler when the selected owner fails', async () => {
    const fallback = vi.fn();
    const handlers = createHandlers(fallback);
    handlers.workspaceFile.read = vi.fn(async () => {
      throw new Error('workspace owner failed');
    });
    const service = new ExplicitContentReadService(handlers);

    await expect(service.read(locators[0])).rejects.toThrow('workspace owner failed');
    expect(fallback).not.toHaveBeenCalled();
  });

  it('fails visibly when a handler returns a mismatched locator or range', async () => {
    const handlers = createHandlers(() => undefined);
    handlers.workspaceFile.read = vi.fn(async () => readyBytes(locators[1], 0));
    const service = new ExplicitContentReadService(handlers);
    await expect(service.read(locators[0])).rejects.toMatchObject({
      code: 'invalid-content-handler-result',
    });

    handlers.workspaceFile.read = vi.fn(async () => readyBytes(locators[0], 4));
    await expect(
      service.read(locators[0], { range: { offset: 0, length: 4 } }),
    ).rejects.toMatchObject({ code: 'invalid-content-handler-result' });
  });

  it('enforces maxBytes, cancellation, and fingerprint preconditions centrally', async () => {
    const read = vi.fn(async () => readyBytes(locators[0], 0, 8));
    const handlers = createHandlers(() => undefined);
    handlers.workspaceFile.read = read;
    const service = new ExplicitContentReadService(handlers);

    await expect(service.read(locators[0], { maxBytes: 4 })).resolves.toEqual({
      status: 'unavailable',
      locator: locators[0],
      diagnostic: { code: 'content-too-large' },
    });
    await expect(
      service.read(locators[0], {
        expectedFingerprint: { strategy: 'sha256', value: 'different' },
      }),
    ).resolves.toEqual({
      status: 'unavailable',
      locator: locators[0],
      diagnostic: { code: 'content-changed' },
    });

    const controller = new AbortController();
    controller.abort();
    read.mockClear();
    await expect(service.read(locators[0], { signal: controller.signal })).resolves.toEqual({
      status: 'unavailable',
      locator: locators[0],
      diagnostic: { code: 'content-cancelled' },
    });
    expect(read).not.toHaveBeenCalled();
  });
});

function createHandlers(onRead: (kind: ContentLocator['kind']) => void): ContentReadHandlers {
  return {
    workspaceFile: handlerFor('workspace-file', onRead),
    documentEntry: handlerFor('document-entry', onRead),
    generatedOutput: handlerFor('generated-output', onRead),
    packageResource: handlerFor('package-resource', onRead),
  };
}

function handlerFor<TLocator extends ContentLocator>(
  kind: TLocator['kind'],
  onRead: (kind: ContentLocator['kind']) => void,
): ContentReadHandler<TLocator> {
  return {
    async stat(locator) {
      return readyStat(locator);
    },
    async read(locator, _options: ContentReadOptions) {
      onRead(kind);
      return readyBytes(locator, 0);
    },
  };
}

function readyStat(locator: ContentLocator): ContentStat {
  return {
    status: 'ready',
    locator,
    byteLength: 4,
    fingerprint: fingerprintFor(locator),
  };
}

function readyBytes(locator: ContentLocator, offset: number, length = 4): ContentBytes {
  return {
    status: 'ready',
    locator,
    bytes: new Uint8Array(length),
    offset,
    totalByteLength: offset + length,
    fingerprint: fingerprintFor(locator),
  };
}

function fingerprintFor(locator: ContentLocator) {
  if (locator.kind === 'generated-output') {
    return { strategy: 'sha256' as const, value: locator.digest };
  }
  if (locator.kind === 'package-resource' && locator.digest) {
    return { strategy: 'sha256' as const, value: locator.digest };
  }
  return { strategy: 'sha256' as const, value: 'sha256:content' };
}
