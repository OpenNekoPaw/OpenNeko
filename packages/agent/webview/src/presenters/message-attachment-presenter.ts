import type { MessageAttachment } from '@neko/agent-contracts';

export type MessageAttachmentPreviewKind = 'image' | 'audio' | 'video' | 'file';

export interface MessageAttachmentProjection {
  attachment: MessageAttachment;
  previewKind: MessageAttachmentPreviewKind;
  name: string;
}

function projectMessageAttachment(attachment: MessageAttachment): MessageAttachmentProjection {
  return {
    attachment,
    previewKind: toAttachmentPreviewKind(attachment),
    name: attachment.name,
  };
}

export function projectMessageAttachments(
  attachments: readonly MessageAttachment[] | undefined,
): MessageAttachmentProjection[] {
  return attachments?.map(projectMessageAttachment) ?? [];
}

function toAttachmentPreviewKind(attachment: MessageAttachment): MessageAttachmentPreviewKind {
  if (attachment.type === 'image') return 'image';
  if (attachment.type === 'audio') return 'audio';
  if (attachment.type === 'video') return 'video';
  return 'file';
}
