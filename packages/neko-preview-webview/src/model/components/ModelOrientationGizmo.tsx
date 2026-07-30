import type { ModelViewAxis, ModelViewOrientation } from '../threeRuntime';
import { useTranslation } from '../../i18n/I18nContext';

export interface ModelOrientationGizmoProps {
  readonly disabled: boolean;
  readonly orientation: ModelViewOrientation;
  readonly onResetView: () => void;
}

const AXIS_STYLES: Readonly<
  Record<ModelViewAxis, { readonly color: string; readonly label: string }>
> = {
  x: { color: '#ef5b61', label: 'X' },
  y: { color: '#2fcfa9', label: 'Y' },
  z: { color: '#4b78f6', label: 'Z' },
};

export function ModelOrientationGizmo({
  disabled,
  onResetView,
  orientation,
}: ModelOrientationGizmoProps): React.JSX.Element {
  const { t } = useTranslation();
  const axes = (Object.keys(AXIS_STYLES) as ModelViewAxis[]).sort(
    (left, right) => orientation[left].depth - orientation[right].depth,
  );

  return (
    <div className="model-preview__orientation" data-testid="model-preview-orientation">
      <svg
        aria-label={t('preview.model.orientation')}
        className="model-preview__orientation-svg"
        role="img"
        viewBox="0 0 80 80"
      >
        <circle className="model-preview__orientation-ring" cx="40" cy="40" r="31" />
        {axes.map((axis) => {
          const projection = orientation[axis];
          const style = AXIS_STYLES[axis];
          const projectedLength = Math.hypot(projection.x, projection.y);
          const endX = 40 + projection.x * 24;
          const endY = 40 + projection.y * 24;
          const labelX = endX + (projectedLength < 0.12 ? 0 : projection.x * 7);
          const labelY = endY + (projectedLength < 0.12 ? -8 : projection.y * 7) + 3;
          const opacity = 0.48 + ((projection.depth + 1) / 2) * 0.52;
          return (
            <g key={axis} data-axis={axis} opacity={opacity}>
              <line x1="40" y1="40" x2={endX} y2={endY} stroke={style.color} />
              <circle cx={endX} cy={endY} r="4.5" fill={style.color} />
              <text x={labelX} y={labelY} fill={style.color} textAnchor="middle">
                {style.label}
              </text>
            </g>
          );
        })}
        <circle className="model-preview__orientation-origin" cx="40" cy="40" r="3.5" />
      </svg>
      <button
        type="button"
        aria-label={t('preview.model.resetView')}
        disabled={disabled}
        onClick={onResetView}
      >
        {t('preview.model.resetView')}
      </button>
    </div>
  );
}
