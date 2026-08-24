import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { SupportedLocale } from '@neko/ui/i18n';
import { createWebviewI18n } from '@neko/ui/i18n/webview';
import type { II18nService } from '@neko/ui/i18n';

import { agentPresentationMessages } from './presentation-messages';

const services = {
  en: createAgentPresentationService('en'),
  'zh-cn': createAgentPresentationService('zh-cn'),
} as const;

interface AgentI18nContextValue {
  readonly locale: SupportedLocale;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
}

const AgentI18nContext = createContext<AgentI18nContextValue | undefined>(undefined);

export function I18nProvider({
  children,
  service,
}: {
  readonly children: ReactNode;
  readonly service: II18nService;
}): JSX.Element {
  const [observedLocale, setObservedLocale] = useState<SupportedLocale>(service.locale);
  useEffect(() => {
    setObservedLocale(service.locale);
    service.onLocaleChange(setObservedLocale);
  }, [service]);
  const locale = observedLocale === service.locale ? observedLocale : service.locale;
  return (
    <AgentI18nContext.Provider value={{ locale, t: (key, params) => service.t(key, params) }}>
      {children}
    </AgentI18nContext.Provider>
  );
}

export function AgentPresentationI18nProvider({
  children,
  locale,
}: {
  readonly children: ReactNode;
  readonly locale: SupportedLocale;
}): JSX.Element {
  return <I18nProvider service={services[locale]}>{children}</I18nProvider>;
}

export function useTranslation(): AgentI18nContextValue {
  const context = useContext(AgentI18nContext);
  if (!context) throw new Error('Agent presentation i18n provider is missing.');
  return context;
}

function createAgentPresentationService(locale: SupportedLocale) {
  return createWebviewI18n({
    initialLocale: locale,
    bundles: {
      en: { agent: agentPresentationMessages.en },
      'zh-cn': { agent: agentPresentationMessages['zh-cn'] },
    },
  }).i18nService;
}
