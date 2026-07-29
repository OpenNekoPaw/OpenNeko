import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';

const translations: Record<string, string> = {
  'chat.emptyState.title': 'OpenNeko Creative Assistant',
  'chat.emptyState.description':
    'Start from an idea, reference, or character and develop story themes, relationships, worlds, and scene atmosphere with the Agent. Then continue into character images, scene references, video material, voice, sound effects, and ambience.',
  'chat.emptyState.disclaimer': 'AI responses may be inaccurate.',
  'chat.emptyState.entry.startChat': 'Start Chat',
  'chat.emptyState.entry.generateAssets': 'Generate Assets',
  'chat.emptyState.entry.roleplay': 'Roleplay',
  'chat.emptyState.entry.startChatHelper': 'Chat helper',
  'chat.emptyState.entry.generateAssetsHelper': 'Asset helper',
  'chat.emptyState.entry.roleplayHelper': 'Roleplay helper',
};

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

describe('EmptyState', () => {
  it('renders the compact assistant entry points', () => {
    render(<EmptyState />);

    expect(screen.getByRole('heading', { name: 'OpenNeko Creative Assistant' })).toBeTruthy();
    expect(
      screen.getByText(
        'Start from an idea, reference, or character and develop story themes, relationships, worlds, and scene atmosphere with the Agent. Then continue into character images, scene references, video material, voice, sound effects, and ambience.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /Start Chat/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Generate Assets/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Roleplay/ })).toBeTruthy();
    expect(screen.queryByText(/script|storyboard|shot description/i)).toBeNull();
    expect(document.querySelector('.agent-empty-state')).toBeTruthy();
    expect(document.querySelector('.agent-empty-state')?.className).toContain('items-center');
    expect(document.querySelector('.agent-empty-panel')?.className).toContain(
      'max-w-[min(920px,100%)]',
    );
    expect(document.querySelector('.agent-empty-panel')?.className).toContain('min-w-0');
    expect(document.querySelector('.agent-empty-copy')?.className).toContain('max-w-full');
    expect(document.querySelector('.agent-empty-actions')?.className).toContain('grid-cols-1');
    expect(document.querySelector('.agent-empty-actions')?.className).not.toContain(
      'sm:grid-cols-3',
    );
    expect(document.querySelectorAll('.agent-empty-action')).toHaveLength(3);
    expect(document.querySelector('.agent-empty-action')?.className).toContain('min-w-0');
    expect(document.querySelector('.agent-empty-action')?.className).toContain('justify-center');
    expect(document.querySelector('.agent-empty-action')?.className).toContain('text-center');
    expect(document.querySelector('.agent-empty-action')?.className).not.toContain('text-left');
    expect(screen.getByText('Chat helper')).toBeTruthy();
  });

  it('passes the selected entry action to the handler', () => {
    const onEntryAction = vi.fn();
    render(<EmptyState onEntryAction={onEntryAction} />);

    fireEvent.click(screen.getByRole('button', { name: /Generate Assets/ }));

    expect(onEntryAction).toHaveBeenCalledWith('generate-assets');
  });

  it('renders the selected entry helper', () => {
    render(<EmptyState selectedAction="roleplay" />);

    expect(screen.getByText('Roleplay helper')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Roleplay/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
});
