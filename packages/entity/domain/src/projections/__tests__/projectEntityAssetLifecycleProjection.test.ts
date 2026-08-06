import { describe, expect, it, vi } from 'vitest';
import {
  assertProjectEntityAssetLifecycleEvent,
  projectEntityAssetLifecycleAvailability,
  type ProjectEntityRecord,
} from '../../index';

describe('Project Entity Asset lifecycle projection', () => {
  it('rejects mutable Project facts and paths at the generic Asset sync event boundary', () => {
    const event = lifecycleEvent('uninstalled');
    expect(assertProjectEntityAssetLifecycleEvent(event)).toEqual(event);
    for (const forbidden of [
      { projectDocument: { unsupportedRoot: true } },
      { entities: [ENTITY] },
      { workspacePath: '/private/project' },
    ]) {
      expect(() => assertProjectEntityAssetLifecycleEvent({ ...event, ...forbidden })).toThrow(
        'lifecycle event is invalid',
      );
    }
  });

  it('projects uninstall and remote tombstone without mutating Entity lifecycle or facts', () => {
    const commit = vi.fn(() => {
      throw new Error('Asset lifecycle projection must not commit Project Entity facts.');
    });
    const before = structuredClone(ENTITY);

    expect(
      projectEntityAssetLifecycleAvailability(ENTITY, lifecycleEvent('uninstalled')),
    ).toMatchObject({
      entityId: ENTITY.entityId,
      relation: 'origin-and-applied',
      availability: 'unavailable',
    });
    expect(
      projectEntityAssetLifecycleAvailability(ENTITY, lifecycleEvent('remote-tombstone')),
    ).toMatchObject({ availability: 'remote-tombstone' });
    expect(ENTITY).toEqual(before);
    expect(ENTITY.lifecycle).toEqual({ state: 'active' });
    expect(commit).not.toHaveBeenCalled();
  });

  it('ignores unrelated Asset revisions instead of changing Project Entity state', () => {
    expect(
      projectEntityAssetLifecycleAvailability(ENTITY, {
        ...lifecycleEvent('uninstalled'),
        asset: { ...ASSET, revision: 'other-revision' },
      }),
    ).toBeNull();
  });
});

function lifecycleEvent(state: 'installed' | 'uninstalled' | 'remote-tombstone') {
  return { asset: ASSET, state, observedAt: '2026-08-05T03:00:00.000Z' } as const;
}

const ASSET = {
  assetId: 'entity-asset-rin',
  revision: '3',
  digest: 'a'.repeat(64),
};
const ENTITY: ProjectEntityRecord = {
  entityId: 'character-rin',
  kind: 'character',
  names: { canonical: 'Rin', aliases: [] },
  facts: { role: 'lead' },
  representations: [],
  lifecycle: { state: 'active' },
  provenance: {
    origin: ASSET,
    applied: ASSET,
    importBase: {
      kind: 'character',
      names: { canonical: 'Rin', aliases: [] },
      facts: { role: 'lead' },
      representations: [],
    },
    representationOrigins: [],
  },
  createdAt: '2026-08-05T00:00:00.000Z',
  updatedAt: '2026-08-05T00:00:00.000Z',
};
