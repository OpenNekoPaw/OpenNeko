/**
 * SubtitleRenderer Component
 * 字幕渲染组件 - 在预览区渲染字幕
 */

import { memo, useMemo, CSSProperties } from 'react';
import type {
  SubtitleTrack,
  SubtitleCue,
  SubtitleStyle,
  SubtitleAnimation,
} from '../../types/subtitle';
import { getCueAtTime } from '../../utils/subtitleParser';

// =============================================================================
// Types
// =============================================================================

interface SubtitleRendererProps {
  tracks: SubtitleTrack[];
  currentTime: number;
  containerWidth: number;
  containerHeight: number;
}

// =============================================================================
// Animation Keyframes
// =============================================================================

const ANIMATION_KEYFRAMES: Record<SubtitleAnimation, string> = {
  none: '',
  fade: `
    @keyframes subtitle-fade-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes subtitle-fade-out { from { opacity: 1; } to { opacity: 0; } }
  `,
  'slide-up': `
    @keyframes subtitle-slide-up-in { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes subtitle-slide-up-out { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-20px); } }
  `,
  'slide-down': `
    @keyframes subtitle-slide-down-in { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes subtitle-slide-down-out { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(20px); } }
  `,
  'slide-left': `
    @keyframes subtitle-slide-left-in { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes subtitle-slide-left-out { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(-30px); } }
  `,
  'slide-right': `
    @keyframes subtitle-slide-right-in { from { opacity: 0; transform: translateX(-30px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes subtitle-slide-right-out { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(30px); } }
  `,
  'zoom-in': `
    @keyframes subtitle-zoom-in-in { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
    @keyframes subtitle-zoom-in-out { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(1.2); } }
  `,
  'zoom-out': `
    @keyframes subtitle-zoom-out-in { from { opacity: 0; transform: scale(1.2); } to { opacity: 1; transform: scale(1); } }
    @keyframes subtitle-zoom-out-out { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.8); } }
  `,
  typewriter: `
    @keyframes subtitle-typewriter-in { from { width: 0; } to { width: 100%; } }
    @keyframes subtitle-typewriter-out { from { opacity: 1; } to { opacity: 0; } }
  `,
  bounce: `
    @keyframes subtitle-bounce-in {
      0% { opacity: 0; transform: scale(0.3); }
      50% { transform: scale(1.05); }
      70% { transform: scale(0.9); }
      100% { opacity: 1; transform: scale(1); }
    }
    @keyframes subtitle-bounce-out { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.3); } }
  `,
  shake: `
    @keyframes subtitle-shake-in {
      0% { opacity: 0; transform: translateX(-10px); }
      25% { transform: translateX(10px); }
      50% { transform: translateX(-5px); }
      75% { transform: translateX(5px); }
      100% { opacity: 1; transform: translateX(0); }
    }
    @keyframes subtitle-shake-out { from { opacity: 1; } to { opacity: 0; } }
  `,
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate CSS styles from SubtitleStyle
 */
function generateSubtitleCSS(
  style: SubtitleStyle,
  _containerWidth: number,
  containerHeight: number,
): CSSProperties {
  const fontSize = (style.fontSize / 1080) * containerHeight;

  const css: CSSProperties = {
    // Position
    position: 'absolute',
    left: `${style.positionX * 100}%`,
    top: `${style.positionY * 100}%`,
    transform: getTransformOrigin(style),
    maxWidth: style.maxWidth > 0 ? `${style.maxWidth * 100}%` : undefined,

    // Font
    fontFamily: style.fontFamily,
    fontSize: `${fontSize}px`,
    fontWeight: style.fontWeight,
    fontStyle: style.italic ? 'italic' : 'normal',
    textDecoration: style.decoration,

    // Color
    color: style.color,
    WebkitTextStroke:
      style.outlineWidth > 0 ? `${style.outlineWidth}px ${style.outlineColor}` : undefined,

    // Background
    backgroundColor: style.backgroundColor,
    padding: style.backgroundColor !== 'transparent' ? `${style.backgroundPadding}px` : undefined,
    borderRadius: style.backgroundRadius > 0 ? `${style.backgroundRadius}px` : undefined,

    // Shadow
    textShadow:
      style.shadowBlur > 0 || style.shadowOffsetX !== 0 || style.shadowOffsetY !== 0
        ? `${style.shadowOffsetX}px ${style.shadowOffsetY}px ${style.shadowBlur}px ${style.shadowColor}`
        : undefined,

    // Text layout
    textAlign: style.alignment,
    lineHeight: style.lineSpacing,
    letterSpacing: style.letterSpacing !== 0 ? `${style.letterSpacing}px` : undefined,

    // Other
    whiteSpace: 'pre-wrap',
    pointerEvents: 'none',
    zIndex: 1000,
  };

  return css;
}

/**
 * Get transform based on alignment
 */
function getTransformOrigin(style: SubtitleStyle): string {
  let x = '-50%';
  let y = '-50%';

  if (style.alignment === 'left') x = '0%';
  else if (style.alignment === 'right') x = '-100%';

  if (style.verticalAlign === 'top') y = '0%';
  else if (style.verticalAlign === 'bottom') y = '-100%';

  return `translate(${x}, ${y})`;
}

/**
 * Get animation name for entry/exit
 */
function getAnimationName(animation: SubtitleAnimation, isEntry: boolean): string {
  if (animation === 'none') return '';
  const suffix = isEntry ? '-in' : '-out';
  return `subtitle-${animation}${suffix}`;
}

// =============================================================================
// SubtitleCueRenderer Component
// =============================================================================

interface SubtitleCueRendererProps {
  cue: SubtitleCue;
  style: SubtitleStyle;
  containerWidth: number;
  containerHeight: number;
  currentTime: number;
}

const SubtitleCueRenderer = memo(function SubtitleCueRenderer({
  cue,
  style,
  containerWidth,
  containerHeight,
  currentTime,
}: SubtitleCueRendererProps) {
  // Merge cue-specific style with track style
  const mergedStyle: SubtitleStyle = useMemo(
    () => ({
      ...style,
      ...cue.style,
    }),
    [style, cue.style],
  );

  // Calculate animation state
  const animationState = useMemo(() => {
    const duration = cue.endTime - cue.startTime;
    const elapsed = currentTime - cue.startTime;
    const animDuration = mergedStyle.animationDuration / 1000;

    if (elapsed < animDuration && mergedStyle.animationIn !== 'none') {
      return {
        name: getAnimationName(mergedStyle.animationIn, true),
        duration: `${animDuration}s`,
      };
    }

    if (elapsed > duration - animDuration && mergedStyle.animationOut !== 'none') {
      return {
        name: getAnimationName(mergedStyle.animationOut, false),
        duration: `${animDuration}s`,
      };
    }

    return null;
  }, [cue, currentTime, mergedStyle]);

  // Generate CSS
  const cssStyle = useMemo(() => {
    const baseStyle = generateSubtitleCSS(mergedStyle, containerWidth, containerHeight);

    if (animationState) {
      return {
        ...baseStyle,
        animation: `${animationState.name} ${animationState.duration} ease-out forwards`,
      };
    }

    return baseStyle;
  }, [mergedStyle, containerWidth, containerHeight, animationState]);

  return (
    <div style={cssStyle}>
      {cue.text.split('\n').map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  );
});

// =============================================================================
// SubtitleRenderer Component
// =============================================================================

export const SubtitleRenderer = memo(function SubtitleRenderer({
  tracks,
  currentTime,
  containerWidth,
  containerHeight,
}: SubtitleRendererProps) {
  // Get visible cues from all tracks
  const visibleCues = useMemo(() => {
    const cues: Array<{ track: SubtitleTrack; cue: SubtitleCue }> = [];

    for (const track of tracks) {
      const cue = getCueAtTime(track.cues, currentTime);
      if (cue) {
        cues.push({ track, cue });
      }
    }

    return cues;
  }, [tracks, currentTime]);

  // Collect needed animation keyframes
  const neededKeyframes = useMemo(() => {
    const animations = new Set<SubtitleAnimation>();

    for (const track of tracks) {
      animations.add(track.style.animationIn);
      animations.add(track.style.animationOut);
    }

    return Array.from(animations)
      .filter((a) => a !== 'none')
      .map((a) => ANIMATION_KEYFRAMES[a])
      .join('\n');
  }, [tracks]);

  if (visibleCues.length === 0) {
    return null;
  }

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Animation keyframes */}
      {neededKeyframes && <style dangerouslySetInnerHTML={{ __html: neededKeyframes }} />}

      {/* Render cues */}
      {visibleCues.map(({ track, cue }) => (
        <SubtitleCueRenderer
          key={`${track.id}-${cue.id}`}
          cue={cue}
          style={track.style}
          containerWidth={containerWidth}
          containerHeight={containerHeight}
          currentTime={currentTime}
        />
      ))}
    </div>
  );
});

export default SubtitleRenderer;
