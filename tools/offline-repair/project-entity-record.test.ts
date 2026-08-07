import { chmod, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PROJECT_ENTITY_REPAIR_CONFIRMATION_PREFIX,
  repairProjectEntityRecord,
} from './project-entity-record';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('Project Entity offline repair', () => {
  it('backs up the original bytes and removes only the explicitly confirmed invalid record', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openneko-entity-repair-'));
    roots.push(root);
    const target = join(root, 'entities.json');
    const original = `${JSON.stringify(
      {
        projectId: 'project-neko',
        entities: [entity('valid', 'Valid'), entity('invalid', '')],
      },
      null,
      2,
    )}\n`;
    await writeFile(target, original, 'utf8');
    await chmod(target, 0o640);

    const result = await repairProjectEntityRecord({
      target,
      entityId: 'invalid',
      confirmation: `${PROJECT_ENTITY_REPAIR_CONFIRMATION_PREFIX}invalid`,
      now: () => new Date('2026-08-06T00:00:00.000Z'),
      createId: idSequence('backup-id', 'temporary-id'),
    });

    expect(await readFile(result.backup, 'utf8')).toBe(original);
    expect(JSON.parse(await readFile(target, 'utf8'))).toEqual({
      projectId: 'project-neko',
      entities: [entity('valid', 'Valid')],
    });
    expect((await stat(target)).mode & 0o777).toBe(0o640);
    expect((await stat(result.backup)).mode & 0o777).toBe(0o640);
    expect(result).toMatchObject({ entityId: 'invalid', remainingEntityCount: 1, target });
  });

  it('does not create a backup or write when confirmation is not exact', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openneko-entity-repair-'));
    roots.push(root);
    const target = join(root, 'entities.json');
    const original = `${JSON.stringify({
      projectId: 'project-neko',
      entities: [entity('invalid', '')],
    })}\n`;
    await writeFile(target, original, 'utf8');

    await expect(
      repairProjectEntityRecord({ target, entityId: 'invalid', confirmation: 'yes' }),
    ).rejects.toThrow('requires --confirm');
    expect(await readFile(target, 'utf8')).toBe(original);
    expect(await readdir(root)).toEqual(['entities.json']);
  });
});

function entity(entityId: string, canonical: string) {
  return {
    entityId,
    kind: 'character',
    names: { canonical, aliases: [] },
    facts: {},
    representations: [],
    lifecycle: { state: 'active' },
    createdAt: '2026-08-06T00:00:00.000Z',
    updatedAt: '2026-08-06T00:00:00.000Z',
  };
}

function idSequence(...ids: readonly string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `unexpected-${String(index)}`;
}
