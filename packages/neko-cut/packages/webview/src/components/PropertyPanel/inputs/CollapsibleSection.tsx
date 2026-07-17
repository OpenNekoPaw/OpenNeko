import { memo, useState } from 'react';
import { useTranslation } from '../../../i18n/I18nContext';

export interface CollapsibleSectionProps {
  titleKey: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export const CollapsibleSection = memo(function CollapsibleSection({
  titleKey,
  children,
  defaultExpanded = true,
}: CollapsibleSectionProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="nk-prop-group">
      <button className="nk-prop-group-header" onClick={() => setExpanded(!expanded)}>
        <span className={`nk-prop-group-chevron ${expanded ? 'expanded' : ''}`}>▶</span>
        <span className="nk-prop-group-title">{t(titleKey)}</span>
      </button>
      {expanded && <div className="nk-prop-group-body">{children}</div>}
    </div>
  );
});
