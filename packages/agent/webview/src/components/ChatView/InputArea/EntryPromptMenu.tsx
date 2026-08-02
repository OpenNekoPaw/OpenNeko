import type { ChatModelOption } from '@neko/ai-contracts';
import type { SessionMode } from '@neko/agent-contracts';
import { MediaCategoryIcon } from './ComposerIcons';
import { SESSION_MODE_COLORS } from './SessionModeSelector';
import type { EntryPromptMenu as EntryPromptMenuKind, GenCategory, MentionItem } from './types';
import { useClickOutsideSingle } from './useClickOutside';
import { useTranslation } from '../../../i18n/I18nContext';
import { useRef } from 'react';
import { RoleplayEntityList } from '../RoleplayEntityList';

interface EntryPromptMenuProps {
  isOpen: boolean;
  menu: EntryPromptMenuKind | null;
  availableMediaModels: readonly ChatModelOption[];
  mentionItems: readonly MentionItem[];
  onSelectGenerationMode: (mode: Extract<SessionMode, GenCategory>) => void;
  onSelectRoleplayEntity: (item: MentionItem) => void;
  onClose: () => void;
}

const GENERATION_MODES: readonly GenCategory[] = ['image', 'video', 'audio'];

export function EntryPromptMenu({
  isOpen,
  menu,
  availableMediaModels,
  mentionItems,
  onSelectGenerationMode,
  onSelectRoleplayEntity,
  onClose,
}: EntryPromptMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutsideSingle(menuRef, onClose);

  if (!isOpen || !menu) return null;

  const generationOptions = projectGenerationOptions(availableMediaModels);

  return (
    <div
      ref={menuRef}
      className="agent-composer-popover agent-composer-entry-prompt-menu"
      role="menu"
    >
      <div className="agent-composer-popover-scroll">
        <div className="agent-composer-popover-hint">
          {menu === 'generate-assets'
            ? t('chat.entryPrompt.generateAssets.hint')
            : t('chat.entryPrompt.roleplay.hint')}
        </div>

        {menu === 'generate-assets' ? (
          <>
            <div className="agent-composer-popover-section">
              {t('chat.entryPrompt.generateAssets.section')}
            </div>
            {generationOptions.length === 0 ? (
              <div className="agent-composer-popover-empty">
                {t('chat.entryPrompt.generateAssets.empty')}
              </div>
            ) : (
              generationOptions.map((option) => (
                <button
                  key={option.mode}
                  type="button"
                  onClick={() => onSelectGenerationMode(option.mode)}
                  className="agent-composer-popover-row agent-composer-entry-prompt-row"
                  role="menuitem"
                >
                  <span
                    aria-hidden="true"
                    className="agent-composer-glyph"
                    style={{
                      color: SESSION_MODE_COLORS[option.mode],
                      borderColor: SESSION_MODE_COLORS[option.mode],
                    }}
                  >
                    <MediaCategoryIcon category={option.mode} size={12} />
                  </span>
                  <span className="agent-composer-entry-prompt-main">
                    <span className="agent-composer-popover-primary">
                      {t(`chat.sessionMode.${option.mode}`)}
                    </span>
                    <span className="agent-composer-popover-secondary">
                      {t(`chat.sessionMode.${option.mode}Desc`)}
                    </span>
                  </span>
                  <span className="agent-composer-popover-badge">
                    {t('chat.entryPrompt.generateAssets.count', { count: option.count })}
                  </span>
                </button>
              ))
            )}
          </>
        ) : (
          <>
            <div className="agent-composer-popover-section">
              {t('chat.entryPrompt.roleplay.section')}
            </div>
            <RoleplayEntityList
              items={mentionItems}
              surface="composer"
              onSelect={onSelectRoleplayEntity}
            />
          </>
        )}
      </div>
    </div>
  );
}

function projectGenerationOptions(models: readonly ChatModelOption[]) {
  return GENERATION_MODES.flatMap((mode) => {
    const count = models.filter((model) => model.category === mode).length;
    return count > 0 ? [{ mode, count }] : [];
  });
}
