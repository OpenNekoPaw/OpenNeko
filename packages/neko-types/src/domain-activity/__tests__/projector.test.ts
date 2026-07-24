import { describe, expect, it } from 'vitest';
import { createDomainActivityProjector, type DomainActivityItem } from '../index';

describe('Domain Activity projector', () => {
  it('publishes committed concrete summaries as ordered versioned patches', async () => {
    const projector = createDomainActivityProjector();
    const observation = projector.observe(0)[Symbol.asyncIterator]();

    projector.publish(generationActivity());
    await expect(observation.next()).resolves.toEqual({
      done: false,
      value: {
        baseProjectionVersion: 0,
        projectionVersion: 1,
        upserts: [generationActivity()],
        removed: [],
      },
    });

    projector.publish(
      generationActivity({
        phase: 'running',
        jobRevision: 2,
        updatedAt: 110,
        progress: { stage: 'waiting-provider', percent: 45 },
      }),
    );
    await expect(observation.next()).resolves.toMatchObject({
      done: false,
      value: {
        baseProjectionVersion: 1,
        projectionVersion: 2,
        upserts: [{ jobId: 'generation-1', jobRevision: 2 }],
      },
    });
    expect(projector.getSnapshot()).toMatchObject({
      projectionVersion: 2,
      items: [{ jobKind: 'generation', jobId: 'generation-1', jobRevision: 2 }],
    });
  });

  it('rejects stale and conflicting summaries without changing the projection', () => {
    const projector = createDomainActivityProjector();
    projector.publish(generationActivity({ jobRevision: 2, updatedAt: 110 }));

    expect(() => projector.publish(generationActivity())).toThrow('cannot move');
    expect(() =>
      projector.publish(
        generationActivity({
          jobRevision: 2,
          updatedAt: 110,
          progress: { stage: 'different', percent: 10 },
        }),
      ),
    ).toThrow('conflicts');
    expect(projector.getSnapshot().projectionVersion).toBe(1);
  });

  it('requires snapshot replacement after an invalid observer version', () => {
    const projector = createDomainActivityProjector();
    projector.publish(generationActivity());

    expect(() => projector.observe(2)).toThrow('invalid for projection 1');
  });
});

function generationActivity(overrides: Partial<DomainActivityItem> = {}): DomainActivityItem {
  return {
    jobKind: 'generation',
    jobId: 'generation-1',
    phase: 'pending',
    jobRevision: 1,
    createdAt: 100,
    updatedAt: 100,
    label: 'Image generation',
    mediaKind: 'image',
    progress: { stage: 'queued', percent: 0 },
    supportedCommands: ['cancel'],
    ...overrides,
  } as DomainActivityItem;
}
