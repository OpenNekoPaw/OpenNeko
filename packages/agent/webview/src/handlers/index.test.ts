import { describe, expect, it } from 'vitest';
import { createConfiguredRegistry } from './index';

describe('configured Webview message handlers', () => {
  it('does not register removed direct Timeline delivery handlers', () => {
    const registeredTypes = createConfiguredRegistry().getRegisteredTypes();

    expect(registeredTypes).not.toContain('agentTurnTimeline');
    expect(registeredTypes).not.toContain('agentTurnTimelineDiagnostic');
  });
});
