export type AttachmentType = 'file' | 'image' | 'video' | 'audio';

export interface MessageAttachment {
  id: string;
  name: string;
  type: AttachmentType;
  path?: string;
  size?: number;
  preview?: string;
}
