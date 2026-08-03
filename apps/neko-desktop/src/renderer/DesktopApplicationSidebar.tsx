import { useTranslation } from '@neko/ui/i18n/react';
import type { ReactNode } from 'react';

export function DesktopApplicationBrand({
  showMark = true,
}: {
  readonly showMark?: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="home-brand">
      {showMark ? (
        <span className="brand-mark" aria-hidden="true">
          N
        </span>
      ) : null}
      <strong>{t('app.name')}</strong>
    </div>
  );
}

export function DesktopApplicationNavigationButton({
  active,
  disabled = false,
  icon,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly disabled?: boolean;
  readonly icon: ReactNode;
  readonly label: string;
  readonly onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`home-nav-button ${active ? 'is-active' : ''}`}
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
