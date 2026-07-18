import type { ChatModelOption } from '@neko/shared';
import type { SessionMode } from '@neko-agent/types';
import { MediaCategoryIcon } from './ComposerIcons';
import { SESSION_MODE_COLORS } from './SessionModeSelector';
import { getCategoryColor } from './ModelIcon';
import type { EntryPromptMenu as EntryPromptMenuKind, GenCategory, MentionItem } from './types';
import { useClickOutsideSingle } from './useClickOutside';
import { useTranslation } from '@/i18n/I18nContext';
import { useRef } from 'react';

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
  const roleplayItems = projectRoleplayItems(mentionItems);

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
            {roleplayItems.length === 0 ? (
              <div className="agent-composer-popover-empty">
                {t('chat.entryPrompt.roleplay.empty')}
              </div>
            ) : (
              roleplayItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectRoleplayEntity(item)}
                  className="agent-composer-popover-row agent-composer-entry-prompt-row"
                  role="menuitem"
                >
                  {item.thumbnailUri ? (
                    <img src={item.thumbnailUri} alt="" className="agent-composer-thumbnail" />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="agent-composer-glyph"
                      style={{
                        color: getCategoryColor('llm'),
                        borderColor: getCategoryColor('llm'),
                      }}
                    >
                      RP
                    </span>
                  )}
                  <span className="agent-composer-entry-prompt-main">
                    <span className="agent-composer-popover-primary">{item.label}</span>
                    {getRoleplayDescription(item) ? (
                      <span className="agent-composer-popover-secondary">
                        {getRoleplayDescription(item)}
                      </span>
                    ) : null}
                  </span>
                  <span className="agent-composer-popover-badge">
                    {t(
                      isRoleplayCandidateItem(item)
                        ? 'chat.entryPrompt.roleplay.confirmBadge'
                        : 'chat.entryPrompt.roleplay.badge',
                    )}
                  </span>
                </button>
              ))
            )}
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

function projectRoleplayItems(items: readonly MentionItem[]): MentionItem[] {
  return items.filter(isPlayableRoleplayItem).sort((a, b) => a.label.localeCompare(b.label));
}

function isPlayableRoleplayItem(item: MentionItem): boolean {
  if (item.kind !== 'entity') return false;
  if (!isCharacterEntityType(item.entityType)) return false;
  return !item.navigationData?.candidateId || isRoleplayCandidateItem(item);
}

function isRoleplayCandidateItem(item: MentionItem): boolean {
  return Boolean(item.navigationData?.candidateId && item.navigationData?.projectSearchItemId);
}

function isCharacterEntityType(entityType: string | undefined): boolean {
  if (!entityType) return false;
  return ['character', 'role', '角色'].includes(entityType.trim().toLowerCase());
}

function getRoleplayDescription(item: MentionItem): string | undefined {
  if (item.description && item.description !== item.label) return item.description;
  if (item.contextPayload?.summary && item.contextPayload.summary !== item.label) {
    return item.contextPayload.summary;
  }
  return item.entityType;
}
