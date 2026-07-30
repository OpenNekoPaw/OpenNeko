import { AgentHostMessages } from '@/messages';
import type { MentionItem } from './InputArea/types';

export function submitRoleplayEntrySelection(item: MentionItem, initialUserMessage?: string): void {
  const projectSearchItemId = item.navigationData?.projectSearchItemId;
  if (item.navigationData?.candidateId) {
    if (!projectSearchItemId) {
      throw new Error(`Roleplay Candidate "${item.id}" has no stable Project Search identity.`);
    }
    AgentHostMessages.confirmRoleplayCandidate({
      projectSearchItemId,
      ...formatInitialUserMessageField(initialUserMessage),
    });
    return;
  }

  const entityId = getMentionEntityId(item);
  if (!entityId) {
    throw new Error(`Roleplay Entity "${item.id}" has no stable Entity identity.`);
  }
  AgentHostMessages.startCharacterDialogueFromSlash(
    `entity:${entityId} --roleplay --skip-enrich${formatInitialRoleplayMessage(initialUserMessage)}`,
  );
}

function formatInitialUserMessageField(value: string | undefined): { initialUserMessage?: string } {
  const trimmed = value?.trim();
  return trimmed ? { initialUserMessage: trimmed } : {};
}

function formatInitialRoleplayMessage(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  if (!trimmed.includes('"')) return ` "${trimmed}"`;
  if (!trimmed.includes("'")) return ` '${trimmed}'`;
  return ` ${trimmed.replace(/\s+/g, ' ')}`;
}

function getMentionEntityId(item: MentionItem): string | undefined {
  const fromNavigation =
    item.navigationData?.entityId ??
    item.navigationData?.characterId ??
    item.navigationData?.assetId ??
    item.navigationData?.refId ??
    item.navigationData?.id;
  if (fromNavigation) return fromNavigation;
  const prefixedId = stripKnownMentionIdPrefix(item.id);
  if (prefixedId) return prefixedId;
  if (isPlainEntityId(item.id)) return item.id;
  if (item.contextPayload?.id) return item.contextPayload.id;
  return undefined;
}

function stripKnownMentionIdPrefix(value: string): string | undefined {
  const separatorIndex = value.indexOf(':');
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) return undefined;
  const prefix = value.slice(0, separatorIndex);
  return prefix === 'character' || prefix === 'entity'
    ? value.slice(separatorIndex + 1)
    : undefined;
}

function isPlainEntityId(value: string): boolean {
  return !value.includes(':') && !value.includes('/') && !value.includes('\\');
}
