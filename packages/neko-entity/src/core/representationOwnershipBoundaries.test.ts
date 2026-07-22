import { describe, expect, it, vi } from 'vitest';
import type { ContentReadService, EntityRepresentationBinding } from '@neko/shared';
import { MemoryEntityFileStore, createFixedClock } from '../testing';
import { CreativeEntityService } from './CreativeEntityService';
import { EntityRepresentationAccessService } from './representationAccess';
import { EntityRepresentationResolver } from './representationResolver';

const projectRoot = '/workspace/neko-test';

describe('entity representation ownership boundaries', () => {
  it('changes only binding/entity facts while package bytes remain owner-controlled', async () => {
    const files = new MemoryEntityFileStore();
    const service = new CreativeEntityService({
      projectRoot,
      ports: { files, clock: createFixedClock('2026-07-22T00:00:00.000Z') },
    });
    await service.createEntity({
      id: 'char_xiaoju',
      kind: 'character',
      canonicalName: '小橘',
    });
    const binding: EntityRepresentationBinding = {
      id: 'binding-live2d',
      entityId: 'char_xiaoju',
      entityKind: 'character',
      representation: {
        kind: 'package-resource',
        packageId: 'xiaoju-live2d',
        revision: 'revision-1',
        resourcePath: 'model/xiaoju.model3.json',
      },
      role: 'live2d',
      status: 'confirmed',
      availability: 'active',
      source: 'user',
      updatedAt: '2026-07-22T00:00:00.000Z',
    };
    const read = vi.fn(async (locator: typeof binding.representation) => ({
      status: 'ready' as const,
      locator,
      bytes: new Uint8Array([1]),
      offset: 0,
      totalByteLength: 1,
      fingerprint: { strategy: 'provider' as const, value: 'package:revision-1' },
    }));
    const content: ContentReadService = {
      stat: vi.fn(),
      read,
    };
    const access = new EntityRepresentationAccessService({
      resolver: new EntityRepresentationResolver({ entities: service, bindings: service.bindings }),
      content,
    });

    await service.upsertBinding(binding);
    expect(read).not.toHaveBeenCalled();

    await expect(
      access.read({
        entityId: 'char_xiaoju',
        consumer: 'canvas',
        preferredRole: 'live2d',
        allowAlternativeRoles: false,
      }),
    ).resolves.toMatchObject({
      status: 'resolved',
      content: { status: 'ready', locator: binding.representation },
    });
    expect(read).toHaveBeenCalledTimes(1);

    await service.deprecateEntity('char_xiaoju');
    await service.unbindRepresentation(binding.id);
    expect(read).toHaveBeenCalledTimes(1);
    await expect(service.bindings.list()).resolves.toEqual([]);
    await expect(service.get('char_xiaoju')).resolves.toMatchObject({ status: 'deprecated' });
  });
});
