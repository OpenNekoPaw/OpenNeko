import { describe, expect, it } from 'vitest';
import type { AgentContextPayload } from '../agent-context';

describe('model preview Agent context removal', () => {
  it('does not expose removed model context discriminators', () => {
    for (const removedType of ['model-preview', 'model-scene'] as const) {
      // @ts-expect-error Removed model context discriminators must not compile.
      const payload: AgentContextPayload = {
        type: removedType,
        id: 'removed',
        label: 'Removed',
        summary: '',
        data: {},
      };
      expect(payload.type).toBe(removedType);
    }
  });
});
