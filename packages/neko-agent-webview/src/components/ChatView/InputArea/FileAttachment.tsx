/**
 * FileAttachment Components
 * Split into AttachmentPreview and AttachmentButton for proper layout
 */

import type { MessageAttachment } from './types';
import { projectAttachmentReferenceToken } from '@/presenters/reference-token-presenter';
import { ReferenceToken } from './ReferenceToken';

/**
 * AttachmentPreview - Shows attached files as inline tags (inside input box)
 */
interface AttachmentPreviewProps {
  attachedFiles: MessageAttachment[];
  onRemove: (id: string) => void;
}

export function AttachmentPreview({ attachedFiles, onRemove }: AttachmentPreviewProps) {
  if (attachedFiles.length === 0) return null;

  return (
    <div className="agent-reference-row agent-reference-row-attached">
      {attachedFiles.map((attachment) => (
        <AttachmentToken key={attachment.id} attachment={attachment} onRemove={onRemove} />
      ))}
    </div>
  );
}

function AttachmentToken({
  attachment,
  onRemove,
}: {
  readonly attachment: MessageAttachment;
  readonly onRemove: (id: string) => void;
}) {
  const projection = projectAttachmentReferenceToken(attachment);
  return (
    <ReferenceToken
      kind={projection.kind}
      label={projection.label}
      title={projection.title}
      meta={projection.meta}
      thumbnailSrc={projection.thumbnailSrc}
      onRemove={() => onRemove(attachment.id)}
    />
  );
}
