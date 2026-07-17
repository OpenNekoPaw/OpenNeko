import { act } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterDialogueSessionProjection } from '@neko-agent/types';
import { CharacterDialogueHeader } from './CharacterDialogueHeader';

const exitCharacterDialogueSession = vi.fn();

vi.mock('@/messages', () => ({
  AgentHostMessages: {
    exitCharacterDialogueSession: (...args: unknown[]) => exitCharacterDialogueSession(...args),
  },
  VSCodeMessages: {
    exitCharacterDialogueSession: (...args: unknown[]) => exitCharacterDialogueSession(...args),
  },
}));

describe('CharacterDialogueHeader', () => {
  beforeEach(() => {
    exitCharacterDialogueSession.mockClear();
  });

  it('renders Character Dialogue identity, profile facts, and dispatches exit', async () => {
    render(<CharacterDialogueHeader session={createSession()} />);

    expect(screen.getByText('小橘')).toBeTruthy();
    expect(screen.getByText('roleplay')).toBeTruthy();
    expect(screen.getByText('partial')).toBeTruthy();
    expect(screen.getByText('protagonist')).toBeTruthy();

    await act(async () => {
      screen.getByRole('button', { name: 'Profile' }).click();
    });
    expect(screen.getByText('identity.name')).toBeTruthy();
    expect(screen.getByText('speech.catchphrase')).toBeTruthy();

    await act(async () => {
      screen.getByRole('button', { name: 'Exit' }).click();
    });
    expect(exitCharacterDialogueSession).toHaveBeenCalledWith('npc-session-1');
  });
});

function createSession(): CharacterDialogueSessionProjection {
  return {
    sessionId: 'npc-session-1',
    entityId: 'char-xiaoju',
    displayName: '小橘',
    mode: 'roleplay',
    profile: {
      entityRef: { entityId: 'char-xiaoju', entityKind: 'character' },
      displayName: '小橘',
      aliases: ['Xiaoju'],
      facts: [
        {
          key: 'identity.name',
          value: '小橘',
          source: 'registry',
          authority: 'confirmed',
        },
        {
          key: 'speech.catchphrase',
          value: '我先看看',
          source: 'agent-inferred',
          authority: 'suggested',
        },
      ],
      dialogueSamples: ['小橘：我会自己确认。'],
      sparsity: 'partial',
    },
    summary: 'protagonist',
    startedAt: '2026-06-01T00:00:00.000Z',
    status: 'active',
  };
}
