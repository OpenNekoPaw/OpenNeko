import type { ReactNode } from 'react';
import { CheckIcon } from '@neko/ui/icons';

export interface EntryResourceCardAction {
  readonly label: string;
  readonly onClick: () => void;
  readonly expanded?: boolean;
  readonly disabled?: boolean;
}

export interface EntryResourceCardProps {
  readonly actionId?: string;
  readonly resourceKind?: 'project' | 'character' | 'world' | 'skill';
  readonly label: string;
  readonly description?: string;
  readonly metadata?: string;
  readonly media: ReactNode;
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly onSelect: () => void;
  readonly secondaryAction?: EntryResourceCardAction;
}

export function EntryResourceCard({
  actionId,
  resourceKind,
  label,
  description,
  metadata,
  media,
  selected = false,
  disabled = false,
  onSelect,
  secondaryAction,
}: EntryResourceCardProps): JSX.Element {
  return (
    <article className="agent-entry-resource-card" data-selected={selected ? 'true' : 'false'}>
      <button
        type="button"
        className="agent-entry-resource-card-main"
        data-entry-action={actionId}
        data-entry-resource-kind={resourceKind}
        disabled={disabled}
        title={label}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <span className="agent-entry-resource-card-media" aria-hidden="true">
          {media}
        </span>
        <span className="agent-entry-resource-card-copy">
          <strong>{label}</strong>
          {description ? <span>{description}</span> : null}
          {metadata ? <small>{metadata}</small> : null}
        </span>
        {selected ? (
          <span className="agent-entry-resource-card-selected" aria-hidden="true">
            <CheckIcon size={13} strokeWidth={2.2} />
          </span>
        ) : null}
      </button>
      {secondaryAction ? (
        <button
          type="button"
          className="agent-entry-resource-card-secondary"
          aria-expanded={secondaryAction.expanded}
          disabled={secondaryAction.disabled}
          onClick={secondaryAction.onClick}
        >
          {secondaryAction.label}
        </button>
      ) : null}
    </article>
  );
}
