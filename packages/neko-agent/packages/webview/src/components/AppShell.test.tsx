import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SettingsState } from '@neko-agent/types';
import { AppShell } from './AppShell';

vi.mock('@/host-runtime-context', () => ({
  useAgentHostRuntimeAdapter: () => ({
    hostKind: 'vscode',
    runtimeId: 'app-shell-test',
    send: vi.fn(),
    subscribe: vi.fn(),
    getState: vi.fn(),
    setState: vi.fn(),
  }),
}));

vi.mock('@/hooks', async () => {
  const actual = await vi.importActual<typeof import('@/hooks')>('@/hooks');
  return {
    ...actual,
    useWebviewKeyboardEditableReporting: vi.fn(),
    useWebviewKeyboardFocusReporting: vi.fn(),
  };
});

vi.mock('@/components/Header', () => ({
  Header: () => <div data-testid="header" />,
}));

vi.mock('@/components/OnboardingFlow', () => ({
  OnboardingFlow: () => <div data-testid="onboarding" />,
}));

vi.mock('./ConversationController', () => ({
  ConversationController: (props: {
    setSettings: React.Dispatch<React.SetStateAction<SettingsState>>;
    setHasConfigSnapshot: React.Dispatch<React.SetStateAction<boolean>>;
    renderHeader: (props: Record<string, never>) => React.ReactNode;
  }) => (
    <div>
      {props.renderHeader({})}
      <button
        type="button"
        data-testid="empty-config"
        onClick={() => {
          props.setHasConfigSnapshot(true);
          props.setSettings((settings) => ({
            ...settings,
            ssoSession: null,
            configuredProviders: [],
          }));
        }}
      />
      <button
        type="button"
        data-testid="configured"
        onClick={() => {
          props.setHasConfigSnapshot(true);
          props.setSettings((settings) => ({
            ...settings,
            configuredProviders: [
              {
                id: 'openai',
                type: 'openai',
                name: 'OpenAI',
                enabled: true,
                requiresApiKey: true,
                apiKey: 'configured',
                models: [],
              },
            ],
          }));
        }}
      />
    </div>
  ),
}));

describe('AppShell onboarding lifecycle', () => {
  it('does not show onboarding before the first config snapshot arrives', () => {
    render(<AppShell />);

    expect(screen.queryByTestId('onboarding')).toBeNull();
  });

  it('shows onboarding after a loaded config snapshot has no AI service', () => {
    render(<AppShell />);

    act(() => {
      screen.getByTestId('empty-config').click();
    });

    expect(screen.getByTestId('onboarding')).toBeTruthy();
  });

  it('dismisses onboarding when a later config snapshot has an AI service', () => {
    render(<AppShell />);

    act(() => {
      screen.getByTestId('empty-config').click();
    });
    act(() => {
      screen.getByTestId('configured').click();
    });

    expect(screen.queryByTestId('onboarding')).toBeNull();
  });
});
