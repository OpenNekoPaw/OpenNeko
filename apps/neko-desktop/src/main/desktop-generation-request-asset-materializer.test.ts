import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createDesktopGenerationRequestAssetMaterializer } from './desktop-generation-request-asset-materializer';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Desktop Generation request asset materializer', () => {
  it('materializes an exact EPUB image entry for Generation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openneko-generation-entry-'));
    roots.push(root);
    await copyFile(
      new URL('../../../../scripts/fixtures/documents/synthetic-document.epub', import.meta.url),
      join(root, 'story.epub'),
    );
    const locator = {
      file: { authority: 'workspace' as const, path: 'story.epub' },
      selector: { kind: 'entry' as const, path: 'OEBPS/images/page-1.png' },
    };
    const materializer = createDesktopGenerationRequestAssetMaterializer(root);

    const encoded = await materializer.readAsBase64(locator);
    const resolved = await materializer.resolveAsUrl?.(locator);

    expect(Buffer.from(encoded, 'base64').subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(resolved).toMatch(/^data:image\/png;base64,/u);
  });
});
