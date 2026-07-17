import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  addCharacterObservation,
  createCharacterGenerationContext,
  createCharacterEvidenceLedgerStore,
  createEmptyCharacterMemoryFile,
  deriveCharacterStateSnapshot,
  markCharacterObservationConflict,
  updateCharacterObservationReviewStatus,
  validateCharacterMemoryFile,
  validateCharacterObservation,
  type CharacterObservation,
} from '../character-memory';

const entityRef = { entityId: 'char-rin', entityKind: 'character' as const };

describe('progressive character memory contracts', () => {
  it('validates draft observations without mutating confirmed entity facts', () => {
    const observation = makeObservation();

    expect(validateCharacterObservation(observation)).toEqual({ ok: true, diagnostics: [] });

    const result = addCharacterObservation(
      createEmptyCharacterMemoryFile('${WORKSPACE}'),
      observation,
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.memory.ledger.observations).toEqual([observation]);
    expect(validateCharacterMemoryFile(result.memory)).toEqual({ ok: true, diagnostics: [] });
  });

  it('replaces existing observations by indexed observation id without reordering', () => {
    const first = makeObservation('obs-rin-shot-1');
    const second = makeObservation('obs-rin-shot-2');
    const replacement = {
      ...makeObservation('obs-rin-shot-1'),
      dimensions: [
        {
          dimension: 'outfit',
          value: 'Hooded jacket',
          confidence: 0.84,
        },
      ],
    } satisfies CharacterObservation;

    const withFirst = addCharacterObservation(createEmptyCharacterMemoryFile(), first).memory;
    const withSecond = addCharacterObservation(withFirst, second).memory;
    const replaced = addCharacterObservation(withSecond, replacement).memory;

    expect(replaced.ledger.observations.map((observation) => observation.observationId)).toEqual([
      'obs-rin-shot-1',
      'obs-rin-shot-2',
    ]);
    expect(replaced.ledger.observations[0]).toEqual(replacement);
  });

  it('rejects unsafe runtime handles and invalid confidence', () => {
    const result = validateCharacterObservation({
      ...makeObservation(),
      confidence: 2,
      sourceRef: {
        kind: 'manual',
        label: '/Users/feng/tmp/panel.png',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(['invalid-confidence', 'unsafe-runtime-handle']),
    );
  });

  it('requires an entity, candidate, or unresolved mention link', () => {
    const result = validateCharacterObservation({
      ...makeObservation(),
      entityRef: undefined,
      candidateId: undefined,
      candidate: undefined,
      mention: undefined,
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'missing-required-field',
        message: expect.stringContaining('entity'),
      }),
    ]);
  });

  it('accepts candidate summaries before entity confirmation', () => {
    const result = validateCharacterObservation({
      ...makeObservation(),
      entityRef: undefined,
      candidate: {
        id: 'candidate-rin',
        kind: 'character',
        name: 'Rin-like character',
        confidence: 0.7,
      },
    });

    expect(result).toEqual({ ok: true, diagnostics: [] });
  });

  it('rejects misspelled dimensions while allowing namespaced extension dimensions', () => {
    const invalid = validateCharacterObservation({
      ...makeObservation(),
      dimensions: [
        {
          dimension: 'apperance',
          value: 'Typo should not pass silently.',
        },
      ],
    });
    const extension = validateCharacterObservation({
      ...makeObservation(),
      dimensions: [
        {
          dimension: 'neko.comicPanelPose',
          value: 'Three-quarter running pose',
        },
      ],
    });

    expect(invalid.ok).toBe(false);
    expect(invalid.diagnostics).toEqual([
      expect.objectContaining({
        code: 'invalid-dimension',
        path: ['dimensions', 0, 'dimension'],
      }),
    ]);
    expect(extension).toEqual({ ok: true, diagnostics: [] });
  });

  it('updates review state, marks conflicts, and derives accepted snapshots', () => {
    const observation = makeObservation();
    const added = addCharacterObservation(createEmptyCharacterMemoryFile(), observation).memory;
    const accepted = updateCharacterObservationReviewStatus(
      added,
      observation.observationId,
      'accepted',
      { reviewer: 'user', updatedAt: '2026-06-06T00:00:00.000Z' },
    ).memory;
    const conflicted = markCharacterObservationConflict(accepted, observation.observationId, [
      'obs-other',
    ]).memory;

    expect(accepted.ledger.observations[0]?.reviewStatus).toBe('accepted');
    expect(conflicted.ledger.observations[0]).toMatchObject({
      reviewStatus: 'conflict',
      conflictWithObservationIds: ['obs-other'],
    });

    const snapshot = deriveCharacterStateSnapshot({
      snapshotId: 'snap-rin-scene-1',
      entityRef,
      scope: { kind: 'scene', sceneId: 'scene-1' },
      observations: accepted.ledger.observations,
    });

    expect(snapshot.traits).toEqual([
      expect.objectContaining({
        dimension: 'appearance',
        value: 'Short dark hair',
        evidenceObservationIds: [observation.observationId],
      }),
    ]);
  });

  it('builds generation context diagnostics for missing representations', () => {
    const context = createCharacterGenerationContext({
      contextId: 'gen-context-1',
      target: 'generation',
      participants: [
        {
          entityRef,
          displayName: 'Rin',
          missingRepresentationKinds: ['voice'],
        },
      ],
    });

    expect(context.diagnostics).toEqual([
      expect.objectContaining({
        code: 'missing-representation',
        message: expect.stringContaining('voice'),
      }),
    ]);
  });

  it('round-trips project-scoped memory through the file ops adapter', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-character-memory-'));
    const memoryPath = path.join(tmpRoot, 'character-memory.json');
    const store = createCharacterEvidenceLedgerStore({
      exists: async (targetPath) => {
        try {
          await fs.access(targetPath);
          return true;
        } catch {
          return false;
        }
      },
      readFile: (targetPath) => fs.readFile(targetPath, 'utf8'),
      writeFile: async (targetPath, content) => {
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, content, 'utf8');
      },
      mkdir: (targetPath) => fs.mkdir(targetPath, { recursive: true }).then(() => undefined),
    });
    const memory = addCharacterObservation(
      createEmptyCharacterMemoryFile('${WORKSPACE}'),
      makeObservation(),
    ).memory;

    expect(await store.load(memoryPath)).toBeNull();
    await store.save(memoryPath, memory);

    expect(await store.load(memoryPath)).toEqual(memory);
  });
});

function makeObservation(observationId = 'obs-rin-shot-1'): CharacterObservation {
  return {
    observationId,
    sourceRef: {
      kind: 'tool-result',
      toolCallId: 'read-comic',
      assetIndex: 0,
      range: { shotId: 'shot-1', panelId: 'panel-1' },
    },
    provenance: {
      source: 'comic',
      toolCallId: 'read-comic',
      observedAt: '2026-06-06T00:00:00.000Z',
    },
    reviewStatus: 'draft',
    entityRef,
    confidence: 0.82,
    dimensions: [
      {
        dimension: 'appearance',
        value: 'Short dark hair',
        confidence: 0.8,
      },
    ],
  };
}
