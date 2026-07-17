import { describe, expect, it } from 'vitest';
import { createJudgeEvidenceProjection } from './evidence-projection.mjs';

function input() {
  return {
    userIntent: 'Create a concise storyboard.',
    target: {
      kind: 'workflow',
      id: 'storyboard',
      contractHash: `sha256:${'a'.repeat(64)}`,
    },
    expectedResult: 'A complete storyboard with validated artifacts.',
    assistantOutput: 'Created artifact:board-1.',
    artifacts: [
      {
        ref: 'artifact:board-1',
        kind: 'file',
        path: '/Users/private/project/board.json',
        digest: `sha256:${'b'.repeat(64)}`,
        deliveryStatus: 'delivered',
        validatorId: 'json-document-v1',
        validatorStatus: 'valid',
      },
    ],
    qualityEvidence: [
      {
        id: 'quality-1',
        domain: 'storyboard',
        summary: 'Structure is complete.',
        score: 4,
        evidenceRefs: ['artifact:board-1'],
        rawData: { hidden: true },
      },
    ],
    hardGates: [{ id: 'artifact', status: 'pass', evidenceRefs: ['artifact-facts'] }],
  };
}

describe('Judge evidence allowlist projection', () => {
  it('projects only public evidence fields and excludes artifact paths/raw data', () => {
    const projection = createJudgeEvidenceProjection(input());
    expect(projection).toMatchObject({
      schema: 'neko.agent-eval.judge-evidence.v2',
      artifactSummaries: [{ ref: 'artifact:board-1', validatorStatus: 'valid' }],
      qualityEvidence: [{ id: 'quality-1', score: 4 }],
    });
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain('/Users/private');
    expect(serialized).not.toContain('rawData');
  });

  it.each([
    'hiddenPrompt',
    'rawLogs',
    'repositoryDiff',
    'candidateLabel',
    'providerConfig',
    'files',
  ])('rejects forbidden top-level %s input', (field) => {
    expect(() => createJudgeEvidenceProjection({ ...input(), [field]: 'secret' })).toThrow(
      'forbidden field',
    );
  });

  it('redacts credentials and absolute paths from allowed text', () => {
    const value = input();
    value.assistantOutput =
      'Bearer abcdefghijklmnop api_key=top-secret /Users/feng/private/file.json C:\\private\\file.txt';
    const projection = createJudgeEvidenceProjection(value);
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain('abcdefghijklmnop');
    expect(serialized).not.toContain('top-secret');
    expect(serialized).not.toContain('/Users/feng');
    expect(serialized).not.toContain('C:\\private');
    expect(projection.redactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'secret' }),
        expect.objectContaining({ kind: 'absolute-path' }),
      ]),
    );
  });

  it('rejects oversized output and non-portable Skill identity', () => {
    const oversized = input();
    oversized.assistantOutput = 'x'.repeat(50_001);
    expect(() => createJudgeEvidenceProjection(oversized)).toThrow('exceeds Judge evidence limit');

    const skill = input();
    skill.target = {
      kind: 'skill',
      identity: {
        name: 'storyboard',
        source: 'project',
        provenance: 'workspace',
        rootId: 'project-agent-skills',
        relativePath: '/Users/private/storyboard',
        fingerprint: `sha256:${'c'.repeat(64)}`,
      },
    };
    expect(() => createJudgeEvidenceProjection(skill)).toThrow('must be portable');
  });

  it('supports blind Skill comparison without exposing a variant fingerprint', () => {
    const skill = input();
    skill.target = {
      kind: 'skill',
      identity: {
        name: 'storyboard',
        source: 'builtin',
        provenance: 'builtin',
        rootId: 'builtin-skills',
        relativePath: 'storyboard',
        fingerprint: `sha256:${'c'.repeat(64)}`,
      },
    };
    skill.targetVisibility = 'identity-only';
    const projection = createJudgeEvidenceProjection(skill);
    expect(projection.targetContract.target).toEqual({
      kind: 'skill',
      identity: {
        name: 'storyboard',
        source: 'builtin',
        provenance: 'builtin',
        rootId: 'builtin-skills',
        relativePath: 'storyboard',
      },
    });
    expect(JSON.stringify(projection)).not.toContain(`sha256:${'c'.repeat(64)}`);
  });

  it('rejects unknown target visibility modes', () => {
    expect(() =>
      createJudgeEvidenceProjection({ ...input(), targetVisibility: 'candidate-label' }),
    ).toThrow('unsupported targetVisibility');
  });
});
