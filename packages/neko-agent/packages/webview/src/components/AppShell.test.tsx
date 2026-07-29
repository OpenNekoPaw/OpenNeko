import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsState } from '@neko-agent/types';
import type {
  WebviewKeyboardEditableReporter,
  WebviewKeyboardFocusReporter,
} from '@neko/ui/keyboard';
import { AppShell } from './AppShell';

const hostRuntimeMocks = vi.hoisted(() => ({
  hostKind: 'vscode' as 'electron' | 'vscode',
  send: vi.fn(),
}));
const keyboardMocks = vi.hoisted(() => ({
  useReportWebviewKeyboardEditable: vi.fn<(reporter: WebviewKeyboardEditableReporter) => void>(),
  useReportWebviewKeyboardFocus:
    vi.fn<(rootRef: unknown, reporter: WebviewKeyboardFocusReporter) => void>(),
}));

vi.mock('@/host-runtime-context', () => ({
  useAgentHostRuntimeAdapter: () => ({
    hostKind: hostRuntimeMocks.hostKind,
    runtimeId: 'app-shell-test',
    send: hostRuntimeMocks.send,
    subscribe: vi.fn(),
    getState: vi.fn(),
    setState: vi.fn(),
  }),
}));

vi.mock('@neko/ui/keyboard', async () => {
  const actual = await vi.importActual<typeof import('@neko/ui/keyboard')>('@neko/ui/keyboard');
  return {
    ...actual,
    ...keyboardMocks,
  };
});

vi.mock('@/components/Header', () => ({
  Header: ({ showAccountBar }: { readonly showAccountBar?: boolean }) => (
    <div data-testid="header" data-show-account-bar={String(showAccountBar)} />
  ),
}));

vi.mock('@/components/OnboardingFlow', () => ({
  OnboardingFlow: () => <div data-testid="onboarding" />,
}));

vi.mock('./ConversationController', () => ({
  ConversationController: (props: {
    initialConversation?: { readonly id: string; readonly title: string };
    initialInput?: { readonly id: string; readonly value: string };
    emptyStatePresentation?: 'default' | 'desktop-dock';
    setSettings: React.Dispatch<React.SetStateAction<SettingsState>>;
    setHasConfigSnapshot: React.Dispatch<React.SetStateAction<boolean>>;
    renderHeader: (props: Record<string, never>) => React.ReactNode;
  }) => (
    <div>
      <span data-testid="initial-conversation">
        {props.initialConversation
          ? `${props.initialConversation.id}:${props.initialConversation.title}`
          : 'none'}
      </span>
      <span data-testid="empty-state-presentation">{props.emptyStatePresentation}</span>
      <span data-testid="initial-input">{props.initialInput?.value ?? 'none'}</span>
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
  beforeEach(() => {
    hostRuntimeMocks.hostKind = 'vscode';
    hostRuntimeMocks.send.mockClear();
    keyboardMocks.useReportWebviewKeyboardEditable.mockClear();
    keyboardMocks.useReportWebviewKeyboardFocus.mockClear();
  });

  it('passes an explicit host navigation target to the conversation owner', () => {
    render(<AppShell initialConversation={{ id: 'conversation-1', title: 'Conversation one' }} />);

    expect(screen.getByTestId('initial-conversation').textContent).toBe(
      'conversation-1:Conversation one',
    );
  });

  it('passes a Desktop creation handoff to the conversation owner', () => {
    render(<AppShell initialInput={{ id: 'handoff-1', value: 'Create a storyboard' }} />);

    expect(screen.getByTestId('initial-input').textContent).toBe('Create a storyboard');
  });

  it('routes shared keyboard reports through the Agent host runtime adapter', () => {
    render(<AppShell />);

    const focusReporter = keyboardMocks.useReportWebviewKeyboardFocus.mock.calls.at(-1)?.[1];
    const editableReporter = keyboardMocks.useReportWebviewKeyboardEditable.mock.calls.at(-1)?.[0];

    expect(focusReporter).toBeDefined();
    expect(editableReporter).toBe(focusReporter);

    focusReporter?.postMessage({ type: 'webviewKeyboardFocus', focused: true });
    editableReporter?.postMessage({ type: 'webviewKeyboardEditable', editable: true });

    expect(hostRuntimeMocks.send).toHaveBeenNthCalledWith(1, {
      type: 'webviewKeyboardFocus',
      focused: true,
    });
    expect(hostRuntimeMocks.send).toHaveBeenNthCalledWith(2, {
      type: 'webviewKeyboardEditable',
      editable: true,
    });
  });

  it('does not register VS Code keyboard bridge reporters for Electron', () => {
    hostRuntimeMocks.hostKind = 'electron';

    render(<AppShell />);

    expect(keyboardMocks.useReportWebviewKeyboardFocus.mock.calls.at(-1)?.[1]).toBeNull();
    expect(keyboardMocks.useReportWebviewKeyboardEditable.mock.calls.at(-1)?.[0]).toBeNull();
    expect(hostRuntimeMocks.send).not.toHaveBeenCalled();
  });

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

  it('keeps configuration and onboarding outside the Desktop dock presentation', () => {
    render(<AppShell presentation="desktop-dock" />);

    act(() => {
      screen.getByTestId('empty-config').click();
    });

    expect(screen.queryByTestId('onboarding')).toBeNull();
    expect(screen.getByTestId('header').getAttribute('data-show-account-bar')).toBe('false');
    expect(screen.getByTestId('empty-state-presentation').textContent).toBe('desktop-dock');
    expect(
      screen
        .getByTestId('header')
        .closest('[data-presentation]')
        ?.getAttribute('data-presentation'),
    ).toBe('desktop-dock');
  });
});
