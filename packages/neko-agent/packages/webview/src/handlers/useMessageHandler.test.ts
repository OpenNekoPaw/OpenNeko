import { describe, expect, it } from 'vitest';
import { isProjectionHostMessage } from './useMessageHandler';

describe('Agent Webview dedicated message routing', () => {
  it.each([
    'projectionEndpointReady',
    'projectionSnapshot',
    'projectionPatch',
    'projectionDetach',
    'projectionProtocolDiagnostic',
  ])('routes %s outside the legacy handler registry', (type) => {
    expect(isProjectionHostMessage({ type })).toBe(true);
  });

  it('keeps ordinary host messages in the handler registry', () => {
    expect(isProjectionHostMessage({ type: 'settingsData' })).toBe(false);
  });
});
