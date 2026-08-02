import { describe, expect, it } from 'vitest';
import {
  AGENT_RESOLVED_ENTITY_CONTEXT_KIND,
  AGENT_RESOLVED_ENTITY_CONTEXT_SCHEMA_VERSION,
  isAgentResolvedEntityContextData,
} from '../agent-context';

describe('Agent resolved Entity context contract', () => {
  const context = {
    schemaVersion: AGENT_RESOLVED_ENTITY_CONTEXT_SCHEMA_VERSION,
    kind: AGENT_RESOLVED_ENTITY_CONTEXT_KIND,
    entityRef: { entityId: 'char-xiaoju', entityKind: 'character' },
    entity: {
      id: 'char-xiaoju',
      kind: 'character',
      canonicalName: '小橘',
      aliases: ['橘子'],
      status: 'confirmed',
      metadata: { role: '侦探' },
    },
  } as const;

  it('accepts a matching canonical Entity snapshot', () => {
    expect(isAgentResolvedEntityContextData(context)).toBe(true);
  });

  it('rejects a snapshot whose identity differs from the resolved reference', () => {
    expect(
      isAgentResolvedEntityContextData({
        ...context,
        entity: { ...context.entity, id: 'char-other' },
      }),
    ).toBe(false);
  });

  it('rejects a canonical Entity that is not confirmed', () => {
    expect(
      isAgentResolvedEntityContextData({
        ...context,
        entity: { ...context.entity, status: 'candidate' },
      }),
    ).toBe(false);
  });

  it('rejects unresolved mention navigation data', () => {
    expect(
      isAgentResolvedEntityContextData({
        type: 'entity',
        navigationData: { sourceId: 'char-xiaoju', sourceKind: 'character' },
      }),
    ).toBe(false);
  });
});
