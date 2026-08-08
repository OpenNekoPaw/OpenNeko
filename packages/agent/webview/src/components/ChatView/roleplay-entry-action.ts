import type { AgentDomainBinding } from '@neko/agent-contracts';
import type { MentionItem } from './InputArea/types';

export function projectCharacterDraftBindingFromRoleplayItem(
  item: MentionItem,
): Extract<AgentDomainBinding, { readonly kind: 'character' }> {
  const characterId = item.navigationData?.characterId;
  const characterVersionId = item.navigationData?.characterVersionId;
  const roleProfileId = item.navigationData?.roleProfileId;
  if (!characterId || !characterVersionId || !roleProfileId) {
    throw new Error(
      `Roleplay item "${item.id}" requires exact Character, Character Version, and role profile identities.`,
    );
  }
  const characterRunId = item.navigationData?.characterRunId;
  return {
    kind: 'character',
    characterId,
    characterVersionId,
    roleProfileId,
    ...(characterRunId ? { characterRunId } : {}),
  };
}
