import type { MessageAttachment } from '@neko/shared';

export type MessageAttachmentPreviewKind = 'image' | 'audio' | 'video' | 'file';

export interface MessageAttachmentProjection {
  attachment: MessageAttachment;
  previewKind: MessageAttachmentPreviewKind;
  name: string;
  previewSrc: string | null;
}

function projectMessageAttachment(attachment: MessageAttachment): MessageAttachmentProjection {
  return {
    attachment,
    previewKind: toAttachmentPreviewKind(attachment),
    name: attachment.name,
    previewSrc: attachment.preview ?? null,
  };
}

export function projectMessageAttachments(
  attachments: readonly MessageAttachment[] | undefined,
): MessageAttachmentProjection[] {
  return attachments?.map(projectMessageAttachment) ?? [];
}

function toAttachmentPreviewKind(attachment: MessageAttachment): MessageAttachmentPreviewKind {
  if (attachment.preview && attachment.type === 'image') return 'image';
  if (attachment.preview && attachment.type === 'audio') return 'audio';
  if (attachment.preview && attachment.type === 'video') return 'video';
  return 'file';
}
