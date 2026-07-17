/**
 * PropertyPanel Component
 * 属性面板组件 - 显示和编辑选中元素的属性
 */

import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  KeyframeButton,
  ColorPropertyRow,
  NumberPropertyRow,
  PropertyRow as SharedPropertyRow,
  SelectPropertyRow,
  SliderPropertyRow,
} from '@neko/ui/creative';
import { Checkbox, Collapsible } from '@neko/ui/primitives';
import type { PropertyDefinition } from './PropertyRow';
import { NormalizeLoudnessButton } from './NormalizeLoudnessButton';
import { AIActionsButton } from './AIActionsButton';
import { SpeedControl } from '../SpeedControl';
import { TransitionPicker } from '../TransitionPicker';
import { ColorCorrectionPanel } from '../ColorCorrection';
import { EffectsPanel } from '../Effects';
import { MaskPanel } from '../Mask';
import { useTranslation } from '../../i18n/I18nContext';
import type {
  TimelineElement,
  AnimatableProperty,
  EasingType,
  SpeedProperties,
  Transition,
  ColorCorrection,
  ElementTransform,
  EffectInstance,
  ProjectDefaults,
  MaskInstance,
} from '../../types';
import { getKeyframeAtTime } from '../../utils/animation';
import { createDefaultElementTransform } from '../../types/animation';
import { DEFAULT_AUDIO_PROPERTIES } from '../../types';
import { hasMediaSource } from '../../types/capabilities';
import { mergeColorCorrectionEffect } from '../../utils/composite-helpers';
import { BLEND_MODE_DEFINITIONS, BLEND_MODE_CATEGORY_I18N_KEYS } from '../../types/blendModes';
import type { BlendModeCategory } from '../../types/blendModes';

// =============================================================================
// Property Definitions
// =============================================================================

const TRANSFORM_PROPERTIES: PropertyDefinition[] = [
  {
    key: 'x',
    labelKey: 'propertyPanel.transform.x',
    type: 'slider',
    animatable: true,
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: 'y',
    labelKey: 'propertyPanel.transform.y',
    type: 'slider',
    animatable: true,
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: 'scaleX',
    labelKey: 'propertyPanel.transform.scaleX',
    type: 'slider',
    animatable: true,
    min: 0.1,
    max: 3,
    step: 0.01,
  },
  {
    key: 'scaleY',
    labelKey: 'propertyPanel.transform.scaleY',
    type: 'slider',
    animatable: true,
    min: 0.1,
    max: 3,
    step: 0.01,
  },
  {
    key: 'rotation',
    labelKey: 'propertyPanel.transform.rotation',
    type: 'number',
    animatable: true,
    min: -360,
    max: 360,
    step: 1,
    unit: '°',
  },
  {
    key: 'opacity',
    labelKey: 'propertyPanel.transform.opacity',
    type: 'slider',
    animatable: true,
    min: 0,
    max: 1,
    step: 0.01,
  },
];

const TEXT_PROPERTIES: PropertyDefinition[] = [
  { key: 'content', labelKey: 'propertyPanel.text.content', type: 'string', animatable: false },
  {
    key: 'fontSize',
    labelKey: 'propertyPanel.text.fontSize',
    type: 'number',
    animatable: false,
    min: 8,
    max: 200,
    step: 1,
    unit: 'px',
  },
  {
    key: 'fontFamily',
    labelKey: 'propertyPanel.text.fontFamily',
    type: 'string',
    animatable: false,
  },
  { key: 'color', labelKey: 'propertyPanel.text.color', type: 'color', animatable: false },
  {
    key: 'backgroundColor',
    labelKey: 'propertyPanel.text.backgroundColor',
    type: 'color',
    animatable: false,
  },
  {
    key: 'textAlign',
    labelKey: 'propertyPanel.text.textAlign',
    type: 'select',
    animatable: false,
    options: [
      { value: 'left', labelKey: 'propertyPanel.text.alignLeft' },
      { value: 'center', labelKey: 'propertyPanel.text.alignCenter' },
      { value: 'right', labelKey: 'propertyPanel.text.alignRight' },
    ],
  },
  {
    key: 'fontWeight',
    labelKey: 'propertyPanel.text.fontWeight',
    type: 'select',
    animatable: false,
    options: [
      { value: 'normal', labelKey: 'propertyPanel.text.weightNormal' },
      { value: 'bold', labelKey: 'propertyPanel.text.weightBold' },
    ],
  },
  {
    key: 'fontStyle',
    labelKey: 'propertyPanel.text.fontStyle',
    type: 'select',
    animatable: false,
    options: [
      { value: 'normal', labelKey: 'propertyPanel.text.styleNormal' },
      { value: 'italic', labelKey: 'propertyPanel.text.styleItalic' },
    ],
  },
  {
    key: 'textDecoration',
    labelKey: 'propertyPanel.text.textDecoration',
    type: 'select',
    animatable: false,
    options: [
      { value: 'none', labelKey: 'propertyPanel.text.decorationNone' },
      { value: 'underline', labelKey: 'propertyPanel.text.decorationUnderline' },
      { value: 'line-through', labelKey: 'propertyPanel.text.decorationLineThrough' },
    ],
  },
];

const SUBTITLE_PROPERTIES: PropertyDefinition[] = [
  { key: 'text', labelKey: 'propertyPanel.text.content', type: 'string', animatable: false },
  {
    key: 'fontSize',
    labelKey: 'propertyPanel.text.fontSize',
    type: 'number',
    animatable: false,
    min: 8,
    max: 200,
    step: 1,
    unit: 'px',
  },
  {
    key: 'fontFamily',
    labelKey: 'propertyPanel.text.fontFamily',
    type: 'string',
    animatable: false,
  },
  { key: 'color', labelKey: 'propertyPanel.text.color', type: 'color', animatable: false },
  {
    key: 'backgroundColor',
    labelKey: 'propertyPanel.text.backgroundColor',
    type: 'color',
    animatable: false,
  },
  {
    key: 'textAlign',
    labelKey: 'propertyPanel.text.textAlign',
    type: 'select',
    animatable: false,
    options: [
      { value: 'left', labelKey: 'propertyPanel.text.alignLeft' },
      { value: 'center', labelKey: 'propertyPanel.text.alignCenter' },
      { value: 'right', labelKey: 'propertyPanel.text.alignRight' },
    ],
  },
  {
    key: 'strokeColor',
    labelKey: 'propertyPanel.subtitle.strokeColor',
    type: 'color',
    animatable: false,
  },
  {
    key: 'strokeWidth',
    labelKey: 'propertyPanel.subtitle.strokeWidth',
    type: 'number',
    animatable: false,
    min: 0,
    max: 20,
    step: 0.5,
    unit: 'px',
  },
];

const AUDIO_PROPERTIES: PropertyDefinition[] = [
  {
    key: 'volume',
    labelKey: 'propertyPanel.audio.volume',
    type: 'slider',
    animatable: false,
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    key: 'pan',
    labelKey: 'propertyPanel.audio.pan',
    type: 'slider',
    animatable: false,
    min: -1,
    max: 1,
    step: 0.01,
  },
  { key: 'muted', labelKey: 'propertyPanel.audio.muted', type: 'boolean', animatable: false },
  {
    key: 'fadeIn',
    labelKey: 'propertyPanel.audio.fadeIn',
    type: 'number',
    animatable: false,
    min: 0,
    max: 10,
    step: 0.1,
    unit: 's',
  },
  {
    key: 'fadeOut',
    labelKey: 'propertyPanel.audio.fadeOut',
    type: 'number',
    animatable: false,
    min: 0,
    max: 10,
    step: 0.1,
    unit: 's',
  },
  {
    key: 'gain',
    labelKey: 'propertyPanel.audio.gain',
    type: 'slider',
    animatable: false,
    min: -20,
    max: 20,
    step: 0.5,
    unit: 'dB',
  },
];

// =============================================================================
// Helper Functions
// =============================================================================

type BasicPropertyKey = 'name' | 'startTime' | 'duration';
type TransformPropertyKey = 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation' | 'opacity';
type TextPropertyKey =
  | 'content'
  | 'fontSize'
  | 'fontFamily'
  | 'color'
  | 'backgroundColor'
  | 'textAlign'
  | 'fontWeight'
  | 'fontStyle'
  | 'textDecoration';
type TextDefaultsPropertyKey = Exclude<TextPropertyKey, 'content'>;
type SubtitlePropertyKey =
  | 'text'
  | 'fontSize'
  | 'fontFamily'
  | 'color'
  | 'backgroundColor'
  | 'textAlign'
  | 'strokeColor'
  | 'strokeWidth';
type AudioPropertyKey = 'volume' | 'pan' | 'muted' | 'fadeIn' | 'fadeOut' | 'gain';
type AudioDefaultsPropertyKey = Exclude<AudioPropertyKey, 'muted'>;
type TypedPropertyValue = string | number | boolean;

function createBasicElementPatch(
  element: TimelineElement,
  propertyKey: BasicPropertyKey,
  value: string | number,
): Partial<TimelineElement> {
  switch (propertyKey) {
    case 'name':
      if (typeof value !== 'string') {
        throw new Error('Cut basic property name requires a string value');
      }
      return { name: value };
    case 'startTime':
      if (typeof value !== 'number') {
        throw new Error('Cut basic property startTime requires a number value');
      }
      return { startTime: value };
    case 'duration':
      if (typeof value !== 'number') {
        throw new Error('Cut basic property duration requires a number value');
      }
      return { duration: Math.max(0.1, value) + element.trimStart + element.trimEnd };
    default:
      return assertUnreachable(propertyKey);
  }
}

function createTransformElementPatch(
  element: TimelineElement,
  propertyKey: TransformPropertyKey,
  value: number,
): Partial<TimelineElement> {
  const transform = element.animTransform ?? createDefaultElementTransform();
  const currentProperty = transform[propertyKey];
  const nextProperty = { ...currentProperty, baseValue: value };

  return {
    animTransform: updateTypedAnimTransformProperty(transform, propertyKey, nextProperty),
  };
}

function createTextElementPatch(
  propertyKey: TextPropertyKey,
  value: string | number,
): Partial<TimelineElement> {
  switch (propertyKey) {
    case 'content':
      return { content: readStringValue(propertyKey, value) } as Partial<TimelineElement>;
    case 'fontSize':
      return { fontSize: readNumberValue(propertyKey, value) } as Partial<TimelineElement>;
    case 'fontFamily':
      return { fontFamily: readStringValue(propertyKey, value) } as Partial<TimelineElement>;
    case 'color':
      return { color: readStringValue(propertyKey, value) } as Partial<TimelineElement>;
    case 'backgroundColor':
      return { backgroundColor: readStringValue(propertyKey, value) } as Partial<TimelineElement>;
    case 'textAlign':
      return { textAlign: readTextAlign(value) } as Partial<TimelineElement>;
    case 'fontWeight':
      return { fontWeight: readFontWeight(value) } as Partial<TimelineElement>;
    case 'fontStyle':
      return { fontStyle: readFontStyle(value) } as Partial<TimelineElement>;
    case 'textDecoration':
      return { textDecoration: readTextDecoration(value) } as Partial<TimelineElement>;
    default:
      return assertUnreachable(propertyKey);
  }
}

function createTextDefaultsPatch(
  defaults: ProjectDefaults,
  propertyKey: TextDefaultsPropertyKey,
  value: string | number,
): Partial<ProjectDefaults> {
  switch (propertyKey) {
    case 'fontSize':
      return { text: { ...defaults.text, fontSize: readNumberValue(propertyKey, value) } };
    case 'fontFamily':
      return { text: { ...defaults.text, fontFamily: readStringValue(propertyKey, value) } };
    case 'color':
      return { text: { ...defaults.text, color: readStringValue(propertyKey, value) } };
    case 'backgroundColor':
      return { text: { ...defaults.text, backgroundColor: readStringValue(propertyKey, value) } };
    case 'textAlign':
      return { text: { ...defaults.text, textAlign: readTextAlign(value) } };
    case 'fontWeight':
      return { text: { ...defaults.text, fontWeight: readFontWeight(value) } };
    case 'fontStyle':
      return { text: { ...defaults.text, fontStyle: readFontStyle(value) } };
    case 'textDecoration':
      return { text: { ...defaults.text, textDecoration: readTextDecoration(value) } };
    default:
      return assertUnreachable(propertyKey);
  }
}

function createSubtitleElementPatch(
  propertyKey: SubtitlePropertyKey,
  value: string | number,
): Partial<TimelineElement> {
  switch (propertyKey) {
    case 'text':
      return { text: readStringValue(propertyKey, value) } as Partial<TimelineElement>;
    case 'fontSize':
      return { fontSize: readNumberValue(propertyKey, value) } as Partial<TimelineElement>;
    case 'fontFamily':
      return { fontFamily: readStringValue(propertyKey, value) } as Partial<TimelineElement>;
    case 'color':
      return { color: readStringValue(propertyKey, value) } as Partial<TimelineElement>;
    case 'backgroundColor':
      return { backgroundColor: readStringValue(propertyKey, value) } as Partial<TimelineElement>;
    case 'textAlign':
      return { textAlign: readTextAlign(value) } as Partial<TimelineElement>;
    case 'strokeColor':
      return { strokeColor: readStringValue(propertyKey, value) } as Partial<TimelineElement>;
    case 'strokeWidth':
      return { strokeWidth: readNumberValue(propertyKey, value) } as Partial<TimelineElement>;
    default:
      return assertUnreachable(propertyKey);
  }
}

function createAudioElementPatch(
  element: TimelineElement,
  propertyKey: AudioPropertyKey,
  value: number | boolean,
): Partial<TimelineElement> {
  const audio = element.audio ?? DEFAULT_AUDIO_PROPERTIES;

  switch (propertyKey) {
    case 'volume':
      return { audio: { ...audio, volume: readNumberValue(propertyKey, value) } };
    case 'pan':
      return { audio: { ...audio, pan: readNumberValue(propertyKey, value) } };
    case 'muted':
      return { audio: { ...audio, muted: readBooleanValue(propertyKey, value) } };
    case 'fadeIn':
      return { audio: { ...audio, fadeIn: readNumberValue(propertyKey, value) } };
    case 'fadeOut':
      return { audio: { ...audio, fadeOut: readNumberValue(propertyKey, value) } };
    case 'gain':
      return { audio: { ...audio, gain: readNumberValue(propertyKey, value) } };
    default:
      return assertUnreachable(propertyKey);
  }
}

function createAudioDefaultsPatch(
  defaults: ProjectDefaults,
  propertyKey: AudioDefaultsPropertyKey,
  value: number,
): Partial<ProjectDefaults> {
  switch (propertyKey) {
    case 'volume':
      return { audio: { ...defaults.audio, volume: readNumberValue(propertyKey, value) } };
    case 'pan':
      return { audio: { ...defaults.audio, pan: readNumberValue(propertyKey, value) } };
    case 'fadeIn':
      return { audio: { ...defaults.audio, fadeIn: readNumberValue(propertyKey, value) } };
    case 'fadeOut':
      return { audio: { ...defaults.audio, fadeOut: readNumberValue(propertyKey, value) } };
    case 'gain':
      return { audio: { ...defaults.audio, gain: readNumberValue(propertyKey, value) } };
    default:
      return assertUnreachable(propertyKey);
  }
}

function toTextDefaultsPropertyKey(propertyKey: TextPropertyKey): TextDefaultsPropertyKey {
  if (propertyKey === 'content') {
    throw new Error('Cut text defaults do not support content');
  }
  return propertyKey;
}

function toAudioDefaultsPropertyKey(propertyKey: AudioPropertyKey): AudioDefaultsPropertyKey {
  if (propertyKey === 'muted') {
    throw new Error('Cut audio defaults do not support muted');
  }
  return propertyKey;
}

function getPropertyDefinition(
  definitions: readonly PropertyDefinition[],
  propertyKey: string,
): PropertyDefinition {
  const definition = definitions.find((item) => item.key === propertyKey);
  if (!definition) {
    throw new Error(`Missing Cut property definition: ${propertyKey}`);
  }
  return definition;
}

function getSelectOptions(definition: PropertyDefinition): { value: string; label: string }[] {
  return (
    definition.options?.map((option) => ({
      value: option.value,
      label: option.labelKey,
    })) ?? []
  );
}

function readStringValue(propertyKey: string, value: TypedPropertyValue): string {
  if (typeof value !== 'string') {
    throw new Error(`Cut property ${propertyKey} requires a string value`);
  }
  return value;
}

function readNumberValue(propertyKey: string, value: TypedPropertyValue): number {
  if (typeof value !== 'number') {
    throw new Error(`Cut property ${propertyKey} requires a number value`);
  }
  return value;
}

function readBooleanValue(propertyKey: string, value: TypedPropertyValue): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Cut property ${propertyKey} requires a boolean value`);
  }
  return value;
}

function readTextAlign(value: TypedPropertyValue): ProjectDefaults['text']['textAlign'] {
  if (value === 'left' || value === 'center' || value === 'right') {
    return value;
  }
  throw new Error(`Cut textAlign requires left, center, or right`);
}

function readFontWeight(value: TypedPropertyValue): ProjectDefaults['text']['fontWeight'] {
  if (value === 'normal' || value === 'bold') {
    return value;
  }
  throw new Error(`Cut fontWeight requires normal or bold`);
}

function readFontStyle(value: TypedPropertyValue): ProjectDefaults['text']['fontStyle'] {
  if (value === 'normal' || value === 'italic') {
    return value;
  }
  throw new Error(`Cut fontStyle requires normal or italic`);
}

function readTextDecoration(value: TypedPropertyValue): ProjectDefaults['text']['textDecoration'] {
  if (value === 'none' || value === 'underline' || value === 'line-through') {
    return value;
  }
  throw new Error(`Cut textDecoration requires none, underline, or line-through`);
}

function assertUnreachable(value: never): never {
  throw new Error(`Unhandled Cut property key: ${String(value)}`);
}

function updateTypedAnimTransformProperty(
  transform: ElementTransform,
  key: TransformPropertyKey,
  value: AnimatableProperty,
): ElementTransform {
  switch (key) {
    case 'x':
      return { ...transform, x: value };
    case 'y':
      return { ...transform, y: value };
    case 'scaleX':
      return { ...transform, scaleX: value };
    case 'scaleY':
      return { ...transform, scaleY: value };
    case 'rotation':
      return { ...transform, rotation: value };
    case 'opacity':
      return { ...transform, opacity: value };
    default:
      return assertUnreachable(key);
  }
}

// =============================================================================
// Property Group Component
// =============================================================================

interface PropertyGroupProps {
  titleKey: string;
  children: ReactNode;
  defaultExpanded?: boolean;
  disabled?: boolean;
}

const PropertyGroup = memo(function PropertyGroup({
  titleKey,
  children,
  defaultExpanded = true,
  disabled = false,
}: PropertyGroupProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded && !disabled);
  const isExpanded = expanded && !disabled;

  return (
    <Collapsible
      className="neko-collapsible"
      contentClassName="neko-collapsible-body"
      disabled={disabled}
      onOpenChange={setExpanded}
      open={isExpanded}
      trigger={
        <button
          aria-expanded={isExpanded}
          className="neko-collapsible-header"
          disabled={disabled}
          style={disabled ? { pointerEvents: 'none', opacity: 0.4 } : undefined}
          type="button"
        >
          <span className={`neko-collapsible-chevron${isExpanded ? ' expanded' : ''}`}>
            <ChevronIcon />
          </span>
          {t(titleKey)}
        </button>
      }
    >
      {isExpanded ? (
        // Preserve horizontal padding matching the original .nk-prop-group-body.
        <div style={{ padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {children}
        </div>
      ) : null}
    </Collapsible>
  );
});

function ChevronIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
      <path d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L9.19 8 6.22 5.03a.75.75 0 0 1 0-1.06z" />
    </svg>
  );
}

// =============================================================================
// Main PropertyPanel Component
// =============================================================================

interface PropertyPanelProps {
  mode: 'basic' | 'professional';
  element: TimelineElement | null;
  projectDefaults: ProjectDefaults | null;
  currentTime: number;
  /** Real-time preview update (raw set, no undo history) */
  onElementChange: (elementId: string, changes: Partial<TimelineElement>) => void;
  /** Finalized commit (pushed to undo history). Called on slider release / input blur. */
  onElementCommit?: (elementId: string, changes: Partial<TimelineElement>) => void;
  onDefaultsChange: (changes: Partial<ProjectDefaults>) => void;
  onAddKeyframe: (
    elementId: string,
    propertyPath: string,
    value: number,
    easing?: EasingType,
  ) => void;
  onRemoveKeyframe: (elementId: string, propertyPath: string) => void;
  onExecuteAIAction?: (actionId: string, elementIds: string[]) => void;
}

function getElementTransition(
  element: TimelineElement | null | undefined,
  key: 'transitionIn' | 'transitionOut',
): Transition | null {
  if (!element) {
    return null;
  }
  return element[key] ?? null;
}

export const PropertyPanel = memo(function PropertyPanel({
  mode,
  element,
  projectDefaults,
  currentTime,
  onElementChange,
  onElementCommit,
  onDefaultsChange,
  onAddKeyframe,
  onRemoveKeyframe,
  onExecuteAIAction,
}: PropertyPanelProps) {
  const { t } = useTranslation();
  const isProfessionalMode = mode === 'professional';

  // Determine if we're editing defaults or an element
  const isEditingDefaults = !element;

  // Get the data source (element or defaults)
  const dataSource = element || projectDefaults;

  // Calculate local time for the element
  const localTime = useMemo(() => {
    if (!element) return 0;
    return currentTime - element.startTime + element.trimStart;
  }, [element, currentTime]);

  // Get property value (considering keyframes for animatable properties)
  const getPropertyValue = useCallback(
    (
      propertyPath: string,
      definition: PropertyDefinition,
    ): number | string | boolean | undefined => {
      if (!dataSource) return undefined;

      // Element-specific properties - return default values when no element selected
      if (!element) {
        if (propertyPath === 'name') return '';
        if (propertyPath === 'startTime') return 0;
        if (propertyPath === 'duration') return 0;
      }

      // Special handling for duration - show effective duration instead of source duration
      if (propertyPath === 'duration' && element) {
        const effectiveDuration = element.duration - element.trimStart - element.trimEnd;
        return Math.max(0.1, effectiveDuration);
      }

      // Handle nested paths (e.g., 'animTransform.x', 'audio.volume')
      const parts = propertyPath.split('.');
      let current: unknown = dataSource;

      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
          current = (current as Record<string, unknown>)[part];
        } else {
          // Special handling for animTransform - return default values if not initialized
          if (parts[0] === 'animTransform' && definition.animatable) {
            const defaultTransform = createDefaultElementTransform();
            const subKey = parts[1];
            if (subKey && subKey in defaultTransform) {
              const animProp = defaultTransform[subKey as keyof typeof defaultTransform];
              if (typeof animProp === 'object' && 'baseValue' in animProp) {
                return animProp.baseValue;
              }
            }
          }
          return undefined;
        }
      }

      // For animatable properties, check if it's an AnimatableProperty object
      if (
        definition.animatable &&
        current &&
        typeof current === 'object' &&
        'baseValue' in current
      ) {
        const animProp = current as AnimatableProperty;
        // Return base value for now (animation interpolation handled elsewhere)
        return animProp.baseValue;
      }

      return current as number | string | boolean;
    },
    [dataSource, element],
  );

  // Check if at a keyframe
  const isAtKeyframe = useCallback(
    (propertyPath: string): boolean => {
      if (!element) return false;

      const parts = propertyPath.split('.');
      let current: unknown = element;

      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
          current = (current as Record<string, unknown>)[part];
        } else {
          return false;
        }
      }

      if (current && typeof current === 'object' && 'keyframes' in current) {
        return getKeyframeAtTime(current as AnimatableProperty, localTime) !== undefined;
      }

      return false;
    },
    [element, localTime],
  );

  // Handle add keyframe
  const handleAddKeyframe = useCallback(
    (propertyPath: string, definition: PropertyDefinition) => {
      if (!element) return;

      const value = getPropertyValue(propertyPath, definition);
      if (typeof value === 'number') {
        onAddKeyframe(element.id, propertyPath, value);
      }
    },
    [element, getPropertyValue, onAddKeyframe],
  );

  // Handle speed change
  const handleSpeedChange = useCallback(
    (speed: SpeedProperties) => {
      if (!element) return;
      onElementChange(element.id, { speed } as Partial<TimelineElement>);
      onElementCommit?.(element.id, { speed } as Partial<TimelineElement>);
    },
    [element, onElementChange, onElementCommit],
  );

  // Handle in-transition change
  const handleInTransitionChange = useCallback(
    (transition: Transition | null) => {
      if (!element) return;
      const changes = { transitionIn: transition ?? undefined } as Partial<TimelineElement>;
      onElementChange(element.id, changes);
      onElementCommit?.(element.id, changes);
    },
    [element, onElementChange, onElementCommit],
  );

  // Handle out-transition change
  const handleOutTransitionChange = useCallback(
    (transition: Transition | null) => {
      if (!element) return;
      const changes = { transitionOut: transition ?? undefined } as Partial<TimelineElement>;
      onElementChange(element.id, changes);
      onElementCommit?.(element.id, changes);
    },
    [element, onElementChange, onElementCommit],
  );

  // Handle remove keyframe
  const handleRemoveKeyframe = useCallback(
    (propertyPath: string) => {
      if (!element) return;
      onRemoveKeyframe(element.id, propertyPath);
    },
    [element, onRemoveKeyframe],
  );

  // Handle color correction change — also sync to element.effects for engine rendering
  const handleColorCorrectionChange = useCallback(
    (colorCorrection: ColorCorrection) => {
      if (!element) return;
      // Merge color correction as a synthetic effect in element.effects
      // so it flows through the element.update → engine streaming path
      const currentEffects = element.effects ?? [];
      const mergedEffects = mergeColorCorrectionEffect(currentEffects, colorCorrection);
      const changes = { colorCorrection, effects: mergedEffects } as Partial<TimelineElement>;
      onElementChange(element.id, changes);
      onElementCommit?.(element.id, changes);
    },
    [element, onElementChange, onElementCommit],
  );

  // Handle effects change
  const handleEffectsChange = useCallback(
    (effects: EffectInstance[]) => {
      if (!element) return;
      const changes = { effects } as Partial<TimelineElement>;
      onElementChange(element.id, changes);
      onElementCommit?.(element.id, changes);
    },
    [element, onElementChange, onElementCommit],
  );

  const handleMasksChange = useCallback(
    (masks: MaskInstance[]) => {
      if (!element) return;
      const changes = { masks } as Partial<TimelineElement>;
      onElementChange(element.id, changes);
      onElementCommit?.(element.id, changes);
    },
    [element, onElementChange, onElementCommit],
  );

  // Handle blend mode change (discrete value, commit immediately)
  const handleBlendModeChange = useCallback(
    (blendMode: string) => {
      if (!element) return;
      const changes = { blendMode } as Partial<TimelineElement>;
      onElementChange(element.id, changes);
      onElementCommit?.(element.id, changes);
    },
    [element, onElementChange, onElementCommit],
  );

  // Handle loudness normalization - apply recommended gain
  const handleApplyNormalizedGain = useCallback(
    (gain: number) => {
      if (!element) return;
      onElementChange(element.id, createAudioElementPatch(element, 'gain', gain));
      onElementCommit?.(element.id, createAudioElementPatch(element, 'gain', gain));
    },
    [element, onElementChange, onElementCommit],
  );

  // Determine if property editing is disabled
  const isDisabled = !element;

  const previewBasicProperty = useCallback(
    (propertyKey: BasicPropertyKey, value: string | number) => {
      if (!element) return;
      onElementChange(element.id, createBasicElementPatch(element, propertyKey, value));
    },
    [element, onElementChange],
  );

  const commitBasicProperty = useCallback(
    (propertyKey: BasicPropertyKey, value: string | number) => {
      if (!element || !onElementCommit) return;
      onElementCommit(element.id, createBasicElementPatch(element, propertyKey, value));
    },
    [element, onElementCommit],
  );

  const previewTransformProperty = useCallback(
    (propertyKey: TransformPropertyKey, value: number) => {
      if (!element) return;
      onElementChange(element.id, createTransformElementPatch(element, propertyKey, value));
    },
    [element, onElementChange],
  );

  const commitTransformProperty = useCallback(
    (propertyKey: TransformPropertyKey, value: number) => {
      if (!element || !onElementCommit) return;
      onElementCommit(element.id, createTransformElementPatch(element, propertyKey, value));
    },
    [element, onElementCommit],
  );

  const previewTextProperty = useCallback(
    (propertyKey: TextPropertyKey, value: string | number) => {
      if (isEditingDefaults) {
        if (!projectDefaults) return;
        onDefaultsChange(
          createTextDefaultsPatch(projectDefaults, toTextDefaultsPropertyKey(propertyKey), value),
        );
        return;
      }

      if (!element) return;
      onElementChange(element.id, createTextElementPatch(propertyKey, value));
    },
    [element, isEditingDefaults, onDefaultsChange, onElementChange, projectDefaults],
  );

  const commitTextProperty = useCallback(
    (propertyKey: TextPropertyKey, value: string | number) => {
      if (isEditingDefaults) {
        if (!projectDefaults) return;
        onDefaultsChange(
          createTextDefaultsPatch(projectDefaults, toTextDefaultsPropertyKey(propertyKey), value),
        );
        return;
      }

      if (!element || !onElementCommit) return;
      onElementCommit(element.id, createTextElementPatch(propertyKey, value));
    },
    [element, isEditingDefaults, onDefaultsChange, onElementCommit, projectDefaults],
  );

  const previewSubtitleProperty = useCallback(
    (propertyKey: SubtitlePropertyKey, value: string | number) => {
      if (!element) return;
      onElementChange(element.id, createSubtitleElementPatch(propertyKey, value));
    },
    [element, onElementChange],
  );

  const commitSubtitleProperty = useCallback(
    (propertyKey: SubtitlePropertyKey, value: string | number) => {
      if (!element || !onElementCommit) return;
      onElementCommit(element.id, createSubtitleElementPatch(propertyKey, value));
    },
    [element, onElementCommit],
  );

  const previewAudioProperty = useCallback(
    (propertyKey: AudioPropertyKey, value: number | boolean) => {
      if (isEditingDefaults) {
        if (!projectDefaults) return;
        onDefaultsChange(
          createAudioDefaultsPatch(
            projectDefaults,
            toAudioDefaultsPropertyKey(propertyKey),
            readNumberValue(propertyKey, value),
          ),
        );
        return;
      }

      if (!element) return;
      onElementChange(element.id, createAudioElementPatch(element, propertyKey, value));
    },
    [element, isEditingDefaults, onDefaultsChange, onElementChange, projectDefaults],
  );

  const commitAudioProperty = useCallback(
    (propertyKey: AudioPropertyKey, value: number | boolean) => {
      if (isEditingDefaults) {
        if (!projectDefaults) return;
        onDefaultsChange(
          createAudioDefaultsPatch(
            projectDefaults,
            toAudioDefaultsPropertyKey(propertyKey),
            readNumberValue(propertyKey, value),
          ),
        );
        return;
      }

      if (!element || !onElementCommit) return;
      onElementCommit(element.id, createAudioElementPatch(element, propertyKey, value));
    },
    [element, isEditingDefaults, onDefaultsChange, onElementCommit, projectDefaults],
  );

  const toggleTransformKeyframe = useCallback(
    (propertyKey: TransformPropertyKey) => {
      const propertyPath = `animTransform.${propertyKey}`;
      const definition = getPropertyDefinition(TRANSFORM_PROPERTIES, propertyKey);

      if (isAtKeyframe(propertyPath)) {
        handleRemoveKeyframe(propertyPath);
      } else {
        handleAddKeyframe(propertyPath, definition);
      }
    },
    [handleAddKeyframe, handleRemoveKeyframe, isAtKeyframe],
  );

  const renderBasicPropertyRows = useCallback((): ReactNode => {
    if (!element) return null;

    return (
      <div className="cut-typed-property-panel" data-cut-panel-path="typed-basic">
        <SharedPropertyRow
          label={t('propertyPanel.basic.name')}
          propertyId="name"
          disabled={isDisabled}
        >
          <input
            aria-label={t('propertyPanel.basic.name')}
            className="cut-shared-text-input"
            disabled={isDisabled}
            onBlur={(event) => commitBasicProperty('name', event.currentTarget.value)}
            onChange={(event) => previewBasicProperty('name', event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitBasicProperty('name', event.currentTarget.value);
              }
            }}
            type="text"
            value={element.name}
          />
        </SharedPropertyRow>
        <NumberPropertyRow
          density="compact"
          disabled={isDisabled}
          id="startTime"
          label={t('propertyPanel.basic.startTime')}
          min={0}
          onCommit={(_, value) => commitBasicProperty('startTime', value)}
          onPreviewChange={(_, value) => previewBasicProperty('startTime', value)}
          step={0.01}
          unit="s"
          value={element.startTime}
        />
        <NumberPropertyRow
          density="compact"
          disabled={isDisabled}
          id="duration"
          label={t('propertyPanel.basic.duration')}
          min={0.1}
          onCommit={(_, value) => commitBasicProperty('duration', value)}
          onPreviewChange={(_, value) => previewBasicProperty('duration', value)}
          step={0.01}
          unit="s"
          value={Math.max(0.1, element.duration - element.trimStart - element.trimEnd)}
        />
      </div>
    );
  }, [commitBasicProperty, element, isDisabled, previewBasicProperty, t]);

  const renderTransformPropertyRows = useCallback((): ReactNode => {
    if (!element) return null;

    return (
      <div className="cut-typed-property-panel" data-cut-panel-path="typed-transform">
        {TRANSFORM_PROPERTIES.map((definition) => {
          const propertyKey = definition.key as TransformPropertyKey;
          const propertyPath = `animTransform.${propertyKey}`;
          const value = getPropertyValue(propertyPath, definition);
          const numericValue = typeof value === 'number' ? value : (definition.min ?? 0);
          const keyframe = (
            <KeyframeButton
              animatable
              disabled={isDisabled}
              hasKeyframes={Boolean(element.animTransform?.[propertyKey]?.keyframes.length)}
              isAtKeyframe={isAtKeyframe(propertyPath)}
              onToggleKeyframe={() => toggleTransformKeyframe(propertyKey)}
              propertyId={propertyPath}
            />
          );

          if (definition.type === 'number') {
            return (
              <NumberPropertyRow
                density="compact"
                disabled={isDisabled}
                id={propertyPath}
                key={propertyPath}
                keyframe={keyframe}
                label={t(definition.labelKey)}
                max={definition.max}
                min={definition.min}
                onCommit={(_, nextValue) => commitTransformProperty(propertyKey, nextValue)}
                onPreviewChange={(_, nextValue) => previewTransformProperty(propertyKey, nextValue)}
                step={definition.step}
                unit={definition.unit}
                value={numericValue}
              />
            );
          }

          return (
            <SliderPropertyRow
              density="compact"
              disabled={isDisabled}
              id={propertyPath}
              key={propertyPath}
              keyframe={keyframe}
              label={t(definition.labelKey)}
              max={definition.max ?? 1}
              min={definition.min ?? 0}
              onCommit={(_, nextValue) => commitTransformProperty(propertyKey, nextValue)}
              onPreviewChange={(_, nextValue) => previewTransformProperty(propertyKey, nextValue)}
              step={definition.step}
              unit={definition.unit}
              value={numericValue}
            />
          );
        })}
      </div>
    );
  }, [
    commitTransformProperty,
    element,
    getPropertyValue,
    isAtKeyframe,
    isDisabled,
    previewTransformProperty,
    t,
    toggleTransformKeyframe,
  ]);

  const renderTextStringRow = useCallback(
    (propertyKey: TextPropertyKey, value: string): ReactNode => {
      const definition = getPropertyDefinition(TEXT_PROPERTIES, propertyKey);

      return (
        <SharedPropertyRow
          density="compact"
          disabled={isDisabled}
          key={propertyKey}
          label={t(definition.labelKey)}
          propertyId={isEditingDefaults ? `text.${propertyKey}` : propertyKey}
        >
          <input
            aria-label={t(definition.labelKey)}
            className="cut-shared-text-input"
            disabled={isDisabled}
            onBlur={(event) => commitTextProperty(propertyKey, event.currentTarget.value)}
            onChange={(event) => previewTextProperty(propertyKey, event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitTextProperty(propertyKey, event.currentTarget.value);
              }
            }}
            type="text"
            value={value}
          />
        </SharedPropertyRow>
      );
    },
    [commitTextProperty, isDisabled, isEditingDefaults, previewTextProperty, t],
  );

  const renderTextPropertyRows = useCallback((): ReactNode => {
    const textSource = element?.type === 'text' ? element : null;
    const defaults = projectDefaults?.text;
    if (!textSource && !defaults) return null;

    const fontSizeDefinition = getPropertyDefinition(TEXT_PROPERTIES, 'fontSize');
    const textAlignDefinition = getPropertyDefinition(TEXT_PROPERTIES, 'textAlign');
    const fontWeightDefinition = getPropertyDefinition(TEXT_PROPERTIES, 'fontWeight');
    const fontStyleDefinition = getPropertyDefinition(TEXT_PROPERTIES, 'fontStyle');
    const textDecorationDefinition = getPropertyDefinition(TEXT_PROPERTIES, 'textDecoration');
    const value = {
      content: textSource?.content ?? '',
      fontSize: textSource?.fontSize ?? defaults?.fontSize ?? 48,
      fontFamily: textSource?.fontFamily ?? defaults?.fontFamily ?? 'Arial',
      color: textSource?.color ?? defaults?.color ?? '#ffffff',
      backgroundColor: textSource?.backgroundColor ?? defaults?.backgroundColor ?? 'transparent',
      textAlign: textSource?.textAlign ?? defaults?.textAlign ?? 'center',
      fontWeight: textSource?.fontWeight ?? defaults?.fontWeight ?? 'normal',
      fontStyle: textSource?.fontStyle ?? defaults?.fontStyle ?? 'normal',
      textDecoration: textSource?.textDecoration ?? defaults?.textDecoration ?? 'none',
    };

    return (
      <div className="cut-typed-property-panel" data-cut-panel-path="typed-text">
        {!isEditingDefaults ? renderTextStringRow('content', value.content) : null}
        <NumberPropertyRow
          density="compact"
          disabled={isDisabled}
          id={isEditingDefaults ? 'text.fontSize' : 'fontSize'}
          label={t(fontSizeDefinition.labelKey)}
          max={fontSizeDefinition.max}
          min={fontSizeDefinition.min}
          onCommit={(_, nextValue) => commitTextProperty('fontSize', nextValue)}
          onPreviewChange={(_, nextValue) => previewTextProperty('fontSize', nextValue)}
          step={fontSizeDefinition.step}
          unit={fontSizeDefinition.unit}
          value={value.fontSize}
        />
        {renderTextStringRow('fontFamily', value.fontFamily)}
        <ColorPropertyRow
          density="compact"
          disabled={isDisabled}
          id={isEditingDefaults ? 'text.color' : 'color'}
          label={t('propertyPanel.text.color')}
          onCommit={(_, nextValue) => commitTextProperty('color', nextValue)}
          onPreviewChange={(_, nextValue) => previewTextProperty('color', nextValue)}
          value={value.color}
        />
        {renderTextStringRow('backgroundColor', value.backgroundColor)}
        <SelectPropertyRow
          density="compact"
          disabled={isDisabled}
          id={isEditingDefaults ? 'text.textAlign' : 'textAlign'}
          label={t(textAlignDefinition.labelKey)}
          onCommit={(_, nextValue) => commitTextProperty('textAlign', nextValue)}
          onPreviewChange={(_, nextValue) => previewTextProperty('textAlign', nextValue)}
          options={getSelectOptions(textAlignDefinition).map((option) => ({
            ...option,
            label: t(option.label),
          }))}
          value={value.textAlign}
        />
        <SelectPropertyRow
          density="compact"
          disabled={isDisabled}
          id={isEditingDefaults ? 'text.fontWeight' : 'fontWeight'}
          label={t(fontWeightDefinition.labelKey)}
          onCommit={(_, nextValue) => commitTextProperty('fontWeight', nextValue)}
          onPreviewChange={(_, nextValue) => previewTextProperty('fontWeight', nextValue)}
          options={getSelectOptions(fontWeightDefinition).map((option) => ({
            ...option,
            label: t(option.label),
          }))}
          value={value.fontWeight}
        />
        <SelectPropertyRow
          density="compact"
          disabled={isDisabled}
          id={isEditingDefaults ? 'text.fontStyle' : 'fontStyle'}
          label={t(fontStyleDefinition.labelKey)}
          onCommit={(_, nextValue) => commitTextProperty('fontStyle', nextValue)}
          onPreviewChange={(_, nextValue) => previewTextProperty('fontStyle', nextValue)}
          options={getSelectOptions(fontStyleDefinition).map((option) => ({
            ...option,
            label: t(option.label),
          }))}
          value={value.fontStyle}
        />
        <SelectPropertyRow
          density="compact"
          disabled={isDisabled}
          id={isEditingDefaults ? 'text.textDecoration' : 'textDecoration'}
          label={t(textDecorationDefinition.labelKey)}
          onCommit={(_, nextValue) => commitTextProperty('textDecoration', nextValue)}
          onPreviewChange={(_, nextValue) => previewTextProperty('textDecoration', nextValue)}
          options={getSelectOptions(textDecorationDefinition).map((option) => ({
            ...option,
            label: t(option.label),
          }))}
          value={value.textDecoration}
        />
      </div>
    );
  }, [
    commitTextProperty,
    element,
    isDisabled,
    isEditingDefaults,
    previewTextProperty,
    projectDefaults,
    renderTextStringRow,
    t,
  ]);

  const renderSubtitleStringRow = useCallback(
    (propertyKey: SubtitlePropertyKey, value: string): ReactNode => {
      const definition = getPropertyDefinition(SUBTITLE_PROPERTIES, propertyKey);

      return (
        <SharedPropertyRow
          density="compact"
          disabled={isDisabled}
          key={propertyKey}
          label={t(definition.labelKey)}
          propertyId={propertyKey}
        >
          <input
            aria-label={t(definition.labelKey)}
            className="cut-shared-text-input"
            disabled={isDisabled}
            onBlur={(event) => commitSubtitleProperty(propertyKey, event.currentTarget.value)}
            onChange={(event) => previewSubtitleProperty(propertyKey, event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitSubtitleProperty(propertyKey, event.currentTarget.value);
              }
            }}
            type="text"
            value={value}
          />
        </SharedPropertyRow>
      );
    },
    [commitSubtitleProperty, isDisabled, previewSubtitleProperty, t],
  );

  const renderSubtitlePropertyRows = useCallback((): ReactNode => {
    if (element?.type !== 'subtitle') return null;

    const fontSizeDefinition = getPropertyDefinition(SUBTITLE_PROPERTIES, 'fontSize');
    const textAlignDefinition = getPropertyDefinition(SUBTITLE_PROPERTIES, 'textAlign');
    const strokeWidthDefinition = getPropertyDefinition(SUBTITLE_PROPERTIES, 'strokeWidth');

    return (
      <div className="cut-typed-property-panel" data-cut-panel-path="typed-subtitle">
        {renderSubtitleStringRow('text', element.text)}
        <NumberPropertyRow
          density="compact"
          disabled={isDisabled}
          id="fontSize"
          label={t(fontSizeDefinition.labelKey)}
          max={fontSizeDefinition.max}
          min={fontSizeDefinition.min}
          onCommit={(_, nextValue) => commitSubtitleProperty('fontSize', nextValue)}
          onPreviewChange={(_, nextValue) => previewSubtitleProperty('fontSize', nextValue)}
          step={fontSizeDefinition.step}
          unit={fontSizeDefinition.unit}
          value={element.fontSize}
        />
        {renderSubtitleStringRow('fontFamily', element.fontFamily)}
        <ColorPropertyRow
          density="compact"
          disabled={isDisabled}
          id="color"
          label={t('propertyPanel.text.color')}
          onCommit={(_, nextValue) => commitSubtitleProperty('color', nextValue)}
          onPreviewChange={(_, nextValue) => previewSubtitleProperty('color', nextValue)}
          value={element.color}
        />
        {renderSubtitleStringRow('backgroundColor', element.backgroundColor)}
        <SelectPropertyRow
          density="compact"
          disabled={isDisabled}
          id="textAlign"
          label={t(textAlignDefinition.labelKey)}
          onCommit={(_, nextValue) => commitSubtitleProperty('textAlign', nextValue)}
          onPreviewChange={(_, nextValue) => previewSubtitleProperty('textAlign', nextValue)}
          options={getSelectOptions(textAlignDefinition).map((option) => ({
            ...option,
            label: t(option.label),
          }))}
          value={element.textAlign}
        />
        <ColorPropertyRow
          density="compact"
          disabled={isDisabled}
          id="strokeColor"
          label={t('propertyPanel.subtitle.strokeColor')}
          onCommit={(_, nextValue) => commitSubtitleProperty('strokeColor', nextValue)}
          onPreviewChange={(_, nextValue) => previewSubtitleProperty('strokeColor', nextValue)}
          value={element.strokeColor}
        />
        <NumberPropertyRow
          density="compact"
          disabled={isDisabled}
          id="strokeWidth"
          label={t(strokeWidthDefinition.labelKey)}
          max={strokeWidthDefinition.max}
          min={strokeWidthDefinition.min}
          onCommit={(_, nextValue) => commitSubtitleProperty('strokeWidth', nextValue)}
          onPreviewChange={(_, nextValue) => previewSubtitleProperty('strokeWidth', nextValue)}
          step={strokeWidthDefinition.step}
          unit={strokeWidthDefinition.unit}
          value={element.strokeWidth}
        />
      </div>
    );
  }, [
    commitSubtitleProperty,
    element,
    isDisabled,
    previewSubtitleProperty,
    renderSubtitleStringRow,
    t,
  ]);

  const renderAudioPropertyRows = useCallback((): ReactNode => {
    const audioSource = element?.audio ?? DEFAULT_AUDIO_PROPERTIES;
    const defaults = projectDefaults?.audio;
    if (!element && !defaults) return null;

    const volumeDefinition = getPropertyDefinition(AUDIO_PROPERTIES, 'volume');
    const panDefinition = getPropertyDefinition(AUDIO_PROPERTIES, 'pan');
    const mutedDefinition = getPropertyDefinition(AUDIO_PROPERTIES, 'muted');
    const fadeInDefinition = getPropertyDefinition(AUDIO_PROPERTIES, 'fadeIn');
    const fadeOutDefinition = getPropertyDefinition(AUDIO_PROPERTIES, 'fadeOut');
    const gainDefinition = getPropertyDefinition(AUDIO_PROPERTIES, 'gain');
    const value = {
      volume: element ? audioSource.volume : (defaults?.volume ?? 1),
      pan: element ? audioSource.pan : (defaults?.pan ?? 0),
      muted: element ? audioSource.muted : false,
      fadeIn: element ? audioSource.fadeIn : (defaults?.fadeIn ?? 0),
      fadeOut: element ? audioSource.fadeOut : (defaults?.fadeOut ?? 0),
      gain: element ? audioSource.gain : (defaults?.gain ?? 0),
    };

    return (
      <div className="cut-typed-property-panel" data-cut-panel-path="typed-audio">
        <SliderPropertyRow
          density="compact"
          disabled={isDisabled}
          id="audio.volume"
          label={t(volumeDefinition.labelKey)}
          max={volumeDefinition.max ?? 2}
          min={volumeDefinition.min ?? 0}
          onCommit={(_, nextValue) => commitAudioProperty('volume', nextValue)}
          onPreviewChange={(_, nextValue) => previewAudioProperty('volume', nextValue)}
          step={volumeDefinition.step}
          value={value.volume}
        />
        <SliderPropertyRow
          density="compact"
          disabled={isDisabled}
          id="audio.pan"
          label={t(panDefinition.labelKey)}
          max={panDefinition.max ?? 1}
          min={panDefinition.min ?? -1}
          onCommit={(_, nextValue) => commitAudioProperty('pan', nextValue)}
          onPreviewChange={(_, nextValue) => previewAudioProperty('pan', nextValue)}
          step={panDefinition.step}
          value={value.pan}
        />
        {element ? (
          <SharedPropertyRow
            density="compact"
            disabled={isDisabled}
            label={t(mutedDefinition.labelKey)}
            propertyId="audio.muted"
          >
            <Checkbox
              checked={value.muted}
              disabled={isDisabled}
              onCheckedChange={(checked) => {
                previewAudioProperty('muted', checked);
                commitAudioProperty('muted', checked);
              }}
            />
          </SharedPropertyRow>
        ) : null}
        <NumberPropertyRow
          density="compact"
          disabled={isDisabled}
          id="audio.fadeIn"
          label={t(fadeInDefinition.labelKey)}
          max={fadeInDefinition.max}
          min={fadeInDefinition.min}
          onCommit={(_, nextValue) => commitAudioProperty('fadeIn', nextValue)}
          onPreviewChange={(_, nextValue) => previewAudioProperty('fadeIn', nextValue)}
          step={fadeInDefinition.step}
          unit={fadeInDefinition.unit}
          value={value.fadeIn}
        />
        <NumberPropertyRow
          density="compact"
          disabled={isDisabled}
          id="audio.fadeOut"
          label={t(fadeOutDefinition.labelKey)}
          max={fadeOutDefinition.max}
          min={fadeOutDefinition.min}
          onCommit={(_, nextValue) => commitAudioProperty('fadeOut', nextValue)}
          onPreviewChange={(_, nextValue) => previewAudioProperty('fadeOut', nextValue)}
          step={fadeOutDefinition.step}
          unit={fadeOutDefinition.unit}
          value={value.fadeOut}
        />
        <SliderPropertyRow
          density="compact"
          disabled={isDisabled}
          id="audio.gain"
          label={t(gainDefinition.labelKey)}
          max={gainDefinition.max ?? 20}
          min={gainDefinition.min ?? -20}
          onCommit={(_, nextValue) => commitAudioProperty('gain', nextValue)}
          onPreviewChange={(_, nextValue) => previewAudioProperty('gain', nextValue)}
          step={gainDefinition.step}
          unit={gainDefinition.unit}
          value={value.gain}
        />
      </div>
    );
  }, [commitAudioProperty, element, isDisabled, previewAudioProperty, projectDefaults, t]);

  return (
    <div className="nk-prop-panel">
      {/* AI Actions Button - show when element is selected */}
      {element && onExecuteAIAction && (
        <div className="px-2 py-2 border-b border-[var(--nk-border)]">
          <AIActionsButton element={element} onExecuteAction={onExecuteAIAction} />
        </div>
      )}

      {/* Basic Properties - always show */}
      <PropertyGroup
        titleKey="propertyPanel.group.basic"
        disabled={isDisabled}
        defaultExpanded={!isDisabled}
      >
        {renderBasicPropertyRows()}
      </PropertyGroup>

      {/* Transform Properties - always show */}
      <PropertyGroup
        titleKey="propertyPanel.group.transform"
        disabled={isDisabled}
        defaultExpanded={!isDisabled}
      >
        {renderTransformPropertyRows()}
        {isProfessionalMode ? (
          <div className="nk-prop-row">
            <label className="nk-prop-label">{t('blendMode.title')}</label>
            <select
              className="nk-prop-input"
              value={element?.blendMode ?? 'normal'}
              onChange={(e) => handleBlendModeChange(e.target.value)}
              disabled={isDisabled}
            >
              {(
                [
                  'normal',
                  'darken',
                  'lighten',
                  'contrast',
                  'inversion',
                  'component',
                ] as BlendModeCategory[]
              ).map((cat) => (
                <optgroup key={cat} label={t(BLEND_MODE_CATEGORY_I18N_KEYS[cat])}>
                  {BLEND_MODE_DEFINITIONS.filter((d) => d.category === cat).map((d) => (
                    <option key={d.mode} value={d.mode}>
                      {t(d.nameKey)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        ) : null}
      </PropertyGroup>

      {/* Text Properties */}
      {(isEditingDefaults || element?.type === 'text') && (
        <PropertyGroup
          titleKey="propertyPanel.group.text"
          disabled={isDisabled}
          defaultExpanded={!isDisabled}
        >
          {renderTextPropertyRows()}
        </PropertyGroup>
      )}

      {/* Subtitle Properties */}
      {element?.type === 'subtitle' && (
        <PropertyGroup
          titleKey="propertyPanel.group.subtitle"
          disabled={isDisabled}
          defaultExpanded={!isDisabled}
        >
          {renderSubtitlePropertyRows()}
        </PropertyGroup>
      )}

      {/* Audio Properties - always show */}
      <PropertyGroup
        titleKey="propertyPanel.group.audio"
        disabled={isDisabled}
        defaultExpanded={!isDisabled}
      >
        {renderAudioPropertyRows()}
        {element && hasMediaSource(element) && (
          <NormalizeLoudnessButton
            source={element.src}
            onApplyGain={handleApplyNormalizedGain}
            disabled={isDisabled}
          />
        )}
      </PropertyGroup>

      {isProfessionalMode ? (
        <>
          <PropertyGroup
            titleKey="propertyPanel.group.speed"
            defaultExpanded={false}
            disabled={isDisabled}
          >
            <SpeedControl
              speed={element?.speed}
              originalDuration={element?.duration ?? 0}
              onChange={handleSpeedChange}
              disabled={isDisabled}
            />
          </PropertyGroup>

          <PropertyGroup
            titleKey="propertyPanel.group.inTransition"
            defaultExpanded={false}
            disabled={isDisabled}
          >
            <TransitionPicker
              transition={getElementTransition(element, 'transitionIn')}
              onChange={handleInTransitionChange}
              showDuration={true}
              disabled={isDisabled}
            />
          </PropertyGroup>

          <PropertyGroup
            titleKey="propertyPanel.group.outTransition"
            defaultExpanded={false}
            disabled={isDisabled}
          >
            <TransitionPicker
              transition={getElementTransition(element, 'transitionOut')}
              onChange={handleOutTransitionChange}
              showDuration={true}
              disabled={isDisabled}
            />
          </PropertyGroup>

          <PropertyGroup
            titleKey="colorCorrection.title"
            defaultExpanded={false}
            disabled={isDisabled}
          >
            <ColorCorrectionPanel
              colorCorrection={element?.colorCorrection}
              onChange={handleColorCorrectionChange}
              disabled={isDisabled}
            />
          </PropertyGroup>

          <PropertyGroup titleKey="effects.title" defaultExpanded={false} disabled={isDisabled}>
            <EffectsPanel
              effects={element?.effects}
              onChange={handleEffectsChange}
              disabled={isDisabled}
            />
          </PropertyGroup>

          <PropertyGroup titleKey="masks.title" defaultExpanded={false} disabled={isDisabled}>
            <MaskPanel masks={element?.masks} onChange={handleMasksChange} disabled={isDisabled} />
          </PropertyGroup>
        </>
      ) : null}
    </div>
  );
});

export default PropertyPanel;
