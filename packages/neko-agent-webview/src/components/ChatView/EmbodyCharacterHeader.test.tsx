import { act } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmbodyCharacterSessionProjection } from '@neko-agent/contracts';
import { I18nProvider } from '../../i18n/I18nContext';
import { i18nService, setLocale } from '../../i18n';
import { EmbodyCharacterHeader } from './EmbodyCharacterHeader';

const exitEmbodyCharacterSession = vi.fn();

vi.mock('../../messages', () => ({
  AgentHostMessages: {
    exitEmbodyCharacterSession: (...args: unknown[]) => exitEmbodyCharacterSession(...args),
  },
}));

describe('EmbodyCharacterHeader', () => {
  beforeEach(() => {
    exitEmbodyCharacterSession.mockClear();
    setLocale('zh-cn');
  });

  it('localizes Embody Character identity, scope, status, and dispatches exit', async () => {
    renderEmbodyCharacterHeader(createSession());

    expect(screen.getByText('小橘')).toBeTruthy();
    expect(screen.getByText('扮演角色')).toBeTruthy();
    expect(screen.getByText('进行中')).toBeTruthy();
    expect(screen.getByText('范围：occurrence: rooftop scene cases/test.fountain:8')).toBeTruthy();
    expect(screen.getByText('备注：Check knowledge boundary.')).toBeTruthy();
    expect(screen.getByText('你扮演该角色，Agent 根据项目知识提供反馈。')).toBeTruthy();

    await act(async () => {
      screen.getByRole('button', { name: '退出' }).click();
    });
    expect(exitEmbodyCharacterSession).toHaveBeenCalledWith('embody-session-1');
  });

  it('does not render exit action after the session is exited', () => {
    renderEmbodyCharacterHeader({ ...createSession(), status: 'exited' });

    expect(screen.queryByRole('button', { name: '退出' })).toBeNull();
    expect(screen.getByText('已退出')).toBeTruthy();
  });
});

function renderEmbodyCharacterHeader(session: EmbodyCharacterSessionProjection) {
  return render(
    <I18nProvider service={i18nService}>
      <EmbodyCharacterHeader session={session} />
    </I18nProvider>,
  );
}

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
    source: 'fountain-content',
    projectRoot: '/workspace/project-a',
    scopeSummary: ['occurrence: rooftop scene cases/test.fountain:8'],
    prompt: 'Check knowledge boundary.',
    summary: 'protagonist',
    startedAt: '2026-06-02T00:00:00.000Z',
    status: 'active',
  };
}
