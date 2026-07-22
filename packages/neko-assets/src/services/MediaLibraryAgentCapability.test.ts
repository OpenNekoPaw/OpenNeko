import { describe, expect, it, vi } from 'vitest';
import { createMediaLibraryAgentCapabilityRuntime } from './MediaLibraryAgentCapability';

describe('createMediaLibraryAgentCapabilityRuntime', () => {
  it('exposes canonical Media Library search without Asset or physical-path fields', async () => {
    const search = vi.fn(async () => [
      {
        locator: {
          kind: 'workspace-file' as const,
          path: 'neko/assets/Books/epub/book.epub',
        },
        filePath: 'neko/assets/Books/epub/book.epub',
        fileName: 'book.epub',
        libraryName: 'Books',
        mediaType: 'document' as const,
      },
    ]);
    const capability = createMediaLibraryAgentCapabilityRuntime({
      searchService: { search },
      projectRoot: '/private/workspace',
    });
    const tool = capability.provider.getTools({} as never)[0]!;

    const result = await tool.execute({
      query: 'book',
      partitions: ['media-library'],
    });

    expect(result.success).toBe(true);
    expect(search).toHaveBeenCalledWith('book', { limit: 20 });
    expect(JSON.stringify(result)).toContain('neko/assets/Books/epub/book.epub');
    expect(JSON.stringify(result)).not.toContain('/private/workspace');
    expect(JSON.stringify(result)).not.toContain('asset-library');
    expect(JSON.stringify(result)).not.toContain('assetId');
    expect(JSON.stringify(result)).not.toContain('cache');
    capability.dispose();
  });
});
