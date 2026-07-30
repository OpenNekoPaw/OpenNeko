import type { AmbientCanvasNodeProjection } from '@/presenters/plugin-transfer-presenter';
import { projectAmbientCanvasContext } from '@/presenters/input-area-presenter';
import { projectAmbientCanvasReferenceToken } from '@/presenters/reference-token-presenter';
import { useTranslation } from '@/i18n/I18nContext';
import { ReferenceToken } from './ReferenceToken';

interface AmbientCanvasContextBarProps {
  ambientNodes: readonly AmbientCanvasNodeProjection[];
  onSuggest: (text: string) => void;
}

export function AmbientCanvasContextBar({ ambientNodes, onSuggest }: AmbientCanvasContextBarProps) {
  const { t } = useTranslation();
  const projection = projectAmbientCanvasContext(ambientNodes);
  if (!projection) return null;

  const primaryNode = projection.previewNodes[0];
  const primaryCount = projection.counts[0];
  const referenceLabel =
    projection.titleNodeSummary ??
    primaryNode?.summary ??
    t(projection.titleKey, { count: projection.selectedCount });
  const previewTitle = projection.previewNodes.map((node) => node.summary).join('\n');
  const moreLabel =
    projection.selectedCount > 1
      ? t('chat.input.canvasContext.more', {
          count: projection.selectedCount - 1,
        })
      : null;
  const countLabel = primaryCount
    ? t(primaryCount.labelKey, { count: primaryCount.count, type: primaryCount.type })
    : null;
  const token = projectAmbientCanvasReferenceToken({
    label: referenceLabel,
    title: previewTitle || referenceLabel,
    meta: moreLabel,
    countLabel,
  });

  return (
    <div
      className="agent-canvas-reference-row"
      data-agent-canvas-context="true"
      aria-label={t('chat.input.canvasContext.kicker')}
    >
      <ReferenceToken
        kind={token.kind}
        label={token.label}
        variant={token.variant}
        title={token.title}
        meta={token.meta}
        countLabel={token.countLabel}
      />

      <div className="agent-canvas-reference-actions">
        {projection.actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className="agent-canvas-reference-action"
            onClick={() => onSuggest(t(action.promptKey))}
          >
            <span>{t(action.labelKey)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
