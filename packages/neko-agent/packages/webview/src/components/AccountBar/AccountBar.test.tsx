import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfiguredProvider } from '@neko-agent/types';
import { AccountBar } from './index';

const messageMocks = vi.hoisted(() => ({
  openConfigFile: vi.fn(),
  openUserConfigFile: vi.fn(),
}));

const translations: Record<string, string> = {
  'accountBar.connectTitle': 'Connect AI Service',
  'accountBar.connectCta': 'Connect AI',
  'accountBar.changeKey': 'Change API Key',
  'accountBar.modelGenerationConfig': 'Models & Generation',
  'accountBar.openConfigFile': 'Open Config File',
};

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

vi.mock('@/messages', () => ({
  AgentHostMessages: {
    openConfigFile: messageMocks.openConfigFile,
    openUserConfigFile: messageMocks.openUserConfigFile,
  },
  VSCodeMessages: {
    openConfigFile: messageMocks.openConfigFile,
    openUserConfigFile: messageMocks.openUserConfigFile,
  },
}));

describe('AccountBar', () => {
  beforeEach(() => {
    messageMocks.openConfigFile.mockClear();
    messageMocks.openUserConfigFile.mockClear();
  });

  it('renders configured custom-key state as an adaptive header menu', () => {
    render(<AccountBar configuredProviders={[createProvider()]} onOpenOnboarding={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: 'OpenAI' });
    expect(trigger.getAttribute('class')).toContain('agent-account-trigger');
    expect(trigger.getAttribute('class')).toContain('agent-header-action');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.querySelector('.agent-account-status-dot')).toBeTruthy();

    fireEvent.click(trigger);

    const menu = screen.getByRole('menu');
    expect(menu.getAttribute('class')).toContain('agent-account-menu');
    expect(menu.style.width).toBe('max-content');
    expect(menu.style.minWidth).toBe('196px');
    expect(menu.style.maxWidth).toBe('var(--agent-overlay-inline-size)');
    expect(screen.getByRole('menuitem', { name: 'Change API Key' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Models & Generation' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Open Config File' })).toBeTruthy();
    expect(screen.queryByText('OpenAI')).toBeNull();
    expect(screen.queryByText('gpt-5')).toBeNull();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Change API Key' }));
    expect(messageMocks.openConfigFile).toHaveBeenCalledTimes(1);

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Models & Generation' }));
    expect(messageMocks.openConfigFile).toHaveBeenCalledTimes(2);

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open Config File' }));
    expect(messageMocks.openUserConfigFile).toHaveBeenCalledTimes(1);
  });

  it('keeps the unconfigured state as a compact onboarding action', () => {
    const onOpenOnboarding = vi.fn();

    render(<AccountBar configuredProviders={[]} onOpenOnboarding={onOpenOnboarding} />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect AI' }));
    expect(onOpenOnboarding).toHaveBeenCalledTimes(1);
  });
});

function createProvider(): ConfiguredProvider {
  return {
    id: 'openai',
    type: 'openai',
    name: 'OpenAI',
    apiKey: 'sk-test',
    enabled: true,
  };
}
