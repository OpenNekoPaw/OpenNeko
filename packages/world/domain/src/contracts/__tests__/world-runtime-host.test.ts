import { describe, expect, it } from 'vitest';

import {
  parseWorldRuntimeBinding,
  parseWorldRuntimeHostRequest,
  parseWorldRuntimeProjection,
} from '../world-runtime-host';

describe('World runtime Host contracts', () => {
  it('requires one exact Version, Run, Save, branch and participant binding', () => {
    expect(parseWorldRuntimeBinding(binding())).toEqual(binding());
    for (const field of [
      'worldVersionId',
      'worldRunId',
      'worldSaveId',
      'branchId',
      'participantId',
    ]) {
      const invalid = { ...binding() } as Record<string, unknown>;
      delete invalid[field];
      expect(() => parseWorldRuntimeBinding(invalid)).toThrow();
    }
    expect(() =>
      parseWorldRuntimeBinding({ ...binding(), activeWorldVersionId: 'version-2' }),
    ).toThrow('unsupported fields');
    expect(() =>
      parseWorldRuntimeBinding({ ...binding(), placement: { kind: 'standalone-library' } }),
    ).toThrow('unsupported fields');
  });

  it('rejects an action intent from another exact runtime authority', () => {
    expect(() =>
      parseWorldRuntimeHostRequest({
        requestId: 'request-1',
        rendererSessionId: 'renderer-1',
        windowId: 'window-1',
        operation: 'runtime-action-submit',
        binding: binding(),
        intent: {
          worldActionIntentId: 'intent-1',
          worldRunId: 'other-run',
          worldSaveId: 'save-1',
          branchId: 'branch-main',
          actorId: 'actor-1',
          action: 'world.foundation.fact.set',
          parameters: {},
          observedTimepoint: 0,
          expectedWorldStateRevision: 0,
          createdAt: '2026-08-14T00:00:00.000Z',
        },
      }),
    ).toThrow('does not match');
  });

  it('parses bounded presentation facts without repository payloads', () => {
    const projection = parseWorldRuntimeProjection({
      binding: binding(),
      status: 'ready',
      background: 'Rain city',
      locations: [],
      facts: [],
      availableActions: ['world.foundation.fact.set'],
      participants: [{ participantId: 'participant-1', actorId: 'actor-1' }],
      worldStateRevision: 0,
      timepoint: 0,
      branches: [{ branchId: 'branch-main', active: true, eventCount: 0 }],
      timeline: [],
      diagnostics: [],
    });
    expect(projection).not.toHaveProperty('save');
    expect(projection).not.toHaveProperty('state');
    expect(projection).not.toHaveProperty('eventMutations');
  });
});

function binding() {
  return {
    worldProjectId: 'world-1',
    worldVersionId: 'version-1',
    worldRunId: 'run-1',
    worldSaveId: 'save-1',
    branchId: 'branch-main',
    participantId: 'participant-1',
    actorId: 'actor-1',
  };
}
