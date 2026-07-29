import { useEffect, useLayoutEffect, useMemo, type ReactElement, type ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { I18nProvider } from '@/i18n/I18nContext';
import { i18nService, setLocale } from '@/i18n';
import { registerDefaultRenderers } from '@/components/ChatView/RichContent';
import type { SupportedLocale } from '@neko/shared';
import {
  WebviewFoundationProvider,
  createWebviewFoundation,
  useOptionalWebviewFoundation,
  type WebviewFoundationContextValue,
  type WebviewFoundationThemeKind,
} from '@neko/ui/foundation';
import { NEKO_AGENT_HOST_MESSAGE_EVENT } from '@neko-agent/types/host-message-event';
import { AgentHostRuntimeProvider } from './host-runtime-context';
import type { AgentHostRuntimeAdapter } from './messages';
import { setAgentHostRuntimeAdapter } from './messages';
import '@/index.css';

registerDefaultRenderers();

export interface AgentWebviewRootProps {
  readonly locale?: SupportedLocale;
  readonly hostRuntimeAdapter?: AgentHostRuntimeAdapter;
  readonly foundation?: WebviewFoundationContextValue;
}

export function AgentWebviewRoot({
  foundation,
  hostRuntimeAdapter,
  locale,
}: AgentWebviewRootProps): ReactElement {
  useLayoutEffect(() => {
    if (!hostRuntimeAdapter) {
      return undefined;
    }
    const subscription = setAgentHostRuntimeAdapter(hostRuntimeAdapter);
    return () => {
      subscription.dispose();
    };
  }, [hostRuntimeAdapter]);

  useEffect(() => {
    if (!hostRuntimeAdapter) {
      return undefined;
    }
    const subscription = hostRuntimeAdapter.subscribe((message) => {
      window.dispatchEvent(new CustomEvent(NEKO_AGENT_HOST_MESSAGE_EVENT, { detail: message }));
    });
    return () => {
      subscription.dispose();
    };
  }, [hostRuntimeAdapter]);

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
            <AppShell />
          </I18nProvider>
        </AgentHostRuntimeProvider>
      </AgentWebviewFoundationBoundary>
    </ErrorBoundary>
  );
}

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
    hostKind: input.hostRuntimeAdapter?.hostKind ?? 'vscode',
    runtimeId: input.hostRuntimeAdapter?.runtimeId ?? 'neko.agent.webview.vscode',
    locale: input.locale,
    theme: { kind: detectAgentWebviewThemeKind() },
  });
}

function detectAgentWebviewThemeKind(): WebviewFoundationThemeKind {
  if (typeof document === 'undefined') {
    return 'dark';
  }
  const vscodeThemeKind = document.documentElement.getAttribute('data-vscode-theme-kind');
  if (vscodeThemeKind === 'vscode-light') {
    return 'light';
  }
  if (
    vscodeThemeKind === 'vscode-high-contrast' ||
    vscodeThemeKind === 'vscode-high-contrast-light'
  ) {
    return 'high-contrast';
  }
  return 'dark';
}
