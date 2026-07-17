import { describe, expect, it } from 'vitest';
import {
  assertSemanticViewportWorkflow,
  expectSemanticViewportWorkflow,
  type SemanticWorkflowSample,
} from './control-flow-test-utils';

describe('semantic viewport workflow test helpers', () => {
  it('accepts command, ack, store, overlay, and prediction evidence', () => {
    const sample = workflowSample();

    expect(() =>
      expectSemanticViewportWorkflow(sample, {
        command: { sceneId: 'scene-a', seq: 9, correlationId: 'cmd-9', source: 'user' },
        ack: { sceneId: 'scene-a', ackSeq: 9, status: 'ack', revision: 4 },
        prediction: { status: 'committed' },
      }),
    ).not.toThrow();
  });

  it('rejects video-only evidence for semantic controls', () => {
    const assertions = assertSemanticViewportWorkflow({
      frameMeta: {
        sceneId: 'scene-a',
        viewportId: 'main',
        revision: 4,
        appliedSeq: 9,
      },
    });

    expect(assertions.filter((item) => !item.ok).map((item) => item.code)).toEqual([
      'missing-command',
      'missing-ack',
      'missing-authoritative-update',
    ]);
  });

  it('rejects authoritative overlays ahead of compatible frame metadata', () => {
    const assertions = assertSemanticViewportWorkflow({
      ...workflowSample(),
      overlay: {
        sceneId: 'scene-a',
        viewportId: 'main',
        revision: 4,
        appliedSeq: 10,
        authoritative: true,
      },
      frameMeta: {
        sceneId: 'scene-a',
        viewportId: 'main',
        revision: 4,
        appliedSeq: 9,
      },
    });

    expect(assertions.some((item) => item.code === 'overlay-ahead-of-frame')).toBe(true);
  });
});

function workflowSample(): SemanticWorkflowSample {
  return {
    command: {
      sceneId: 'scene-a',
      viewportId: 'main',
      seq: 9,
      correlationId: 'cmd-9',
      baseRevision: 3,
      source: 'user',
    },
    ack: {
      sceneId: 'scene-a',
      viewportId: 'main',
      ackSeq: 9,
      revision: 4,
      appliedSeq: 9,
      status: 'ack',
    },
    store: { selectedId: 'node-a' },
    overlay: {
      sceneId: 'scene-a',
      viewportId: 'main',
      revision: 4,
      appliedSeq: 9,
      authoritative: true,
    },
    prediction: {
      seq: 9,
      status: 'committed',
      viewportId: 'main',
      baseRevision: 3,
    },
    frameMeta: {
      sceneId: 'scene-a',
      viewportId: 'main',
      revision: 4,
      appliedSeq: 9,
    },
  };
}
