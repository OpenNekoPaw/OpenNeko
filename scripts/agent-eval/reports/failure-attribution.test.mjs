import { describe, expect, it } from 'vitest';
import { createFailureAttribution } from './failure-attribution.mjs';

describe('evidence-linked failure attribution', () => {
  it('separates observations from low-confidence owner hypotheses', () => {
    const attribution = createFailureAttribution({
      reportId: 'report-1',
      hardGates: [
        {
          id: 'output',
          kind: 'structured-output',
          status: 'fail',
          message: 'Required field is missing.',
          evidenceRefs: ['turn-facts'],
        },
      ],
    });
    expect(attribution.observedFailures).toEqual([
      expect.objectContaining({
        id: 'gate-output',
        summary: 'Required field is missing.',
        evidenceRefs: ['turn-facts'],
      }),
    ]);
    expect(attribution.hypotheses).toEqual([
      expect.objectContaining({
        observedFailureId: 'gate-output',
        suspectedOwner: 'prompt',
        confidence: 0.4,
        missingEvidence: [expect.stringContaining('controlled comparison')],
      }),
    ]);
    expect(JSON.stringify(attribution)).not.toContain('rootCause');
  });

  it('classifies provider and Judge infrastructure as hypotheses with evidence gaps', () => {
    const attribution = createFailureAttribution({
      reportId: 'report-1',
      hardGates: [],
      executionError: Object.assign(new Error('provider timed out'), { code: 'provider-timeout' }),
      judgeError: Object.assign(new Error('Judge malformed'), { code: 'judge-malformed' }),
    });
    expect(attribution.hypotheses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ suspectedOwner: 'provider-infrastructure' }),
        expect.objectContaining({ suspectedOwner: 'evaluation-infrastructure' }),
      ]),
    );
  });

  it('returns no attribution when there is no observed failure', () => {
    expect(
      createFailureAttribution({
        reportId: 'report-1',
        hardGates: [{ id: 'runtime', kind: 'runtime-errors-empty', status: 'pass' }],
      }),
    ).toBeUndefined();
  });
});
