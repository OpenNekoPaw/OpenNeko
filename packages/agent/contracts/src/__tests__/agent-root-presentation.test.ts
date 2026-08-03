import { describe, expect, it } from 'vitest';
import {
  createAgentDraftPresentation,
  createAgentSessionPresentation,
  parseAgentRootPresentation,
} from '../agent-root-presentation';

describe('Agent Root presentation contract', () => {
  it('keeps presentation phase orthogonal to Assistant and Workspace authority', () => {
    expect(
      createAgentDraftPresentation({ kind: 'assistant', assistantSpaceId: 'assistant:1' }),
    ).toEqual({
      schemaVersion: 1,
      kind: 'draft',
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
        schemaVersion: 1,
        kind: 'draft',
        scope: { kind: 'assistant', assistantSpaceId: 'assistant:1' },
        absolutePath: '/Users/private',
      }),
    ).toThrow('unsupported fields');
    expect(() =>
      parseAgentRootPresentation({
        schemaVersion: 1,
        kind: 'draft',
        scope: { kind: 'workspace', workspaceId: 'workspace-1' },
      }),
    ).toThrow('unsupported fields');
    expect(() =>
      parseAgentRootPresentation({
        schemaVersion: 1,
        kind: 'home',
        scope: { kind: 'assistant', assistantSpaceId: 'assistant:1' },
      }),
    ).toThrow("Unknown Agent Root presentation kind 'home'");
  });
});
