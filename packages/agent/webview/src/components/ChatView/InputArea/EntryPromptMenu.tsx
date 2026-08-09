import type { MentionItem } from './types';
import { useClickOutsideSingle } from './useClickOutside';
import { useTranslation } from '../../../i18n/I18nContext';
import { useRef } from 'react';
import { RoleplayEntityList } from '../RoleplayEntityList';

interface EntryPromptMenuProps {
  isOpen: boolean;
  readonly mentionItems: readonly MentionItem[];
  readonly onSelectRoleplayEntity: (item: MentionItem) => void;
  readonly onClose: () => void;
}

export function EntryPromptMenu({
  isOpen,
  mentionItems,
  onSelectRoleplayEntity,
  onClose,
}: EntryPromptMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutsideSingle(menuRef, onClose);
  if (!isOpen) return null;
  return (
    <div
      ref={menuRef}
      className="agent-composer-popover agent-composer-entry-prompt-menu"
      role="menu"
    >
      <div className="agent-composer-popover-scroll">
        <div className="agent-composer-popover-hint">{t('chat.entryPrompt.roleplay.hint')}</div>
        <div className="agent-composer-popover-section">
          {t('chat.entryPrompt.roleplay.section')}
        </div>
        <RoleplayEntityList
          items={mentionItems}
          surface="composer"
          onSelect={onSelectRoleplayEntity}
        />
      </div>
    </div>
  );
}
