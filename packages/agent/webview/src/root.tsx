import { useEffect, useMemo, type ReactElement, type ReactNode } from 'react';
import { AppShell } from './components/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { I18nProvider } from './i18n/I18nContext';
import { i18nService, setLocale } from './i18n';
import { registerDefaultRenderers } from './components/ChatView/RichContent';
import type { SupportedLocale } from '@neko/ui/i18n';
import {
  WebviewFoundationProvider,
  createWebviewFoundation,
  useOptionalWebviewFoundation,
  type WebviewFoundationContextValue,
  type WebviewFoundationThemeKind,
} from '@neko/ui/foundation';
import { AgentHostRuntimeProvider } from './host-runtime-context';
import type { AgentHostRuntimeAdapter } from './messages';
import type { AgentInteractionProjection } from '@neko/agent-contracts';
import {
  ComposerWorkspaceProvider,
  type AgentComposerWorkspacePresentation,
} from './components/ComposerWorkspaceContext';
import './index.css';

registerDefaultRenderers();

export interface AgentWebviewRootProps {
  readonly locale?: SupportedLocale;
  readonly hostRuntimeAdapter: AgentHostRuntimeAdapter;
  readonly foundation?: WebviewFoundationContextValue;
  readonly initialConversation?: { readonly id: string; readonly title: string };
  readonly initialInput?: { readonly id: string; readonly value: string };
  readonly presentation?: 'default' | 'desktop-dock';
  readonly agentPresentation?: AgentInteractionProjection;
  readonly composerWorkspace?: AgentComposerWorkspacePresentation;
  readonly conversationFeed?: {
    readonly conversationId: string;
    readonly content: ReactNode;
  };
}

export function AgentWebviewRoot({
  foundation,
  hostRuntimeAdapter,
  agentPresentation,
  composerWorkspace,
  conversationFeed,
  initialConversation,
  initialInput,
  locale,
  presentation = 'default',
}: AgentWebviewRootProps): ReactElement {
  useEffect(() => {
    if (locale) {
      setLocale(locale);
    }
  }, [locale]);

  return (
    <ErrorBoundary>
      <AgentWebviewFoundationBoundary
        foundation={foundation}
        hostRuntimeAdapter={hostRuntimeAdapter}
        locale={locale}
      >
        <AgentHostRuntimeProvider adapter={hostRuntimeAdapter}>
          <I18nProvider service={i18nService}>
            <ComposerWorkspaceProvider value={composerWorkspace}>
              <AppShell
                agentPresentation={agentPresentation}
                initialConversation={initialConversation}
                initialInput={initialInput}
                presentation={presentation}
                conversationFeed={conversationFeed}
              />
            </ComposerWorkspaceProvider>
          </I18nProvider>
        </AgentHostRuntimeProvider>
      </AgentWebviewFoundationBoundary>
    </ErrorBoundary>
  );
}

export type {
  AgentComposerProjectOption,
  AgentComposerWorkspacePresentation,
  AgentComposerWorkspaceTarget,
} from './components/ComposerWorkspaceContext';

interface AgentWebviewFoundationBoundaryProps {
  readonly foundation?: WebviewFoundationContextValue;
  readonly hostRuntimeAdapter?: AgentHostRuntimeAdapter;
  readonly locale?: SupportedLocale;
  readonly children: ReactNode;
}

function AgentWebviewFoundationBoundary({
  children,
  foundation,
  hostRuntimeAdapter,
  locale,
}: AgentWebviewFoundationBoundaryProps): ReactElement {
  const inheritedFoundation = useOptionalWebviewFoundation();
  const fallbackFoundation = useMemo(
    () =>
      foundation ??
      inheritedFoundation ??
      createAgentWebviewFoundation({
        hostRuntimeAdapter,
        locale: locale ?? i18nService.locale,
      }),
    [foundation, hostRuntimeAdapter, inheritedFoundation, locale],
  );

  if (!foundation && inheritedFoundation) {
    return <>{children}</>;
  }

  return (
    <WebviewFoundationProvider value={fallbackFoundation}>{children}</WebviewFoundationProvider>
  );
}

function createAgentWebviewFoundation(input: {
  readonly hostRuntimeAdapter?: AgentHostRuntimeAdapter;
  readonly locale: SupportedLocale;
}): WebviewFoundationContextValue {
  return createWebviewFoundation({
    hostKind: input.hostRuntimeAdapter?.hostKind ?? 'electron',
    runtimeId: input.hostRuntimeAdapter?.runtimeId ?? 'neko.agent.webview.unconfigured',
    locale: input.locale,
    theme: { kind: detectAgentWebviewThemeKind() },
  });
}

function detectAgentWebviewThemeKind(): WebviewFoundationThemeKind {
  if (typeof document === 'undefined') {
    return 'dark';
  }
  const nekoThemeKind = document.documentElement.getAttribute('data-neko-theme-kind');
  if (nekoThemeKind === 'neko-light') {
    return 'light';
  }
  if (nekoThemeKind === 'neko-high-contrast' || nekoThemeKind === 'neko-high-contrast-light') {
    return 'high-contrast';
  }
  return 'dark';
}
