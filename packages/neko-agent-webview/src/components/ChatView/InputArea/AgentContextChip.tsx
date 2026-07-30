/**
 * AgentContextChip — inline chip showing an attached agent context payload.
 *
 * Rendered above the textarea in InputArea when the user has attached
 * context from canvas nodes, cut clips, or story selections via the
 * neko.agent.sendContext command.
 */

import type { AgentContextPayload } from '@neko/shared';
import { projectContextPayloadReferenceToken } from '@/presenters/reference-token-presenter';
import { ReferenceToken, type ReferenceTokenVariant } from './ReferenceToken';

interface AgentContextChipProps {
  payload: AgentContextPayload;
  /** Omit to render a non-removable ambient chip (no × button). */
  onRemove?: (id: string) => void;
  /** Click handler for navigation (e.g. jump to source in message history). */
  onClick?: () => void;
  variant?: ReferenceTokenVariant;
}

export function AgentContextChip({
  payload,
  onRemove,
  onClick,
  variant = 'attached',
}: AgentContextChipProps) {
  const projection = projectContextPayloadReferenceToken(payload);
  return (
    <span data-agent-context-type={payload.type}>
      <ReferenceToken
        kind={projection.kind}
        label={projection.label}
        variant={variant}
        title={projection.title}
        meta={projection.meta}
        onClick={onClick}
        onRemove={onRemove ? () => onRemove(payload.id) : undefined}
      />
    </span>
  );
}
