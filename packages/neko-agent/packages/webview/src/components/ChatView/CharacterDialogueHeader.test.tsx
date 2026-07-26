import { act } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterDialogueSessionProjection } from '@neko-agent/types';
import { I18nProvider } from '@/i18n/I18nContext';
import { i18nService, setLocale } from '@/i18n';
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
    setLocale('zh-cn');
  });

  it('localizes Character Dialogue identity, profile facts, and dispatches exit', async () => {
    renderCharacterDialogueHeader(createSession());

    expect(screen.getByText('小橘')).toBeTruthy();
    expect(screen.getByText('角色扮演')).toBeTruthy();
    expect(screen.getByText('档案较少')).toBeTruthy();
    expect(screen.getByText('protagonist')).toBeTruthy();

    await act(async () => {
      screen.getByRole('button', { name: '角色档案' }).click();
    });
    const profileRegion = screen.getByRole('region', { name: '角色档案' });
    expect(profileRegion.className).toContain('max-h-[45vh]');
    expect(profileRegion.className).toContain('overflow-y-auto');
    expect(screen.getByText('已确认')).toBeTruthy();
    expect(screen.getByText('建议')).toBeTruthy();
    expect(screen.getByText('姓名')).toBeTruthy();
    expect(screen.getByText('出现场景')).toBeTruthy();
    expect(screen.getByText('暂无')).toBeTruthy();
    expect(screen.getByText('对话示例')).toBeTruthy();

    await act(async () => {
      screen.getByRole('button', { name: '退出' }).click();
    });
    expect(exitCharacterDialogueSession).toHaveBeenCalledWith('npc-session-1');
  });
});

function renderCharacterDialogueHeader(session: CharacterDialogueSessionProjection) {
  return render(
    <I18nProvider service={i18nService}>
      <CharacterDialogueHeader session={session} />
    </I18nProvider>,
  );
}

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
          key: 'occurrence.scene',
          value: 'EXT. 猫猫家门口 - 清晨',
          source: 'occurrence-index',
          authority: 'confirmed',
        },
      ],
      dialogueSamples: ['小橘：我会自己确认。'],
      sparsity: 'thin',
    },
    summary: 'protagonist',
    startedAt: '2026-06-01T00:00:00.000Z',
    status: 'active',
  };
}
