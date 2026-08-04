import { describe, expect, it } from 'vitest';
import {
  createAgentDraftPresentation,
  createAgentSessionPresentation,
  parseAgentRootPresentation,
} from '../agent-root-presentation';

describe('Agent Root presentation contract', () => {
  it('keeps presentation phase orthogonal to Assistant and Workspace authority', () => {
    expect(
      createAgentDraftPresentation('draft-1', {
        kind: 'assistant',
        assistantSpaceId: 'assistant:1',
      }),
    ).toEqual({
      schemaVersion: 2,
      kind: 'draft',
      draftId: 'draft-1',
      scope: { kind: 'assistant', assistantSpaceId: 'assistant:1' },
    });
    expect(
      createAgentSessionPresentation(
        { kind: 'workspace', workspaceId: 'workspace-1', workspaceGrantId: 'grant-1' },
        'conversation-1',
      ),
    ).toMatchObject({
      kind: 'session',
      conversationId: 'conversation-1',
      scope: { kind: 'workspace', workspaceId: 'workspace-1' },
    });
  });

  it('rejects unknown phases, raw paths and incomplete Workspace authority', () => {
    expect(() =>
      parseAgentRootPresentation({
        schemaVersion: 2,
        kind: 'draft',
        draftId: 'draft-1',
        scope: { kind: 'assistant', assistantSpaceId: 'assistant:1' },
        absolutePath: '/Users/private',
      }),
    ).toThrow('unsupported fields');
    expect(() =>
      parseAgentRootPresentation({
        schemaVersion: 2,
        kind: 'draft',
        draftId: 'draft-1',
        scope: { kind: 'workspace', workspaceId: 'workspace-1' },
      }),
    ).toThrow('unsupported fields');
    expect(() =>
      parseAgentRootPresentation({
        schemaVersion: 2,
        kind: 'home',
        scope: { kind: 'assistant', assistantSpaceId: 'assistant:1' },
      }),
    ).toThrow("Unknown Agent Root presentation kind 'home'");
  });

  it('requires an exact matching identity for an unbound Entry Draft', () => {
    expect(
      createAgentDraftPresentation('draft-1', { kind: 'unbound', draftId: 'draft-1' }),
    ).toMatchObject({ kind: 'draft', draftId: 'draft-1', scope: { kind: 'unbound' } });
    expect(() =>
      createAgentDraftPresentation('draft-1', { kind: 'unbound', draftId: 'draft-2' }),
    ).toThrow('does not match');
    expect(() =>
      parseAgentRootPresentation({
        schemaVersion: 2,
        kind: 'session',
        conversationId: 'conversation-1',
        scope: { kind: 'unbound', draftId: 'draft-1' },
      }),
    ).toThrow('requires a bound authority scope');
  });
});
