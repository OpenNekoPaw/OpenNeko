import { useEffect, useRef, useState } from 'react';
import { MannequinIcon } from '@neko/ui/icons';
import { RoleplayEntityList } from '../ChatView/RoleplayEntityList';
import type { MentionItem } from '../ChatView/InputArea/types';
import { useTranslation } from '../../i18n/I18nContext';

interface RoleplayMenuProps {
  items: readonly MentionItem[];
  onRequestItems: () => void;
  onSelectItem: (item: MentionItem) => void;
}

export function RoleplayMenu({ items, onRequestItems, onSelectItem }: RoleplayMenuProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        event.target instanceof Node &&
        !menuRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const toggleMenu = () => {
    setIsOpen((current) => {
      if (!current) onRequestItems();
      return !current;
    });
  };

  const closeMenu = () => setIsOpen(false);

  return (
    <div className="relative" ref={menuRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleMenu}
        className={`agent-header-action agent-header-action-roleplay${isOpen ? ' is-active' : ''}`}
        title={t('header.roleplay')}
        aria-label={t('header.roleplay')}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <MannequinIcon className="w-4 h-4" />
      </button>

      {isOpen ? (
        <div
          className="agent-header-menu agent-roleplay-menu absolute right-0 top-full z-50 mt-1"
          role="menu"
          aria-label={t('header.roleplay')}
        >
          <div className="agent-roleplay-menu-hint">{t('header.roleplayHint')}</div>
          <div className="agent-roleplay-menu-section">{t('header.roleplaySection')}</div>
          <div className="agent-roleplay-menu-list">
            <RoleplayEntityList
              items={items}
              surface="header"
              onSelect={(item) => {
                closeMenu();
                onSelectItem(item);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
