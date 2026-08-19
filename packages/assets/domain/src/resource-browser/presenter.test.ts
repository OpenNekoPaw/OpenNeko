import { describe, expect, it } from 'vitest';
import { presentResourceBrowserAssetItem, presentResourceBrowserContentItem } from './presenter';
import type { ResourceBrowserContentEntry } from './ports';

describe('Resource Browser presenter', () => {
  it('projects portable media identity without leaking a host path', () => {
    const entry: ResourceBrowserContentEntry = {
      locator: { file: { authority: 'workspace', path: 'assets/cat.png' } },
      label: 'cat.png',
      availability: 'available',
      capabilities: ['read', 'preview', 'bind'],
      metadata: { mediaType: 'image' },
      role: 'content',
      depth: 0,
    };

    const item = presentResourceBrowserContentItem(entry, 'media', {
      canvasAvailable: true,
    });

    expect(item).toMatchObject({
      source: 'media',
      kind: 'image',
      locator: entry.locator,
      capabilities: ['preview', 'reveal', 'add-to-canvas'],
    });
    expect(item.resourceId).toMatch(/^content:[a-f0-9]+$/);
    expect(JSON.stringify(item)).not.toContain('/Users/');
  });

  it('projects reusable Assets without exposing a global filesystem path', () => {
    const item = presentResourceBrowserAssetItem({
      id: 'global-asset-library:lighting',
      owner: 'global-asset-library',
      label: 'Lighting preset',
      kind: 'asset',
      availability: 'available',
    });

    expect(item).toMatchObject({
      source: 'assets',
      kind: 'asset',
      role: 'asset',
      assetRef: { assetId: 'global-asset-library:lighting' },
      capabilities: [],
    });
    expect(JSON.stringify(item)).not.toContain('/Users/');
  });

  it('offers Cut handoff only for bindable video or audio media', () => {
    const video = presentResourceBrowserContentItem(
      {
        locator: { file: { authority: 'workspace', path: 'media/shot.mp4' } },
        label: 'shot.mp4',
        availability: 'available',
        capabilities: ['read', 'preview', 'bind'],
        metadata: { mediaType: 'video' },
        role: 'content',
        depth: 0,
      },
      'media',
    );
    const document = presentResourceBrowserContentItem(
      {
        locator: { file: { authority: 'workspace', path: 'docs/story.pdf' } },
        label: 'story.pdf',
        availability: 'available',
        capabilities: ['read', 'preview', 'bind'],
        metadata: { mediaType: 'document' },
        role: 'content',
        depth: 0,
      },
      'media',
    );

    expect(video.capabilities).toContain('add-to-cut');
    expect(document.capabilities).not.toContain('add-to-cut');
  });

  it('projects editable Workspace text only through the canonical admission registry', () => {
    const markdown = presentResourceBrowserContentItem(
      {
        locator: { file: { authority: 'workspace', path: 'notes/readme.md' } },
        label: 'readme.md',
        availability: 'available',
        capabilities: ['read', 'preview'],
        metadata: { mediaType: 'text' },
        role: 'content',
        depth: 0,
      },
      'files',
    );
    const unsupported = presentResourceBrowserContentItem(
      {
        locator: { file: { authority: 'workspace', path: 'data/archive.bin' } },
        label: 'archive.bin',
        availability: 'available',
        capabilities: ['read', 'preview'],
        metadata: { mediaType: 'file' },
        role: 'content',
        depth: 0,
      },
      'files',
    );

    expect(markdown.capabilities).toEqual(['edit-text', 'preview', 'reveal']);
    expect(unsupported.capabilities).toEqual(['preview', 'reveal']);
  });
});
