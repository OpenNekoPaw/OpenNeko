import { useTranslation } from '@neko/ui/i18n/react';
import type { ReactNode } from 'react';

export function DesktopApplicationBrand({
  showMark = true,
  titleAction,
}: {
  readonly showMark?: boolean;
  readonly titleAction?: {
    readonly disabled?: boolean;
    readonly label: string;
    readonly onClick: () => void;
  };
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="home-brand">
      {titleAction ? (
        <button
          type="button"
          className="home-brand-title"
          aria-label={titleAction.label}
          disabled={titleAction.disabled}
          onClick={titleAction.onClick}
        >
          {showMark ? (
            <span className="brand-mark" aria-hidden="true">
              N
            </span>
          ) : null}
          <strong>{t('app.name')}</strong>
        </button>
      ) : (
        <>
          {showMark ? (
            <span className="brand-mark" aria-hidden="true">
              N
            </span>
          ) : null}
          <strong>{t('app.name')}</strong>
        </>
      )}
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
