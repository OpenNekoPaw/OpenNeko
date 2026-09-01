import type { DshAcpSandboxMode } from '@neko/agent-contracts/dsh-acp';
import { describe, expect, it } from 'vitest';

import { enforceDshDomainToolEffect } from './dsh-domain-tool-access';

describe('DSH domain Tool effect access', () => {
  it.each([
    ['read-only', 'read', false],
    ['read-only', 'write', true],
    ['workspace-write', 'read', false],
    ['workspace-write', 'write', false],
    ['danger-full-access', 'read', false],
    ['danger-full-access', 'write', false],
  ] as const)(
    'resolves %s + %s without another permission policy',
    (sandboxMode, effect, denied) => {
      const result = enforceDshDomainToolEffect(request(sandboxMode), effect);
      if (!denied) {
        expect(result).toBeUndefined();
        return;
      }
      expect(result).toEqual({
        outcome: 'failure',
        diagnostic: {
          code: 'DSH_DOMAIN_TOOL_READ_ONLY',
          message:
            "DSH sandbox mode 'read-only' does not permit openneko_canvas operation 'apply'.",
        },
      });
    },
  );
});

function request(sandboxMode: DshAcpSandboxMode) {
  return {
    sessionId: 'session-1',
    turn: 1,
    toolCallId: 'call-1',
    sandboxMode,
    tool: 'openneko_canvas',
    operation: 'apply',
    input: {},
  } as const;
}
