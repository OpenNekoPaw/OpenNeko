import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ConfiguredProvider } from '@neko-agent/types';
import { useTranslation } from '@/i18n/I18nContext';
import { AgentHostMessages } from '@/messages';
import { EditIcon, FileIcon, SettingsIcon } from '@neko/shared/icons';

interface AccountBarProps {
  configuredProviders: ConfiguredProvider[];
  onOpenOnboarding: () => void;
}

const ACCOUNT_MENU_STYLE: CSSProperties = {
  width: 'max-content',
  minWidth: '196px',
  maxWidth: 'var(--agent-overlay-inline-size)',
};

export function AccountBar({ configuredProviders, onOpenOnboarding }: AccountBarProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const activeProvider = configuredProviders.find(
    (p) =>
      p.enabled !== false &&
      ((p.models?.length ?? 0) > 0 || !!p.apiKey || p.requiresApiKey === false),
  );
  const isConfigured = !!activeProvider;
  const triggerLabel = activeProvider?.name ?? t('accountBar.connectTitle');
  const closeAndOpenConfigFile = () => {
    setOpen(false);
    AgentHostMessages.openConfigFile();
  };
  const closeAndOpenUserConfigFile = () => {
    setOpen(false);
    AgentHostMessages.openUserConfigFile();
  };

  if (!isConfigured) {
    return (
      <button
        type="button"
        onClick={onOpenOnboarding}
        className="agent-warning-chip"
        title={t('accountBar.connectTitle')}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--vscode-charts-yellow)] flex-shrink-0" />
        {t('accountBar.connectCta')}
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`agent-header-action agent-account-trigger ${open ? 'is-active' : ''}`}
        title={triggerLabel}
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="agent-account-status-dot" />
      </button>

      {open && (
        <div
          className="agent-header-menu agent-account-menu absolute right-0 top-full z-50 mt-1.5"
          style={ACCOUNT_MENU_STYLE}
          role="menu"
        >
          <>
            <button
              type="button"
              onClick={closeAndOpenConfigFile}
              className="agent-header-menu-item"
              role="menuitem"
            >
              <EditIcon className="h-3.5 w-3.5 flex-shrink-0 text-[var(--agent-fg-secondary)]" />
              <span className="agent-header-menu-item-label">{t('accountBar.changeKey')}</span>
            </button>
            <button
              type="button"
              onClick={closeAndOpenConfigFile}
              className="agent-header-menu-item"
              role="menuitem"
            >
              <SettingsIcon className="h-3.5 w-3.5 flex-shrink-0 text-[var(--agent-fg-secondary)]" />
              <span className="agent-header-menu-item-label">
                {t('accountBar.modelGenerationConfig')}
              </span>
            </button>
            <button
              type="button"
              onClick={closeAndOpenUserConfigFile}
              className="agent-header-menu-item"
              role="menuitem"
            >
              <FileIcon className="h-3.5 w-3.5 flex-shrink-0 text-[var(--agent-fg-secondary)]" />
              <span className="agent-header-menu-item-label">{t('accountBar.openConfigFile')}</span>
            </button>
          </>
        </div>
      )}
    </div>
  );
}
