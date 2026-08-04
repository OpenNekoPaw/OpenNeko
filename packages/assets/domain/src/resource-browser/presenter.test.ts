import type { ProjectEntityRecord } from '@neko/entity-domain';
import { describe, expect, it } from 'vitest';
import {
  presentResourceBrowserAssetItem,
  presentResourceBrowserContentItem,
  presentResourceBrowserEntityItem,
} from './presenter';
import type { ResourceBrowserContentEntry } from './ports';

describe('Resource Browser presenter', () => {
  it('projects portable media identity without leaking a host path', () => {
    const entry: ResourceBrowserContentEntry = {
      locator: { kind: 'workspace-file', path: 'assets/cat.png' },
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
      facet: 'media',
      kind: 'image',
      locator: entry.locator,
      capabilities: ['preview', 'reveal', 'add-to-canvas'],
    });
    expect(item.resourceId).toMatch(/^content:[a-f0-9]+$/);
    expect(JSON.stringify(item)).not.toContain('/Users/');
  });

  it('projects a Character from its canonical default representation', () => {
    const entity: ProjectEntityRecord = {
      entityId: 'character-neko',
      kind: 'character',
      names: { canonical: 'Neko', display: 'Neko', aliases: ['猫'] },
      facts: {},
      representations: [
        {
          bindingId: 'binding-neko',
          role: 'portrait',
          target: { kind: 'workspace-file', path: 'characters/neko.png' },
          source: 'user',
          isDefault: true,
          acceptedAt: '2026-07-28T00:00:00.000Z',
        },
      ],
      lifecycle: { state: 'active' },
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-28T00:00:00.000Z',
    };

    const item = presentResourceBrowserEntityItem(entity, {
      canvasAvailable: true,
    });

    expect(item).toMatchObject({
      facet: 'entities',
      kind: 'character',
      entityStatus: 'confirmed',
      representationAvailability: 'active',
      entityRef: { entityId: 'character-neko', entityKind: 'character' },
      representationLocator: {
        kind: 'workspace-file',
        path: 'characters/neko.png',
      },
      representationBindingId: 'binding-neko',
      representationRole: 'portrait',
      capabilities: ['preview', 'add-to-canvas'],
    });
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
      facet: 'assets',
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
        locator: { kind: 'workspace-file', path: 'media/shot.mp4' },
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
        locator: { kind: 'workspace-file', path: 'docs/story.pdf' },
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
});
