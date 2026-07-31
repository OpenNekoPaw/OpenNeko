import type { CreativeEntity, EntityRepresentationBinding } from '@neko/shared';
import { describe, expect, it } from 'vitest';
import { presentResourceBrowserContentItem, presentResourceBrowserEntityItem } from './presenter';
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

  it('projects a Character with only its confirmed active representation', () => {
    const entity: CreativeEntity = {
      id: 'character-neko',
      kind: 'character',
      canonicalName: 'Neko',
      displayName: 'Neko',
      aliases: ['猫'],
      status: 'confirmed',
    };
    const bindings: readonly EntityRepresentationBinding[] = [
      binding('rejected', 'active', 'characters/rejected.png'),
      binding('confirmed', 'orphaned', 'characters/orphaned.png'),
      binding('confirmed', 'active', 'characters/neko.png'),
    ];

    const item = presentResourceBrowserEntityItem(entity, bindings, {
      canvasAvailable: true,
    });

    expect(item).toMatchObject({
      facet: 'materials',
      kind: 'character',
      entityStatus: 'confirmed',
      representationAvailability: 'active',
      entityRef: { entityId: 'character-neko', entityKind: 'character' },
      representationLocator: {
        kind: 'workspace-file',
        path: 'characters/neko.png',
      },
      representationBindingId: 'confirmed-active',
      representationRole: 'portrait',
      capabilities: ['preview', 'add-to-canvas', 'add-to-agent'],
    });
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

function binding(
  status: EntityRepresentationBinding['status'],
  availability: EntityRepresentationBinding['availability'],
  path: string,
): EntityRepresentationBinding {
  return {
    id: `${status}-${availability}`,
    entityId: 'character-neko',
    entityKind: 'character',
    representation: { kind: 'workspace-file', path },
    role: 'portrait',
    status,
    availability,
    source: 'user',
    updatedAt: '2026-07-28T00:00:00.000Z',
  };
}
