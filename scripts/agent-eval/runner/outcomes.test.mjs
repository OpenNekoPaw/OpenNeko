import { describe, expect, it } from 'vitest';
import {
  annotateEvaluationError,
  classifyEvaluationError,
  classifyEvaluationOutcomes,
  evaluationExitCode,
} from './outcomes.mjs';

describe('Agent Evaluation outcomes', () => {
  it('keeps configuration, behavior, infrastructure and comparison outcomes distinct', () => {
    expect(evaluationExitCode('pass')).toBe(0);
    expect(evaluationExitCode('case-fail')).toBe(1);
    expect(evaluationExitCode('non-comparable')).toBe(1);
    expect(evaluationExitCode('infrastructure-blocked')).toBe(2);
    expect(evaluationExitCode('infrastructure-fail')).toBe(2);
    expect(evaluationExitCode('configuration-invalid')).toBe(3);
    expect(classifyEvaluationOutcomes(['pass', 'case-fail'])).toBe('case-fail');
    expect(classifyEvaluationOutcomes(['case-fail', 'infrastructure-fail'])).toBe(
      'infrastructure-fail',
    );
  });

  it('annotates an unclassified execution error without replacing its owning code', () => {
    const existing = Object.assign(new Error('bad config'), { code: 'configuration-invalid' });
    expect(
      annotateEvaluationError(existing, { code: 'infrastructure-fail', phase: 'execution' }),
    ).toMatchObject({ code: 'configuration-invalid', phase: 'execution' });
    expect(classifyEvaluationError(new Error('network'))).toBe('infrastructure-fail');
  });
});
