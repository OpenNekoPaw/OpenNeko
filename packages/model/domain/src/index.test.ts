import { describe, expect, it } from 'vitest';
import { createSourceModelStaging } from './index';

describe('Model Domain source staging', () => {
  it('creates the canonical source-model staging', () => {
    const source = {
      file: { authority: 'workspace' as const, path: 'models/asset-1.glb' },
    };

    expect(
      createSourceModelStaging('session-1', {
        kind: 'source-model',
        source,
        fingerprint: 'revision-1',
        format: 'glb',
      }),
    ).toMatchObject({
      sessionId: 'session-1',
      subject: { kind: 'source-model', source },
      selectedPurposes: ['appearance', 'camera'],
    });
  });
});
