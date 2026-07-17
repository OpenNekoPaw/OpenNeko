import { act } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmbodyCharacterSessionProjection } from '@neko-agent/types';
import { EmbodyCharacterHeader } from './EmbodyCharacterHeader';

const exitEmbodyCharacterSession = vi.fn();

vi.mock('@/messages', () => ({
  AgentHostMessages: {
    exitEmbodyCharacterSession: (...args: unknown[]) => exitEmbodyCharacterSession(...args),
  },
  VSCodeMessages: {
    exitEmbodyCharacterSession: (...args: unknown[]) => exitEmbodyCharacterSession(...args),
  },
}));

describe('EmbodyCharacterHeader', () => {
  beforeEach(() => {
    exitEmbodyCharacterSession.mockClear();
  });

  it('renders Embody Character identity, scope, status, and dispatches exit', async () => {
    render(<EmbodyCharacterHeader session={createSession()} />);

    expect(screen.getByText('小橘')).toBeTruthy();
    expect(screen.getByText('embody')).toBeTruthy();
    expect(screen.getByText('active')).toBeTruthy();
    expect(screen.getByText('Scope: occurrence: rooftop scene cases/test.fountain:8')).toBeTruthy();
    expect(screen.getByText('Note: Check knowledge boundary.')).toBeTruthy();
    expect(
      screen.getByText('User plays the character; Agent gives project knowledge feedback.'),
    ).toBeTruthy();

    await act(async () => {
      screen.getByRole('button', { name: 'Exit' }).click();
    });
    expect(exitEmbodyCharacterSession).toHaveBeenCalledWith('embody-session-1');
  });

  it('does not render exit action after the session is exited', () => {
    render(<EmbodyCharacterHeader session={{ ...createSession(), status: 'exited' }} />);

    expect(screen.queryByRole('button', { name: 'Exit' })).toBeNull();
    expect(screen.getByText('exited')).toBeTruthy();
  });
});

function createSession(): EmbodyCharacterSessionProjection {
  return {
    sessionId: 'embody-session-1',
    entityId: 'char-xiaoju',
    displayName: '小橘',
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
      ],
      sparsity: 'partial',
    },
    source: 'neko-story',
    projectRoot: '/workspace/project-a',
    scopeSummary: ['occurrence: rooftop scene cases/test.fountain:8'],
    prompt: 'Check knowledge boundary.',
    summary: 'protagonist',
    startedAt: '2026-06-02T00:00:00.000Z',
    status: 'active',
  };
}
