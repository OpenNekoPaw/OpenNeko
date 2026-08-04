/**
 * AppShell — Root layout and global state container.
 *
 * Responsibilities:
 *   - Global hooks: useConfigState, useResourceState
 *   - Onboarding overlay lifecycle
 *   - Renders Header + ConversationController + OnboardingFlow
 *
 * Extracted from the former 589-line AIAssistant component (ADR P0.1).
 */

import { useEffect, useState } from 'react';
import { Header } from './Header';
import { OnboardingFlow } from './OnboardingFlow';
import { useConfigState, useResourceState } from '../hooks';
import { ConversationController } from './ConversationController';
import type { AgentRootPresentation } from '@neko/agent-contracts';

export interface AppShellProps {
  readonly initialConversation?: { readonly id: string; readonly title: string };
  readonly initialInput?: { readonly id: string; readonly value: string };
  readonly presentation?: 'default' | 'desktop-dock';
  readonly agentPresentation?: AgentRootPresentation;
}

export function AppShell({
  agentPresentation,
  initialConversation,
  initialInput,
  presentation = 'default',
}: AppShellProps) {
  const config = useConfigState();
  const resource = useResourceState();

  const {
    settings,
    hasConfigSnapshot,
    setSettings,
    setHasConfigSnapshot,
    setProjectFiles,
    mentionItems,
    setMentionItems,
    mentionSearchFilter,
    setMentionSearchFilter,
    pluginCommands,
    setPluginCommands,
    updateSettings,
  } = config;

  const {
    workItemsByConversation,
    setWorkItemsByConversation,
    pluginsAvailable,
    setPluginsAvailable,
  } = resource;

  // Onboarding overlay state
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Auto-show onboarding when no AI service is configured
  const isAiConfigured = !!settings.configuredProviders.find(
    (provider) =>
      provider.enabled !== false &&
      ((provider.models?.length ?? 0) > 0 ||
        !!provider.apiKey ||
        provider.requiresApiKey === false),
  );
  useEffect(() => {
    if (presentation === 'default' && hasConfigSnapshot && !isAiConfigured) {
      setShowOnboarding(true);
    }
  }, [hasConfigSnapshot, isAiConfigured, presentation]);

  // Auto-dismiss onboarding when AI becomes configured
  useEffect(() => {
    if (isAiConfigured && showOnboarding) {
      setShowOnboarding(false);
    }
  }, [isAiConfigured, showOnboarding]);

  return (
    <div
      data-presentation={presentation}
      className="flex flex-col h-screen bg-[var(--neko-sideBar-background,var(--neko-editor-background))] text-[var(--neko-foreground)]"
    >
      <ConversationController
        agentPresentation={agentPresentation}
        emptyStatePresentation={presentation === 'desktop-dock' ? 'desktop-dock' : 'default'}
        initialConversation={initialConversation}
        initialInput={initialInput}
        settings={settings}
        hasConfigSnapshot={hasConfigSnapshot}
        setSettings={setSettings}
        setHasConfigSnapshot={setHasConfigSnapshot}
        setProjectFiles={setProjectFiles}
        mentionItems={mentionItems}
        setMentionItems={setMentionItems}
        mentionSearchFilter={mentionSearchFilter}
        setMentionSearchFilter={setMentionSearchFilter}
        pluginCommands={pluginCommands}
        setPluginCommands={setPluginCommands}
        updateSettings={updateSettings}
        workItemsByConversation={workItemsByConversation}
        setWorkItemsByConversation={setWorkItemsByConversation}
        pluginsAvailable={pluginsAvailable}
        setPluginsAvailable={setPluginsAvailable}
        setShowOnboarding={setShowOnboarding}
        renderHeader={(headerProps) => (
          <Header
            {...headerProps}
            configuredProviders={settings.configuredProviders}
            onOpenOnboarding={() => setShowOnboarding(true)}
            showAccountBar={presentation === 'default'}
            showConversationNavigation={presentation === 'default'}
          />
        )}
      />
      {presentation === 'default' && showOnboarding ? (
        <OnboardingFlow onComplete={() => setShowOnboarding(false)} />
      ) : null}
    </div>
  );
}
