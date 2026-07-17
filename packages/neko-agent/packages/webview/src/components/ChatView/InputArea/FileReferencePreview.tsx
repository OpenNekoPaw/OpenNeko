import type { SelectedFileReference } from './types';
import { projectPathReferenceToken } from '@/presenters/reference-token-presenter';
import { ReferenceToken } from './ReferenceToken';

interface FileReferencePreviewProps {
  references: readonly SelectedFileReference[];
  onRemove: (id: string) => void;
}

export function FileReferencePreview({ references, onRemove }: FileReferencePreviewProps) {
  if (references.length === 0) return null;

  return (
    <div className="agent-reference-row agent-reference-row-attached">
      {references.map((reference) => (
        <FileReferenceToken key={reference.id} reference={reference} onRemove={onRemove} />
      ))}
    </div>
  );
}

function FileReferenceToken({
  reference,
  onRemove,
}: {
  readonly reference: SelectedFileReference;
  readonly onRemove: (id: string) => void;
}) {
  const projection = projectPathReferenceToken({
    path: reference.path,
    label: reference.label,
    mediaType: reference.mediaType,
    thumbnailUri: reference.thumbnailUri,
  });
  return (
    <ReferenceToken
      kind={projection.kind}
      label={projection.label}
      title={projection.title}
      meta={projection.meta}
      thumbnailSrc={projection.thumbnailSrc}
      onRemove={() => onRemove(reference.id)}
    />
  );
}
