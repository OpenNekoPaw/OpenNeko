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

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useReportWebviewKeyboardEditable,
  useReportWebviewKeyboardFocus,
  type WebviewKeyboardEditableMessage,
  type WebviewKeyboardFocusMessage,
} from '@neko/ui/keyboard';
import { Header } from '@/components/Header';
import { OnboardingFlow } from '@/components/OnboardingFlow';
import { useConfigState, useResourceState } from '@/hooks';
import { useAgentHostRuntimeAdapter } from '@/host-runtime-context';
import { ConversationController } from './ConversationController';

export function AppShell() {
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRuntimeAdapter = useAgentHostRuntimeAdapter();
  const keyboardReporter = useMemo(
    () => ({
      postMessage(message: WebviewKeyboardFocusMessage | WebviewKeyboardEditableMessage): void {
        hostRuntimeAdapter.send(message);
      },
    }),
    [hostRuntimeAdapter],
  );
  useReportWebviewKeyboardFocus(rootRef, keyboardReporter);
  useReportWebviewKeyboardEditable(keyboardReporter);

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
    if (hasConfigSnapshot && !isAiConfigured) {
      setShowOnboarding(true);
    }
  }, [hasConfigSnapshot, isAiConfigured]);

  // Auto-dismiss onboarding when AI becomes configured
  useEffect(() => {
    if (isAiConfigured && showOnboarding) {
      setShowOnboarding(false);
    }
  }, [isAiConfigured, showOnboarding]);

  return (
    <div
      ref={rootRef}
      className="flex flex-col h-screen bg-[var(--vscode-sideBar-background,var(--vscode-editor-background))] text-[var(--vscode-foreground)]"
    >
      <ConversationController
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
          />
        )}
      />
      {showOnboarding && <OnboardingFlow onComplete={() => setShowOnboarding(false)} />}
    </div>
  );
}
