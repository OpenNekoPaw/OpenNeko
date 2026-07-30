import { useTranslation } from '@/i18n/I18nContext';
import { getCategoryColor } from './InputArea/ModelIcon';
import type { MentionItem } from './InputArea/types';

interface RoleplayEntityListProps {
  items: readonly MentionItem[];
  surface: 'composer' | 'header';
  onSelect: (item: MentionItem) => void;
}

export function RoleplayEntityList({ items, surface, onSelect }: RoleplayEntityListProps) {
  const { t } = useTranslation();
  const roleplayItems = projectRoleplayItems(items);

  if (roleplayItems.length === 0) {
    return (
      <div
        className={
          surface === 'header' ? 'agent-roleplay-menu-empty' : 'agent-composer-popover-empty'
        }
      >
        {t(surface === 'header' ? 'header.roleplayEmpty' : 'chat.entryPrompt.roleplay.empty')}
      </div>
    );
  }

  return roleplayItems.map((item) => {
    const description = getRoleplayDescription(item);
    const candidate = isRoleplayCandidateItem(item);

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => onSelect(item)}
        className={
          surface === 'header'
            ? 'agent-header-menu-item agent-roleplay-menu-item'
            : 'agent-composer-popover-row agent-composer-entry-prompt-row'
        }
        role="menuitem"
      >
        {item.thumbnailUri ? (
          <img
            src={item.thumbnailUri}
            alt=""
            className={
              surface === 'header' ? 'agent-roleplay-menu-thumbnail' : 'agent-composer-thumbnail'
            }
          />
        ) : (
          <span
            aria-hidden="true"
            className={surface === 'header' ? 'agent-roleplay-menu-glyph' : 'agent-composer-glyph'}
            style={{
              color: getCategoryColor('llm'),
              borderColor: getCategoryColor('llm'),
            }}
          >
            RP
          </span>
        )}
        <span
          className={
            surface === 'header' ? 'agent-roleplay-menu-main' : 'agent-composer-entry-prompt-main'
          }
        >
          <span
            className={
              surface === 'header' ? 'agent-roleplay-menu-label' : 'agent-composer-popover-primary'
            }
          >
            {item.label}
          </span>
          {description ? (
            <span
              className={
                surface === 'header'
                  ? 'agent-roleplay-menu-description'
                  : 'agent-composer-popover-secondary'
              }
            >
              {description}
            </span>
          ) : null}
        </span>
        <span
          className={
            surface === 'header'
              ? `agent-roleplay-menu-badge${candidate ? ' is-candidate' : ''}`
              : 'agent-composer-popover-badge'
          }
        >
          {t(
            surface === 'header'
              ? candidate
                ? 'header.roleplayConfirmBadge'
                : 'header.roleplayBadge'
              : candidate
                ? 'chat.entryPrompt.roleplay.confirmBadge'
                : 'chat.entryPrompt.roleplay.badge',
          )}
        </span>
      </button>
    );
  });
}

function projectRoleplayItems(items: readonly MentionItem[]): MentionItem[] {
  return items.filter(isPlayableRoleplayItem).sort((a, b) => a.label.localeCompare(b.label));
}

function isRoleplayCandidateItem(item: MentionItem): boolean {
  return Boolean(item.navigationData?.candidateId && item.navigationData?.projectSearchItemId);
}

function isPlayableRoleplayItem(item: MentionItem): boolean {
  if (item.kind !== 'entity') return false;
  if (!isCharacterEntityType(item.entityType)) return false;
  return !item.navigationData?.candidateId || isRoleplayCandidateItem(item);
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
