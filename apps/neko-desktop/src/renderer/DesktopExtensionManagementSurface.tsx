import type { AgentExtensionManagementRuntime } from '@neko/agent-contracts/extension-management';
import type { ProfessionalApplicationManagementRuntime } from '@neko/professional-apps-contracts';
import { BotIcon, CodeIcon, PackageIcon } from '@neko/ui';
import { useTranslation } from '@neko/ui/i18n/react';
import { lazy, Suspense, useState } from 'react';

const AgentExtensionManagementRoot = lazy(async () => {
  const module = await import('@neko/agent-webview/extension-management/root');
  return { default: module.AgentExtensionManagementRoot };
});

const ProfessionalApplicationManagementRoot = lazy(async () => {
  const module = await import('@neko/professional-apps-webview/root');
  return { default: module.ProfessionalApplicationManagementRoot };
});

type CapabilityIntegrationTab = 'skills' | 'mcp' | 'professional-applications';

export function DesktopExtensionManagementSurface({
  interactive,
  extensionRuntime,
  professionalApplicationRuntime,
}: {
  readonly interactive: boolean;
  readonly extensionRuntime: AgentExtensionManagementRuntime;
  readonly professionalApplicationRuntime: ProfessionalApplicationManagementRuntime;
}): JSX.Element {
  const { t } = useTranslation();
  const [tab, setTab] = useState<CapabilityIntegrationTab>('skills');
  const modeSwitcher = (
    <div
      aria-label={t('professionalApps.managementTabs')}
      className="extension-management-mode-switcher"
      role="tablist"
    >
      <button
        aria-selected={tab === 'skills'}
        data-capability-integration-tab="skills"
        onClick={() => setTab('skills')}
        role="tab"
        type="button"
      >
        <CodeIcon size={18} />
        {t('home.capabilities.skills')}
      </button>
      <button
        aria-selected={tab === 'mcp'}
        data-capability-integration-tab="mcp"
        onClick={() => setTab('mcp')}
        role="tab"
        type="button"
      >
        <BotIcon size={18} />
        MCP
      </button>
      <button
        aria-selected={tab === 'professional-applications'}
        data-capability-integration-tab="professional-applications"
        onClick={() => setTab('professional-applications')}
        role="tab"
        type="button"
      >
        <PackageIcon size={18} />
        {t('professionalApps.tab')}
      </button>
    </div>
  );
  return (
    <Suspense fallback={null}>
      <div className="desktop-extension-management-composition">
        {modeSwitcher}
        {tab === 'professional-applications' ? (
          <ProfessionalApplicationManagementRoot
            compactHeading
            interactive={interactive}
            runtime={professionalApplicationRuntime}
          />
        ) : (
          <AgentExtensionManagementRoot
            compactHeading
            interactive={interactive}
            runtime={extensionRuntime}
            selectedTab={tab}
            showTabControls={false}
          />
        )}
      </div>
    </Suspense>
  );
}
