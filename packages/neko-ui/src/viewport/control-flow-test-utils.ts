import type {
  ViewportCommand,
  ViewportEvent,
  ViewportFrameMeta,
  ViewportOverlayDescriptor,
  ViewportSerializableRecord,
} from '@neko/shared';

export interface SemanticWorkflowExpectation {
  readonly command?: Pick<
    ViewportCommand,
    'sceneId' | 'viewportId' | 'seq' | 'correlationId' | 'baseRevision' | 'source'
  >;
  readonly ack?: Pick<
    ViewportEvent,
    'sceneId' | 'viewportId' | 'ackSeq' | 'revision' | 'appliedSeq' | 'status'
  >;
  readonly store?: ViewportSerializableRecord;
  readonly overlay?: Pick<
    ViewportOverlayDescriptor,
    'viewportId' | 'sceneId' | 'revision' | 'appliedSeq' | 'authoritative'
  >;
  readonly prediction?: {
    readonly seq?: number;
    readonly status?: string;
    readonly viewportId?: string;
    readonly baseRevision?: number;
  };
  readonly frameMeta?: Pick<
    ViewportFrameMeta,
    'sceneId' | 'viewportId' | 'revision' | 'appliedSeq'
  >;
}

export interface SemanticWorkflowSample extends SemanticWorkflowExpectation {
  readonly deltaRevision?: number;
  readonly snapshotRevision?: number;
}

export interface SemanticWorkflowAssertion {
  readonly ok: boolean;
  readonly code: string;
  readonly message: string;
}

export function assertSemanticViewportWorkflow(
  sample: SemanticWorkflowSample,
  expectation: SemanticWorkflowExpectation = {},
): readonly SemanticWorkflowAssertion[] {
  const assertions: SemanticWorkflowAssertion[] = [];
  assertions.push(assertCommandShape(sample.command, expectation.command));
  assertions.push(assertAckOrError(sample.ack, expectation.ack));
  assertions.push(assertAuthoritativeUpdate(sample));
  assertions.push(assertOverlayState(sample.overlay, sample.frameMeta, expectation.overlay));
  assertions.push(assertPredictionState(sample.prediction, expectation.prediction));
  return assertions;
}

export function expectSemanticViewportWorkflow(
  sample: SemanticWorkflowSample,
  expectation: SemanticWorkflowExpectation = {},
): void {
  const failed = assertSemanticViewportWorkflow(sample, expectation).filter((item) => !item.ok);
  if (failed.length > 0) {
    throw new Error(failed.map((item) => `${item.code}: ${item.message}`).join('\n'));
  }
}

function assertCommandShape(
  command: SemanticWorkflowSample['command'],
  expectation: SemanticWorkflowExpectation['command'],
): SemanticWorkflowAssertion {
  if (!command) {
    return fail('missing-command', 'Semantic workflow did not dispatch a command.');
  }
  if (expectation) {
    const mismatch = findFirstMismatch(command, expectation);
    if (mismatch) return fail('command-mismatch', mismatch);
  }
  if (!command.sceneId || command.seq < 0 || !command.correlationId || !command.source) {
    return fail(
      'invalid-command-envelope',
      'Command is missing sceneId, seq, correlationId, or source.',
    );
  }
  return pass('command');
}

function assertAckOrError(
  ack: SemanticWorkflowSample['ack'],
  expectation: SemanticWorkflowExpectation['ack'],
): SemanticWorkflowAssertion {
  if (!ack) {
    return fail('missing-ack', 'Semantic workflow did not receive an ack/error event.');
  }
  if (ack.status !== 'ack' && ack.status !== 'error' && ack.status !== 'resync') {
    return fail('invalid-ack-status', `Unexpected ack status ${String(ack.status)}.`);
  }
  if (expectation) {
    const mismatch = findFirstMismatch(ack, expectation);
    if (mismatch) return fail('ack-mismatch', mismatch);
  }
  return pass('ack');
}

function assertAuthoritativeUpdate(sample: SemanticWorkflowSample): SemanticWorkflowAssertion {
  if (sample.store || sample.deltaRevision !== undefined || sample.snapshotRevision !== undefined) {
    return pass('authoritative-update');
  }
  return fail(
    'missing-authoritative-update',
    'Workflow did not record a store update, delta, or snapshot after command result.',
  );
}

function assertOverlayState(
  overlay: SemanticWorkflowSample['overlay'],
  frameMeta: SemanticWorkflowSample['frameMeta'],
  expectation: SemanticWorkflowExpectation['overlay'],
): SemanticWorkflowAssertion {
  if (!overlay) return pass('overlay-optional');
  if (expectation) {
    const mismatch = findFirstMismatch(overlay, expectation);
    if (mismatch) return fail('overlay-mismatch', mismatch);
  }
  if (overlay.authoritative === true && frameMeta && overlay.appliedSeq !== undefined) {
    if (overlay.appliedSeq > frameMeta.appliedSeq) {
      return fail(
        'overlay-ahead-of-frame',
        `Overlay appliedSeq ${overlay.appliedSeq} is ahead of frame ${frameMeta.appliedSeq}.`,
      );
    }
  }
  return pass('overlay');
}

function assertPredictionState(
  prediction: SemanticWorkflowSample['prediction'],
  expectation: SemanticWorkflowExpectation['prediction'],
): SemanticWorkflowAssertion {
  if (!prediction) return pass('prediction-optional');
  if (expectation) {
    const mismatch = findFirstMismatch(prediction, expectation);
    if (mismatch) return fail('prediction-mismatch', mismatch);
  }
  if (!prediction.status) {
    return fail('prediction-missing-status', 'Prediction is missing explicit lifecycle status.');
  }
  return pass('prediction');
}

function findFirstMismatch<TActual extends object, TExpected extends Partial<TActual>>(
  actual: TActual,
  expected: TExpected,
): string | null {
  for (const [key, value] of Object.entries(expected)) {
    if (value !== undefined && actual[key as keyof TActual] !== value) {
      return `${key} expected ${String(value)} but received ${String(actual[key as keyof TActual])}.`;
    }
  }
  return null;
}

function pass(code: string): SemanticWorkflowAssertion {
  return { ok: true, code, message: 'ok' };
}

function fail(code: string, message: string): SemanticWorkflowAssertion {
  return { ok: false, code, message };
}
