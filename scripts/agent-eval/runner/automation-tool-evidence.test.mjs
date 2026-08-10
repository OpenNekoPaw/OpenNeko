import { describe, expect, it } from 'vitest';
import { assertAutomationToolResult } from './automation-tool-evidence.mjs';

const assertion = {
  profileId: 'browser-use.observe',
  targetLabel: 'OpenNeko Evaluation Browser',
  mode: 'observe',
  sessionStatus: 'active',
  remainingSteps: 0,
  requiredEvidenceKinds: ['text', 'structured', 'transient-image'],
  observationTransport: 'transient-receipt',
};

function result() {
  return {
    actionId: 'action-1',
    session: {
      sessionId: 'session-1',
      profileId: 'browser-use.observe',
      targetKey: 'browser-target:opaque-1',
      targetLabel: 'OpenNeko Evaluation Browser',
      mode: 'observe',
      status: 'active',
      remainingSteps: 0,
    },
    evidence: [
      { kind: 'text', text: 'viewport observed' },
      { kind: 'structured', data: { source: 'browser-use' } },
      {
        kind: 'transient-image',
        receiptId: 'receipt-1',
        mimeType: 'image/png',
        width: 800,
        height: 600,
      },
    ],
  };
}

describe('Automation Tool Evaluation evidence', () => {
  it('proves the frozen session and transient observation contract without raw bytes', () => {
    expect(assertAutomationToolResult(assertion, result())).toMatchObject({
      profileId: 'browser-use.observe',
      targetKey: 'browser-target:opaque-1',
      targetLabel: 'OpenNeko Evaluation Browser',
      mode: 'observe',
      status: 'active',
      remainingSteps: 0,
      evidenceKinds: ['text', 'structured', 'transient-image'],
      observationTransport: 'transient-receipt',
    });
  });

  it.each([
    [
      'session routing disclosure',
      (value) => {
        value.session.windowId = '701';
      },
      'session fields',
    ],
    [
      'raw data URL',
      (value) => {
        value.evidence[1].data.preview = 'data:image/png;base64,iVBORw0KGgo';
      },
      'raw observation',
    ],
    [
      'raw byte array',
      (value) => {
        value.evidence[1].data.bytes = Array.from({ length: 32 }, (_, index) => index);
      },
      'raw observation',
    ],
    [
      'missing receipt evidence',
      (value) => {
        value.evidence.pop();
      },
      "missing 'transient-image'",
    ],
    [
      'changed target',
      (value) => {
        value.session.targetLabel = 'Another Window';
      },
      'frozen identity',
    ],
  ])('rejects %s', (_label, mutate, message) => {
    const value = result();
    mutate(value);
    expect(() => assertAutomationToolResult(assertion, value)).toThrow(message);
  });
});
