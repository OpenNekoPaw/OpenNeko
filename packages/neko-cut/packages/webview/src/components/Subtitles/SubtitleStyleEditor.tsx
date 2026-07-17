/**
 * SubtitleStyleEditor Component
 * 字幕样式编辑器组件
 */

import { memo, useCallback } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import type {
  SubtitleStyle,
  SubtitleAlignment,
  SubtitleVerticalAlign,
  SubtitleAnimation,
} from '../../types/subtitle';

// =============================================================================
// Types
// =============================================================================

interface SubtitleStyleEditorProps {
  style: SubtitleStyle;
  onChange: (style: SubtitleStyle) => void;
}

// =============================================================================
// Property Row Components
// =============================================================================

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

const SliderRow = memo(function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}: SliderRowProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[11px] text-[var(--vscode-foreground)] w-24 shrink-0">{label}</label>
      <input
        type="range"
        className="flex-1 h-1"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="text-[10px] text-[var(--vscode-descriptionForeground)] w-12 text-right">
        {value}
        {unit}
      </span>
    </div>
  );
});

interface ColorRowProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const ColorRow = memo(function ColorRow({ label, value, onChange }: ColorRowProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[11px] text-[var(--vscode-foreground)] w-24 shrink-0">{label}</label>
      <div className="flex-1 flex items-center gap-2">
        <input
          type="color"
          className="w-6 h-6 rounded cursor-pointer"
          value={value.startsWith('#') ? value : '#ffffff'}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          type="text"
          className="flex-1 px-2 py-1 text-[10px] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
});

interface SelectRowProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

function SelectRow<T extends string>({ label, value, options, onChange }: SelectRowProps<T>) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[11px] text-[var(--vscode-foreground)] w-24 shrink-0">{label}</label>
      <select
        className="flex-1 px-2 py-1 text-[10px] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface CheckboxRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const CheckboxRow = memo(function CheckboxRow({ label, checked, onChange }: CheckboxRowProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[11px] text-[var(--vscode-foreground)] w-24 shrink-0">{label}</label>
      <input
        type="checkbox"
        className="w-4 h-4"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
});

// =============================================================================
// Section Component
// =============================================================================

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

const Section = memo(function Section({ title, children, defaultExpanded = true }: SectionProps) {
  return (
    <div className="border-b border-[var(--vscode-panel-border)] last:border-b-0">
      <div className="px-3 py-2 text-[11px] font-medium text-[var(--vscode-foreground)] bg-[var(--vscode-sideBar-background)]">
        {title}
      </div>
      {defaultExpanded && <div className="px-3 py-2 space-y-2">{children}</div>}
    </div>
  );
});

// =============================================================================
// SubtitleStyleEditor Component
// =============================================================================

export const SubtitleStyleEditor = memo(function SubtitleStyleEditor({
  style,
  onChange,
}: SubtitleStyleEditorProps) {
  const { t } = useTranslation();

  const updateStyle = useCallback(
    <K extends keyof SubtitleStyle>(key: K, value: SubtitleStyle[K]) => {
      onChange({ ...style, [key]: value });
    },
    [style, onChange],
  );

  // Alignment options
  const alignmentOptions: { value: SubtitleAlignment; label: string }[] = [
    { value: 'left', label: t('subtitles.alignment.left') },
    { value: 'center', label: t('subtitles.alignment.center') },
    { value: 'right', label: t('subtitles.alignment.right') },
  ];

  const verticalAlignOptions: { value: SubtitleVerticalAlign; label: string }[] = [
    { value: 'top', label: t('subtitles.alignment.top') },
    { value: 'middle', label: t('subtitles.alignment.middle') },
    { value: 'bottom', label: t('subtitles.alignment.bottom') },
  ];

  // Animation options
  const animationOptions: { value: SubtitleAnimation; label: string }[] = [
    { value: 'none', label: t('subtitles.animation.none') },
    { value: 'fade', label: t('subtitles.animation.fade') },
    { value: 'slide-up', label: t('subtitles.animation.slideUp') },
    { value: 'slide-down', label: t('subtitles.animation.slideDown') },
    { value: 'slide-left', label: t('subtitles.animation.slideLeft') },
    { value: 'slide-right', label: t('subtitles.animation.slideRight') },
    { value: 'zoom-in', label: t('subtitles.animation.zoomIn') },
    { value: 'zoom-out', label: t('subtitles.animation.zoomOut') },
    { value: 'typewriter', label: t('subtitles.animation.typewriter') },
    { value: 'bounce', label: t('subtitles.animation.bounce') },
    { value: 'shake', label: t('subtitles.animation.shake') },
  ];

  return (
    <div className="divide-y divide-[var(--vscode-panel-border)]">
      {/* Font Section */}
      <Section title={t('subtitles.style.font')}>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-[var(--vscode-foreground)] w-24 shrink-0">
            {t('subtitles.style.fontFamily')}
          </label>
          <input
            type="text"
            className="flex-1 px-2 py-1 text-[10px] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded"
            value={style.fontFamily}
            onChange={(e) => updateStyle('fontFamily', e.target.value)}
          />
        </div>
        <SliderRow
          label={t('subtitles.style.fontSize')}
          value={style.fontSize}
          min={12}
          max={120}
          unit="px"
          onChange={(v) => updateStyle('fontSize', v)}
        />
        <SelectRow
          label={t('subtitles.style.fontWeight')}
          value={style.fontWeight}
          options={[
            { value: 'normal', label: 'Normal' },
            { value: 'bold', label: 'Bold' },
            { value: '100', label: '100' },
            { value: '200', label: '200' },
            { value: '300', label: '300' },
            { value: '400', label: '400' },
            { value: '500', label: '500' },
            { value: '600', label: '600' },
            { value: '700', label: '700' },
            { value: '800', label: '800' },
            { value: '900', label: '900' },
          ]}
          onChange={(v) => updateStyle('fontWeight', v)}
        />
        <CheckboxRow
          label={t('subtitles.style.italic')}
          checked={style.italic}
          onChange={(v) => updateStyle('italic', v)}
        />
      </Section>

      {/* Color Section */}
      <Section title={t('subtitles.style.color')}>
        <ColorRow
          label={t('subtitles.style.color')}
          value={style.color}
          onChange={(v) => updateStyle('color', v)}
        />
        <ColorRow
          label={t('subtitles.style.outlineColor')}
          value={style.outlineColor}
          onChange={(v) => updateStyle('outlineColor', v)}
        />
        <SliderRow
          label={t('subtitles.style.outlineWidth')}
          value={style.outlineWidth}
          min={0}
          max={10}
          step={0.5}
          unit="px"
          onChange={(v) => updateStyle('outlineWidth', v)}
        />
      </Section>

      {/* Background Section */}
      <Section title={t('subtitles.style.background')}>
        <ColorRow
          label={t('subtitles.style.backgroundColor')}
          value={style.backgroundColor}
          onChange={(v) => updateStyle('backgroundColor', v)}
        />
        <SliderRow
          label={t('subtitles.style.backgroundPadding')}
          value={style.backgroundPadding}
          min={0}
          max={32}
          unit="px"
          onChange={(v) => updateStyle('backgroundPadding', v)}
        />
        <SliderRow
          label={t('subtitles.style.backgroundRadius')}
          value={style.backgroundRadius}
          min={0}
          max={24}
          unit="px"
          onChange={(v) => updateStyle('backgroundRadius', v)}
        />
      </Section>

      {/* Shadow Section */}
      <Section title={t('subtitles.style.shadow')}>
        <ColorRow
          label={t('subtitles.style.shadowColor')}
          value={style.shadowColor}
          onChange={(v) => updateStyle('shadowColor', v)}
        />
        <SliderRow
          label="X"
          value={style.shadowOffsetX}
          min={-20}
          max={20}
          unit="px"
          onChange={(v) => updateStyle('shadowOffsetX', v)}
        />
        <SliderRow
          label="Y"
          value={style.shadowOffsetY}
          min={-20}
          max={20}
          unit="px"
          onChange={(v) => updateStyle('shadowOffsetY', v)}
        />
        <SliderRow
          label={t('subtitles.style.shadowBlur')}
          value={style.shadowBlur}
          min={0}
          max={20}
          unit="px"
          onChange={(v) => updateStyle('shadowBlur', v)}
        />
      </Section>

      {/* Position Section */}
      <Section title={t('subtitles.style.position')}>
        <SelectRow
          label={t('subtitles.style.alignment')}
          value={style.alignment}
          options={alignmentOptions}
          onChange={(v) => updateStyle('alignment', v)}
        />
        <SelectRow
          label={t('subtitles.style.verticalAlign')}
          value={style.verticalAlign}
          options={verticalAlignOptions}
          onChange={(v) => updateStyle('verticalAlign', v)}
        />
        <SliderRow
          label="X"
          value={style.positionX}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateStyle('positionX', v)}
        />
        <SliderRow
          label="Y"
          value={style.positionY}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateStyle('positionY', v)}
        />
        <SliderRow
          label={t('subtitles.style.maxWidth')}
          value={style.maxWidth}
          min={0.1}
          max={1}
          step={0.01}
          onChange={(v) => updateStyle('maxWidth', v)}
        />
      </Section>

      {/* Spacing Section */}
      <Section title={t('subtitles.style.lineSpacing')}>
        <SliderRow
          label={t('subtitles.style.lineSpacing')}
          value={style.lineSpacing}
          min={0.8}
          max={3}
          step={0.1}
          onChange={(v) => updateStyle('lineSpacing', v)}
        />
        <SliderRow
          label={t('subtitles.style.letterSpacing')}
          value={style.letterSpacing}
          min={-5}
          max={20}
          unit="px"
          onChange={(v) => updateStyle('letterSpacing', v)}
        />
      </Section>

      {/* Animation Section */}
      <Section title={t('subtitles.style.animation')}>
        <SelectRow
          label={t('subtitles.style.animationIn')}
          value={style.animationIn}
          options={animationOptions}
          onChange={(v) => updateStyle('animationIn', v)}
        />
        <SelectRow
          label={t('subtitles.style.animationOut')}
          value={style.animationOut}
          options={animationOptions}
          onChange={(v) => updateStyle('animationOut', v)}
        />
        <SliderRow
          label={t('subtitles.style.animationDuration')}
          value={style.animationDuration}
          min={0}
          max={1000}
          step={50}
          unit="ms"
          onChange={(v) => updateStyle('animationDuration', v)}
        />
      </Section>
    </div>
  );
});

export default SubtitleStyleEditor;
