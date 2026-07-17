import { describe, expect, it } from 'vitest';
import type { AssetEntity } from '@neko/shared';
import { RuleClassifier } from '../../classifier/RuleClassifier';

function createEntity(
  overrides: Partial<AssetEntity> & Pick<AssetEntity, 'id' | 'name' | 'category'>,
): AssetEntity {
  const now = Date.now();
  return {
    id: overrides.id,
    name: overrides.name,
    category: overrides.category,
    metadata: overrides.metadata ?? {},
    variants: [],
    tags: overrides.tags ?? [],
    aliases: overrides.aliases ?? [],
    usageCount: 0,
    createdAt: now,
    updatedAt: now,
  } as AssetEntity;
}

const ENTITIES: readonly AssetEntity[] = [
  createEntity({
    id: 'e1',
    name: 'Alice',
    category: 'character',
    aliases: ['ALICE', 'Little Alice'],
    tags: ['protagonist', 'female'],
  }),
  createEntity({
    id: 'e2',
    name: 'Magic Sword',
    category: 'object',
    tags: ['weapon', 'sword', 'fantasy'],
  }),
  createEntity({
    id: 'e3',
    name: 'Dark Forest',
    category: 'environment',
    tags: ['forest', 'dark', 'outdoor'],
  }),
];

function createClassifier(): RuleClassifier {
  return new RuleClassifier(async () => ENTITIES);
}

describe('RuleClassifier.findSimilarEntities', () => {
  it('matches by entity name in file name', async () => {
    const classifier = createClassifier();
    const results = await classifier.findSimilarEntities('/assets/alice_front.png');
    expect(results).toHaveLength(1);
    expect(results[0]?.entity.id).toBe('e1');
    expect(results[0]?.similarity).toBe(0.9);
  });

  it('matches by alias in file name', async () => {
    const classifier = createClassifier();
    const results = await classifier.findSimilarEntities('/assets/little-alice-smile.png');
    expect(results.length).toBeGreaterThanOrEqual(1);
    const aliceMatch = results.find((r) => r.entity.id === 'e1');
    expect(aliceMatch).toBeDefined();
    expect(aliceMatch!.similarity).toBeGreaterThanOrEqual(0.8);
  });

  it('matches by tag in file name', async () => {
    const classifier = createClassifier();
    const results = await classifier.findSimilarEntities('/props/sword_rusty.png');
    const swordMatch = results.find((r) => r.entity.id === 'e2');
    expect(swordMatch).toBeDefined();
    expect(swordMatch!.similarity).toBe(0.6);
  });

  it('matches by directory name', async () => {
    const classifier = createClassifier();
    const results = await classifier.findSimilarEntities('/character/unknown_hero.png');
    // 'character' directory matches entity category
    const charMatch = results.find((r) => r.entity.id === 'e1');
    expect(charMatch).toBeDefined();
    expect(charMatch!.similarity).toBe(0.5);
  });

  it('returns empty when no entities match', async () => {
    const classifier = createClassifier();
    const results = await classifier.findSimilarEntities('/textures/noise_pattern.png');
    expect(results).toHaveLength(0);
  });

  it('respects similarity threshold', async () => {
    const classifier = createClassifier();
    // With high threshold, only exact name match passes
    const results = await classifier.findSimilarEntities('/assets/alice_front.png', {
      similarityThreshold: 0.85,
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.similarity).toBe(0.9);
  });

  it('respects maxSimilarEntities limit', async () => {
    const classifier = createClassifier();
    const results = await classifier.findSimilarEntities('/character/alice_forest.png', {
      maxSimilarEntities: 1,
    });
    expect(results).toHaveLength(1);
  });

  it('returns empty when no entity loader is provided', async () => {
    const classifier = new RuleClassifier();
    const results = await classifier.findSimilarEntities('/assets/alice.png');
    expect(results).toHaveLength(0);
  });

  it('sorts results by score descending', async () => {
    const classifier = createClassifier();
    // alice_front.png matches Alice by name (0.9) and also forest tag for Dark Forest (0.6)
    const results = await classifier.findSimilarEntities('/forest/alice_front.png');
    expect(results.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.similarity).toBeGreaterThanOrEqual(results[i]!.similarity);
    }
  });
});
