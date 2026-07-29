import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('VS Code Resource Browser presenter boundary', () => {
  it('uses the package-owned presenter for Media and Entity Tree identities', () => {
    const mediaProvider = readFileSync(
      path.join(import.meta.dirname, 'MediaLibraryTreeProvider.ts'),
      'utf8',
    );
    const entityProvider = readFileSync(
      path.join(import.meta.dirname, 'EntityBrowserTreeProvider.ts'),
      'utf8',
    );

    expect(mediaProvider).toContain('presentResourceBrowserContentItem');
    expect(mediaProvider).toContain('this.id = resourceItem.resourceId');
    expect(entityProvider).toContain('presentResourceBrowserEntityItem');
    expect(entityProvider).toContain('id: resourceItem.resourceId');
  });
});
