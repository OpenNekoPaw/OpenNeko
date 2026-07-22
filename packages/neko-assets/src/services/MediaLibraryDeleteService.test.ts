import { describe, expect, it, vi } from 'vitest';
import type { AuthorizedWorkspaceDeleter } from '@neko/shared';
import { MediaLibraryDeleteService } from './MediaLibraryDeleteService';

const locator = {
  kind: 'workspace-file' as const,
  path: 'neko/assets/Books/book.epub',
};
const expectedFingerprint = { strategy: 'mtime-size' as const, value: '1:4' };

describe('MediaLibraryDeleteService', () => {
  it('delegates explicit deletion inside the selected available linked root', async () => {
    const deleteFile = vi.fn(async () => ({ status: 'deleted' as const, locator }));
    const service = createService(deleteFile);

    await expect(
      service.delete({ libraryName: 'Books', locator, expectedFingerprint }),
    ).resolves.toEqual({ status: 'deleted', locator });
    expect(deleteFile).toHaveBeenCalledWith(locator, { expectedFingerprint });
  });

  it('rejects cross-library, root, and unavailable-library deletion', async () => {
    const deleteFile = vi.fn();
    const service = createService(deleteFile);

    await expect(
      service.delete({
        libraryName: 'Books',
        locator: { kind: 'workspace-file', path: 'neko/assets/Other/book.epub' },
        expectedFingerprint,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'content-unauthorized' },
    });
    await expect(
      service.delete({
        libraryName: 'Books',
        locator: { kind: 'workspace-file', path: 'neko/assets/Books' },
        expectedFingerprint,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'content-unauthorized' },
    });
    await expect(
      createService(deleteFile, 'unavailable').delete({
        libraryName: 'Books',
        locator,
        expectedFingerprint,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'content-missing' },
    });
    expect(deleteFile).not.toHaveBeenCalled();
  });
});

function createService(
  deleteFile: ReturnType<typeof vi.fn>,
  availability: 'available' | 'unavailable' = 'available',
): MediaLibraryDeleteService {
  return new MediaLibraryDeleteService(
    {
      list: async () => [
        {
          name: 'Books',
          workspacePath: 'neko/assets/Books',
          availability,
        },
      ],
    },
    { delete: deleteFile } as unknown as AuthorizedWorkspaceDeleter,
  );
}
