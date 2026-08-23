import { createNodeArchiveResource } from '@neko/content/document/node';
import { getEpubResourceMediaType } from '@neko/preview-domain';

export interface EpubPreviewResourceTreeEntry {
  readonly virtualPath: string;
  readonly byteLength: number;
  readonly contentType: string;
  read(signal: AbortSignal): Promise<Uint8Array>;
}

export interface EpubPreviewResourceTree {
  readonly entries: readonly EpubPreviewResourceTreeEntry[];
  release(): void;
}

export interface PublishedEpubPreviewResource {
  readonly url: string;
  release(): void;
}

export async function publishEpubPreviewResource(input: {
  readonly absolutePath: string;
  readonly signal?: AbortSignal;
  readonly registerResourceTree: (
    tree: EpubPreviewResourceTree,
  ) => PublishedEpubPreviewResource | Promise<PublishedEpubPreviewResource>;
}): Promise<PublishedEpubPreviewResource> {
  input.signal?.throwIfAborted();
  const archive = await createNodeArchiveResource(input.absolutePath, {
    ...(input.signal ? { signal: input.signal } : {}),
  });
  try {
    if (!archive.entries.some((entry) => entry.path === 'META-INF/container.xml')) {
      throw new Error('EPUB container descriptor is missing.');
    }
    const lease = await input.registerResourceTree({
      entries: archive.entries.map((entry) => ({
        virtualPath: entry.path,
        byteLength: entry.byteLength,
        contentType: getEpubResourceMediaType(entry.path),
        read: (signal) => archive.readEntry(entry.path, signal),
      })),
      release: () => {
        void archive.dispose();
      },
    });
    if (!lease.url.endsWith('/')) {
      lease.release();
      throw new Error('EPUB resource tree URL must end with a slash.');
    }
    if (input.signal?.aborted) {
      lease.release();
      input.signal.throwIfAborted();
    }
    return lease;
  } catch (error) {
    await archive.dispose();
    throw error;
  }
}
