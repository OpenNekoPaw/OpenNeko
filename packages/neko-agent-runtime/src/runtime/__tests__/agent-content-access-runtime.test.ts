import { describe, expect, it } from 'vitest';
import {
  createAgentContentAccessDiagnostic,
  isAgentContentAccessReady,
} from '../capability/agent-content-access-runtime';

describe('agent content access runtime contracts', () => {
  it('creates safe diagnostics with Agent caller context', () => {
    const diagnostic = createAgentContentAccessDiagnostic({
      code: 'agent-content-access-unavailable',
      message: 'Agent content access is unavailable.',
    });

    expect(diagnostic).toEqual({
      code: 'agent-content-access-unavailable',
      severity: 'error',
      message: 'Agent content access is unavailable.',
    });
  });

  it('uses a narrow ready predicate without old ContentAccess statuses', () => {
    expect(isAgentContentAccessReady('ready')).toBe(true);
    expect(isAgentContentAccessReady('unsupported-source')).toBe(false);
  });
});
