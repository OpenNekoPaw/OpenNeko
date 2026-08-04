import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AgentRootPresentation, SettingsState } from '@neko/agent-contracts';
import { AppShell } from './AppShell';

vi.mock('./Header', () => ({
  Header: ({
    showAccountBar,
    showConversationNavigation,
  }: {
    readonly showAccountBar?: boolean;
    readonly showConversationNavigation?: boolean;
  }) => (
    <div
      data-testid="header"
      data-show-account-bar={String(showAccountBar)}
      data-show-conversation-navigation={String(showConversationNavigation)}
    />
  ),
}));

vi.mock('./OnboardingFlow', () => ({
  OnboardingFlow: () => <div data-testid="onboarding" />,
}));

vi.mock('./ConversationController', () => ({
  ConversationController: (props: {
    initialConversation?: { readonly id: string; readonly title: string };
    initialInput?: { readonly id: string; readonly value: string };
    emptyStatePresentation?: 'default' | 'desktop-dock';
    agentPresentation?: AgentRootPresentation;
    settings: SettingsState;
    setSettings: React.Dispatch<React.SetStateAction<SettingsState>>;
    setHasConfigSnapshot: React.Dispatch<React.SetStateAction<boolean>>;
    setProjectFiles: unknown;
    mentionItems: readonly unknown[];
    setMentionItems: unknown;
    mentionSearchFilter: string;
    setMentionSearchFilter: unknown;
    pluginCommands: readonly unknown[];
    setPluginCommands: unknown;
    updateSettings: unknown;
    workItemsByConversation: unknown;
    setWorkItemsByConversation: unknown;
    pluginsAvailable: unknown;
    setPluginsAvailable: unknown;
    setShowOnboarding: unknown;
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
      <span data-testid="agent-presentation">
        {props.agentPresentation
          ? `${props.agentPresentation.kind}:${props.agentPresentation.scope.kind}`
          : 'none'}
      </span>
      <span
        data-testid="controller-capability-wiring"
        data-config={String(Boolean(props.settings))}
        data-files={String(typeof props.setProjectFiles === 'function')}
        data-mentions={String(
          Array.isArray(props.mentionItems) &&
            typeof props.setMentionItems === 'function' &&
            typeof props.setMentionSearchFilter === 'function',
        )}
        data-commands={String(
          Array.isArray(props.pluginCommands) && typeof props.setPluginCommands === 'function',
        )}
        data-settings={String(typeof props.updateSettings === 'function')}
        data-work-items={String(
          Boolean(props.workItemsByConversation) &&
            typeof props.setWorkItemsByConversation === 'function',
        )}
        data-plugins={String(
          Boolean(props.pluginsAvailable) && typeof props.setPluginsAvailable === 'function',
        )}
        data-onboarding={String(typeof props.setShowOnboarding === 'function')}
      >
        {props.mentionSearchFilter}
      </span>
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
    expect(screen.getByTestId('header').getAttribute('data-show-conversation-navigation')).toBe(
      'false',
    );
    expect(screen.getByTestId('empty-state-presentation').textContent).toBe('desktop-dock');
    expect(
      screen
        .getByTestId('header')
        .closest('[data-presentation]')
        ?.getAttribute('data-presentation'),
    ).toBe('desktop-dock');
  });

  it('keeps package-owned conversation navigation in standalone presentation', () => {
    render(<AppShell />);

    expect(screen.getByTestId('header').getAttribute('data-show-account-bar')).toBe('true');
    expect(screen.getByTestId('header').getAttribute('data-show-conversation-navigation')).toBe(
      'true',
    );
  });

  it('preserves the complete Workspace controller wiring in Desktop dock presentation', () => {
    render(
      <AppShell
        initialConversation={{ id: 'conversation-1', title: 'Workspace session' }}
        presentation="desktop-dock"
      />,
    );

    expect(screen.getByTestId('header')).toBeTruthy();
    expect(screen.getByTestId('initial-conversation').textContent).toBe(
      'conversation-1:Workspace session',
    );
    const wiring = screen.getByTestId('controller-capability-wiring');
    for (const attribute of [
      'data-config',
      'data-files',
      'data-mentions',
      'data-commands',
      'data-settings',
      'data-work-items',
      'data-plugins',
      'data-onboarding',
    ]) {
      expect(wiring.getAttribute(attribute)).toBe('true');
    }
  });

  it('forwards draft presentation without replacing the complete controller wiring', () => {
    render(
      <AppShell
        agentPresentation={{
          schemaVersion: 2,
          kind: 'draft',
          draftId: 'draft-1',
          scope: { kind: 'assistant', assistantSpaceId: 'assistant:1' },
        }}
        presentation="desktop-dock"
      />,
    );

    expect(screen.getByTestId('agent-presentation').textContent).toBe('draft:assistant');
    const wiring = screen.getByTestId('controller-capability-wiring');
    expect(wiring.getAttribute('data-config')).toBe('true');
    expect(wiring.getAttribute('data-files')).toBe('true');
    expect(wiring.getAttribute('data-commands')).toBe('true');
    expect(wiring.getAttribute('data-plugins')).toBe('true');
  });
});
