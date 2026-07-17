import { describe, expect, it } from 'vitest';
import { CreativeEntityProviderRegistry, StoryEntityProviderAdapter } from '../providers';

const projectRoot = '/workspace/neko-test';
const now = '2026-05-18T00:00:00.000Z';

describe('creative entity provider adapters', () => {
  it('collects Story candidates and occurrences without owning confirmed facts', async () => {
    const registry = new CreativeEntityProviderRegistry();
    registry.register(
      new StoryEntityProviderAdapter({
        listCharacterNames: () => ['小橘', '小橘'],
        listCandidates: () => [
          { kind: 'location', name: '天台', sourceRef: 'cases/test.fountain:9' },
        ],
        listOccurrences: () => [
          {
            name: '小橘',
            entityId: 'char_xiaoju',
            sourceRef: 'cases/test.fountain:8',
            role: 'definition',
          },
        ],
        now: () => now,
      }),
    );

    const snapshot = await registry.collect({ projectRoot });

    expect(snapshot.statuses).toEqual([
      expect.objectContaining({ providerId: 'neko-story', available: true }),
    ]);
    expect(snapshot.candidates.map((candidate) => candidate.name)).toEqual(['天台', '小橘']);
    expect(snapshot.occurrences).toEqual([
      expect.objectContaining({
        entityRef: expect.objectContaining({ entityId: 'char_xiaoju' }),
        location: 'cases/test.fountain:8',
      }),
    ]);
  });

  it('marks provider unavailability as non-fatal', async () => {
    const registry = new CreativeEntityProviderRegistry();
    registry.register(
      new StoryEntityProviderAdapter({
        listCharacterNames: () => ['小橘'],
        available: () => false,
        now: () => now,
      }),
    );

    const snapshot = await registry.collect({ projectRoot });

    expect(snapshot.statuses).toEqual([
      expect.objectContaining({
        providerId: 'neko-story',
        available: false,
        freshness: 'stale',
      }),
    ]);
    expect(snapshot.candidates).toEqual([]);
  });
});
