import { describe, expect, it } from 'vitest';
import {
  assertResourceBrowserProjectStorageMutable,
  inspectResourceBrowserProjectStorageMutation,
} from './project-storage-mutation-policy';

describe('Resource Browser project storage mutation policy', () => {
  it.each([
    ['neko/project.json', 'project-facts'],
    ['neko/project-bindings/entity-character/a.json', 'project-facts'],
    ['.neko/presentation/resource-browser.json', 'project-local-state'],
  ] as const)('reserves %s for its package owner', (path, owner) => {
    expect(inspectResourceBrowserProjectStorageMutation(path)).toEqual({
      code: 'package-owned-project-storage',
      owner,
      path,
    });
    expect(() => assertResourceBrowserProjectStorageMutable(path)).toThrow(owner);
  });

  it('allows ordinary project-owned content paths', () => {
    expect(inspectResourceBrowserProjectStorageMutation('media/shot.mov')).toBeUndefined();
    expect(() => assertResourceBrowserProjectStorageMutable('notes/story.md')).not.toThrow();
  });
});
