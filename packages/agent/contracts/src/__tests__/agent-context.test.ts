import { describe, expect, it } from 'vitest';
import {
  AGENT_RESOLVED_ENTITY_CONTEXT_KIND,
  isAgentResolvedEntityContextData,
} from '../agent-context';
import {
  AGENT_AUTHORIZED_CONTENT_REFERENCE_KIND,
  isAgentAuthorizedContentReferenceContextData,
} from '../message';

describe('Agent resolved Entity context contract', () => {
  const context = {
    kind: AGENT_RESOLVED_ENTITY_CONTEXT_KIND,
    entityRef: { entityId: 'char-xiaoju', entityKind: 'character' },
    entity: {
      entityId: 'char-xiaoju',
      kind: 'character',
      names: { canonical: '小橘', aliases: ['橘子'] },
      lifecycle: { state: 'active' },
      representations: [],
      createdAt: '2026-08-12T00:00:00.000Z',
      updatedAt: '2026-08-12T00:00:00.000Z',
    },
  } as const;

  it('accepts a matching canonical Entity snapshot', () => {
    expect(isAgentResolvedEntityContextData(context)).toBe(true);
  });

  it('rejects an unknown field only for the affected context', () => {
    expect(isAgentResolvedEntityContextData({ ...context, unexpectedField: 1 })).toBe(false);
    expect(isAgentResolvedEntityContextData(context)).toBe(true);
  });

  it('rejects a snapshot whose identity differs from the resolved reference', () => {
    expect(
      isAgentResolvedEntityContextData({
        ...context,
        entity: { ...context.entity, entityId: 'char-other' },
      }),
    ).toBe(false);
  });

  it('rejects a deprecated canonical Entity', () => {
    expect(
      isAgentResolvedEntityContextData({
        ...context,
        entity: {
          ...context.entity,
          lifecycle: { state: 'deprecated', deprecatedAt: '2026-08-12T01:00:00.000Z' },
        },
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

describe('Agent authorized content reference contract', () => {
  const reference = {
    kind: AGENT_AUTHORIZED_CONTENT_REFERENCE_KIND,
    locator: { kind: 'workspace-file', path: 'books/story.epub' },
    mediaType: 'document',
    source: 'workspace',
  } as const;

  it('accepts one exact locator-only content reference', () => {
    expect(isAgentAuthorizedContentReferenceContextData(reference)).toBe(true);
  });

  it('rejects raw paths, extracted bytes and unknown fields locally', () => {
    expect(
      isAgentAuthorizedContentReferenceContextData({
        ...reference,
        rawPath: '/private/books/story.epub',
      }),
    ).toBe(false);
    expect(isAgentAuthorizedContentReferenceContextData(reference)).toBe(true);
  });

  it('rejects invalid locators and media types', () => {
    expect(
      isAgentAuthorizedContentReferenceContextData({
        ...reference,
        locator: { kind: 'workspace-file', path: '../story.epub' },
      }),
    ).toBe(false);
    expect(
      isAgentAuthorizedContentReferenceContextData({ ...reference, mediaType: 'binary' }),
    ).toBe(false);
  });
});
