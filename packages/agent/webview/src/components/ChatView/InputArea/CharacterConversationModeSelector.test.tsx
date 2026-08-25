import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentPresentationI18nProvider } from '../../../i18n/I18nContext';
import { CharacterConversationModeSelector } from './CharacterConversationModeSelector';

describe('CharacterConversationModeSelector', () => {
  it('renders complete Simplified Chinese mode copy without exposing translation keys', () => {
    const view = render(
      <AgentPresentationI18nProvider locale="zh-cn">
        <CharacterConversationModeSelector mode="companion" onChange={vi.fn()} />
      </AgentPresentationI18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '对话模式: 日常' }));

    expect(screen.getByRole('menu', { name: '对话模式' })).toBeTruthy();
    expect(screen.getByText('延续日常关系，并可使用标准 Agent 能力。')).toBeTruthy();
    expect(screen.getByText('在选定的作者叙事情境和知识边界内进行角色扮演。')).toBeTruthy();
    expect(view.container.textContent).not.toContain('chat.entryExperience.characterDialogue');
  });

  it('renders complete English mode copy and submits the exact selected mode', () => {
    const onChange = vi.fn();
    render(
      <AgentPresentationI18nProvider locale="en">
        <CharacterConversationModeSelector mode="companion" onChange={onChange} />
      </AgentPresentationI18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Conversation mode: Companion' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Narrative/u }));

    expect(onChange).toHaveBeenCalledWith('narrative');
  });
});
