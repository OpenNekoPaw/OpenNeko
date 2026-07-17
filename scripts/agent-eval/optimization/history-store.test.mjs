import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OPTIMIZATION_SCHEMAS } from '../schemas/optimization-contracts.mjs';
import {
  appendDevelopmentCheckpoint,
  appendDevelopmentCheckpoints,
  appendRenameLineage,
  createEmptyDevelopmentHistory,
  findSkillDevelopmentHistory,
  loadDevelopmentHistory,
  observeCurrentHostFingerprint,
  resolveSkillDevelopmentLineage,
} from './history-store.mjs';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const HASH_C = `sha256:${'c'.repeat(64)}`;
const NOW = '2026-07-14T00:00:00.000Z';
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

function identity(fingerprint = HASH_A, overrides = {}) {
  return {
    name: 'creation-persona',
    source: 'builtin',
    provenance: 'builtin',
    rootId: 'builtin-skills',
    relativePath: 'creation-persona',
    fingerprint,
    ...overrides,
  };
}

function checkpoint(state, overrides = {}) {
  const fingerprint = state === 'baseline' ? HASH_A : HASH_B;
  const origin = {
    baseline: 'evaluation-baseline',
    candidate: 'optimizer-candidate',
    evaluated: 'evaluation-result',
    accepted: 'human-decision',
    rejected: 'human-decision',
    superseded: 'superseded',
  }[state];
  const decision = {
    baseline: 'none',
    candidate: 'approved',
    evaluated: 'none',
    accepted: 'accepted',
    rejected: 'rejected',
    superseded: 'superseded',
  }[state];
  return {
    schema: OPTIMIZATION_SCHEMAS.checkpoint,
    id: `checkpoint-${state}`,
    state,
    identity: identity(fingerprint),
    fingerprint,
    origin: { kind: origin, ref: `origin-${state}` },
    reportIds: ['report-creation-persona'],
    attribution: {
      observedFailure: 'Creative rationale is generic.',
      suspectedOwner: 'skill-content',
      confidence: 0.9,
      evidenceRefs: ['persona-facts'],
      missingEvidence: [],
    },
    decision,
    actor: 'developer@example.invalid',
    recordedAt: NOW,
    residualRisk: [],
    ...overrides,
  };
}

async function historyFile() {
  const root = await fs.mkdtemp(join(os.tmpdir(), 'neko-skill-history-'));
  temporaryDirectories.push(root);
  return join(root, 'quality', 'history.json');
}

describe('Skill development history store', () => {
  it('appends explicit immutable checkpoints with parent fingerprint lineage', async () => {
    const file = await historyFile();
    await appendDevelopmentCheckpoint(checkpoint('baseline'), { file });
    await appendDevelopmentCheckpoint(
      checkpoint('candidate', { parent: { entryId: 'checkpoint-baseline', fingerprint: HASH_A } }),
      { file },
    );
    await appendDevelopmentCheckpoint(
      checkpoint('evaluated', {
        parent: { entryId: 'checkpoint-candidate', fingerprint: HASH_B },
      }),
      { file },
    );
    await appendDevelopmentCheckpoint(
      checkpoint('accepted', {
        parent: { entryId: 'checkpoint-evaluated', fingerprint: HASH_B },
      }),
      { file },
    );

    const history = await loadDevelopmentHistory(file);
    expect(history.entries.map((entry) => entry.state)).toEqual([
      'baseline',
      'candidate',
      'evaluated',
      'accepted',
    ]);
    expect(history.entries[0]).toEqual(checkpoint('baseline'));
  });

  it('writes a checkpoint batch atomically and leaves no partial lineage on failure', async () => {
    const file = await historyFile();
    await expect(
      appendDevelopmentCheckpoints(
        [
          checkpoint('baseline'),
          checkpoint('candidate', {
            parent: { entryId: 'checkpoint-baseline', fingerprint: HASH_A },
          }),
          checkpoint('accepted', {
            parent: { entryId: 'checkpoint-candidate', fingerprint: HASH_B },
          }),
        ],
        { file },
      ),
    ).rejects.toMatchObject({ code: 'history-transition-invalid' });

    expect((await loadDevelopmentHistory(file)).entries).toEqual([]);
  });

  it('records a new explicit baseline after a terminal candidate decision', async () => {
    const file = await historyFile();
    await appendDevelopmentCheckpoints(
      [
        checkpoint('baseline'),
        checkpoint('candidate', {
          parent: { entryId: 'checkpoint-baseline', fingerprint: HASH_A },
        }),
        checkpoint('evaluated', {
          parent: { entryId: 'checkpoint-candidate', fingerprint: HASH_B },
        }),
        checkpoint('accepted', {
          parent: { entryId: 'checkpoint-evaluated', fingerprint: HASH_B },
        }),
      ],
      { file },
    );
    await appendDevelopmentCheckpoints(
      [
        checkpoint('baseline', {
          id: 'checkpoint-baseline-2',
          identity: identity(HASH_B),
          fingerprint: HASH_B,
          parent: { entryId: 'checkpoint-accepted', fingerprint: HASH_B },
        }),
        checkpoint('candidate', {
          id: 'checkpoint-candidate-2',
          identity: identity(HASH_C),
          fingerprint: HASH_C,
          parent: { entryId: 'checkpoint-baseline-2', fingerprint: HASH_B },
        }),
      ],
      { file },
    );

    expect((await loadDevelopmentHistory(file)).entries.map((entry) => entry.state)).toEqual([
      'baseline',
      'candidate',
      'evaluated',
      'accepted',
      'baseline',
      'candidate',
    ]);
  });

  it('fails visibly for missing, stale, unchanged and invalid parents', async () => {
    const file = await historyFile();
    await appendDevelopmentCheckpoint(checkpoint('baseline'), { file });
    await expect(
      appendDevelopmentCheckpoint(
        checkpoint('candidate', { parent: { entryId: 'missing', fingerprint: HASH_A } }),
        { file },
      ),
    ).rejects.toMatchObject({ code: 'history-parent-missing' });
    await expect(
      appendDevelopmentCheckpoint(
        checkpoint('candidate', {
          parent: { entryId: 'checkpoint-baseline', fingerprint: HASH_B },
        }),
        { file },
      ),
    ).rejects.toMatchObject({ code: 'history-parent-stale' });
    await expect(
      appendDevelopmentCheckpoint(
        checkpoint('candidate', {
          identity: identity(HASH_A),
          fingerprint: HASH_A,
          parent: { entryId: 'checkpoint-baseline', fingerprint: HASH_A },
        }),
        { file },
      ),
    ).rejects.toMatchObject({ code: 'history-candidate-unchanged' });
    await expect(
      appendDevelopmentCheckpoint(
        checkpoint('accepted', { parent: { entryId: 'checkpoint-baseline', fingerprint: HASH_A } }),
        { file },
      ),
    ).rejects.toMatchObject({ code: 'history-transition-invalid' });
  });

  it('rejects corrupted persisted parent lineage when loading history', async () => {
    const file = await historyFile();
    const corrupted = {
      schema: OPTIMIZATION_SCHEMAS.history,
      entries: [
        checkpoint('baseline'),
        checkpoint('candidate', {
          parent: { entryId: 'missing-parent', fingerprint: HASH_A },
        }),
      ],
      renameLineage: [],
    };
    await fs.mkdir(dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(corrupted, null, 2)}\n`, 'utf8');

    await expect(loadDevelopmentHistory(file)).rejects.toMatchObject({
      code: 'history-parent-missing',
    });
  });

  it('keeps same-name project, personal and builtin identities separate', () => {
    const history = createEmptyDevelopmentHistory();
    history.entries.push(
      checkpoint('baseline'),
      checkpoint('baseline', {
        id: 'checkpoint-project',
        identity: identity(HASH_A, {
          source: 'project',
          provenance: 'workspace',
          rootId: 'project-agent-skills',
        }),
      }),
      checkpoint('baseline', {
        id: 'checkpoint-personal',
        identity: identity(HASH_A, {
          source: 'personal',
          provenance: 'user',
          rootId: 'personal-agent-skills',
        }),
      }),
    );
    expect(findSkillDevelopmentHistory(history, identity())).toHaveLength(1);
    expect(
      findSkillDevelopmentHistory(
        history,
        identity(HASH_A, {
          source: 'project',
          provenance: 'workspace',
          rootId: 'project-agent-skills',
        }),
      ),
    ).toHaveLength(1);
    expect(() => findSkillDevelopmentHistory(history, { name: 'creation-persona' })).toThrow();
  });

  it('requires an explicit unambiguous rename/move record', async () => {
    const file = await historyFile();
    await appendDevelopmentCheckpoint(checkpoint('baseline'), { file });
    const renamed = identity(HASH_A, {
      name: 'creation-partner',
      relativePath: 'creation-partner',
    });
    await expect(
      appendDevelopmentCheckpoint(
        checkpoint('candidate', {
          identity: { ...renamed, fingerprint: HASH_B },
          parent: { entryId: 'checkpoint-baseline', fingerprint: HASH_A },
        }),
        { file },
      ),
    ).rejects.toMatchObject({ code: 'history-identity-lineage-missing' });

    await appendRenameLineage(
      {
        schema: OPTIMIZATION_SCHEMAS.renameLineage,
        id: 'rename-creation-persona',
        kind: 'rename',
        fromIdentity: identity(),
        toIdentity: renamed,
        reason: 'Explicit developer-approved rename.',
        actor: 'developer@example.invalid',
        recordedAt: NOW,
      },
      { file },
    );
    const result = await appendDevelopmentCheckpoint(
      checkpoint('candidate', {
        identity: { ...renamed, fingerprint: HASH_B },
        parent: { entryId: 'checkpoint-baseline', fingerprint: HASH_A },
      }),
      { file },
    );
    expect(resolveSkillDevelopmentLineage(result.history, identity())).toHaveLength(2);

    await expect(
      appendRenameLineage(
        {
          schema: OPTIMIZATION_SCHEMAS.renameLineage,
          id: 'move-creation-persona-again',
          kind: 'move',
          fromIdentity: identity(),
          toIdentity: identity(HASH_A, {
            name: 'creation-draft-partner',
            relativePath: 'creation-draft-partner',
          }),
          reason: 'Conflicting branch.',
          actor: 'developer@example.invalid',
          recordedAt: NOW,
        },
        { file },
      ),
    ).rejects.toMatchObject({ code: 'rename-lineage-ambiguous' });
  });

  it('observes current Host fingerprint without creating per-save history', async () => {
    const file = await historyFile();
    expect(observeCurrentHostFingerprint(identity())).toEqual({
      identity: identity(),
      fingerprint: HASH_A,
    });
    await expect(fs.stat(file)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
