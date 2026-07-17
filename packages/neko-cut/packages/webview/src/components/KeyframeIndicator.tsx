/**
 * KeyframeIndicator Component
 * 关键帧指示器组件 - 在时间轴元素上显示关键帧菱形标记
 */

import { memo, useMemo } from 'react';
import type { TimelineElement } from '../types';
import type {
  AnimatableProperty,
  ElementTransform,
  AnimatablePropertyName,
} from '../types/animation';
import { useTranslation } from '../i18n/I18nContext';

// Pixels per second constant (should match Timeline.tsx)
const PIXELS_PER_SECOND = 50;

interface KeyframeData {
  time: number;
  property: AnimatablePropertyName;
  keyframeId: string;
}

interface KeyframeIndicatorProps {
  element: TimelineElement;
  zoomLevel: number;
  onKeyframeClick?: (
    propertyName: AnimatablePropertyName,
    keyframeId: string,
    time: number,
  ) => void;
  onKeyframeDoubleClick?: (
    propertyName: AnimatablePropertyName,
    keyframeId: string,
    time: number,
  ) => void;
  selectedKeyframeIds?: Set<string>;
}

/**
 * Collect all keyframes from a transform object
 */
function collectKeyframes(transform: ElementTransform): KeyframeData[] {
  const keyframes: KeyframeData[] = [];

  const animatableProps: { key: AnimatablePropertyName; prop: AnimatableProperty }[] = [
    { key: 'x', prop: transform.x },
    { key: 'y', prop: transform.y },
    { key: 'scaleX', prop: transform.scaleX },
    { key: 'scaleY', prop: transform.scaleY },
    { key: 'rotation', prop: transform.rotation },
    { key: 'opacity', prop: transform.opacity },
  ];

  for (const { key, prop } of animatableProps) {
    // Check if prop exists and has keyframes
    if (prop && prop.keyframes && prop.keyframes.length > 0) {
      for (const kf of prop.keyframes) {
        keyframes.push({
          time: kf.time,
          property: key,
          keyframeId: kf.id,
        });
      }
    }
  }

  return keyframes;
}

/**
 * Group keyframes by time for display
 */
function groupKeyframesByTime(keyframes: KeyframeData[]): Map<number, KeyframeData[]> {
  const groups = new Map<number, KeyframeData[]>();
  const tolerance = 0.01; // 10ms tolerance for grouping

  for (const kf of keyframes) {
    let foundGroup = false;
    for (const [time, group] of groups) {
      if (Math.abs(kf.time - time) <= tolerance) {
        group.push(kf);
        foundGroup = true;
        break;
      }
    }
    if (!foundGroup) {
      groups.set(kf.time, [kf]);
    }
  }

  return groups;
}

export const KeyframeIndicator = memo(function KeyframeIndicator({
  element,
  zoomLevel,
  onKeyframeClick,
  onKeyframeDoubleClick,
  selectedKeyframeIds = new Set(),
}: KeyframeIndicatorProps) {
  const { t } = useTranslation();

  // Collect and group keyframes
  const keyframeGroups = useMemo(() => {
    if (!element.animTransform) return new Map<number, KeyframeData[]>();
    const keyframes = collectKeyframes(element.animTransform);
    return groupKeyframesByTime(keyframes);
  }, [element.animTransform]);

  // If no keyframes, return null
  if (keyframeGroups.size === 0) {
    return null;
  }

  // Get unique times sorted
  const times = Array.from(keyframeGroups.keys()).sort((a, b) => a - b);

  return (
    <div className="absolute bottom-0 left-0 right-0 h-4 pointer-events-none z-10">
      {times.map((time) => {
        const group = keyframeGroups.get(time)!;
        const left = time * PIXELS_PER_SECOND * zoomLevel;
        const isSelected = group.some((kf) => selectedKeyframeIds.has(kf.keyframeId));
        const count = group.length;

        // Generate tooltip
        const tooltip = t('animation.keyframeAtTime', { count, time: time.toFixed(2) });

        return (
          <div
            key={time}
            className={`
              absolute w-2.5 h-2.5 rotate-45 cursor-pointer pointer-events-auto
              transition-colors duration-100
              ${
                isSelected
                  ? 'bg-yellow-300 border border-yellow-500 shadow-lg shadow-yellow-500/30'
                  : 'bg-yellow-400 hover:bg-yellow-300 border border-yellow-600/50'
              }
            `}
            style={{
              left: left - 5, // Center the diamond (half of width)
              bottom: 4,
            }}
            title={tooltip}
            onClick={(e) => {
              e.stopPropagation();
              if (onKeyframeClick && group.length > 0) {
                onKeyframeClick(group[0].property, group[0].keyframeId, time);
              }
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (onKeyframeDoubleClick && group.length > 0) {
                onKeyframeDoubleClick(group[0].property, group[0].keyframeId, time);
              }
            }}
          >
            {/* Multi-keyframe indicator (small dot in center) */}
            {count > 1 && (
              <div className="absolute inset-0 flex items-center justify-center -rotate-45">
                <div className="w-1 h-1 bg-yellow-700 rounded-full" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

/**
 * KeyframeDot - Single keyframe indicator for property panel
 * 单个关键帧点 - 用于属性面板
 */
interface KeyframeDotProps {
  hasKeyframes: boolean;
  isAtKeyframe: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export const KeyframeDot = memo(function KeyframeDot({
  hasKeyframes,
  isAtKeyframe,
  onClick,
  disabled = false,
}: KeyframeDotProps) {
  const { t } = useTranslation();

  const title = isAtKeyframe
    ? t('animation.editKeyframe')
    : hasKeyframes
      ? t('animation.addKeyframe')
      : t('animation.addKeyframe');

  return (
    <button
      type="button"
      className={`
        w-4 h-4 flex items-center justify-center rounded text-xs
        transition-colors duration-100
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${
          isAtKeyframe
            ? 'bg-yellow-400 text-yellow-900 hover:bg-yellow-300'
            : hasKeyframes
              ? 'bg-yellow-500/30 text-yellow-400 hover:bg-yellow-500/50'
              : 'bg-[var(--vscode-input-background)] text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)]'
        }
      `}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      ◆
    </button>
  );
});
