import { useEffect, useMemo, useRef } from 'react';
import type { SessionMode } from '@neko/agent-contracts';
import type { ChatModelOption } from '@neko/ai-contracts';
import { aspectRatioPreviewSize } from '@neko/ui/creative';
import { SettingsIcon } from '@neko/ui/icons';
import type { MediaCategory, MediaModelSelection } from '../InputAreaContext';
import { useTranslation } from '../../../i18n/I18nContext';
import { ChevronDownIcon } from './DropdownMenu';
import { MediaCategoryIcon, SessionModeIcon } from './ComposerIcons';
import { ModelTagList } from './ModelTagList';
import {
  buildModelTags,
  groupModelOptionsByProvider,
  shortenModelLabel,
} from './model-option-presentation';
import { getCategoryColor } from './ModelIcon';
import {
  useComposerConfigCategory,
  useComposerConfigSection,
  useComposerControlMenu,
} from './composer-menu-runtime';
import { useClickOutsideSingle } from './useClickOutside';
import { dropdownPositionClass, useBoundedDropdownLayout } from './useDropdownDirection';
import type {
  ComposerConfigCategory,
  ComposerConfigSection,
  GenerationParams,
  MediaModelParameterProfile,
} from './types';

interface ComposerConfigMenuProps {
  readonly activeMode: SessionMode;
  readonly modelCatalogStatus?: 'loading' | 'ready';
  readonly availableModels: readonly ChatModelOption[];
  readonly selectedModel: string;
  readonly onModelSelect: (modelId: string) => void;
  readonly mediaModelSelection: Readonly<MediaModelSelection>;
  readonly availableMediaModels: readonly ChatModelOption[];
  readonly mediaModelParameterProfiles: Readonly<
    Partial<Record<MediaCategory, MediaModelParameterProfile>>
  >;
  readonly mediaModelOptOutEnabled?: boolean;
  readonly onMediaModelSelect: (category: MediaCategory, modelId: string) => void;
  readonly genParams: GenerationParams;
  readonly onGenParamsChange: <Category extends MediaCategory>(
    category: Category,
    params: Partial<GenerationParams[Category]>,
  ) => void;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
}

interface ParamOption<Value extends string | number | boolean | undefined = string> {
  readonly value: Value;
  readonly label: string;
  readonly hintKey?: string;
}

const CATEGORIES: readonly ComposerConfigCategory[] = ['llm', 'image', 'video', 'audio', 'music'];
const SECTIONS: readonly ComposerConfigSection[] = ['model', 'params'];
export function ComposerConfigMenu({
  activeMode,
  modelCatalogStatus = 'ready',
  availableModels,
  selectedModel,
  onModelSelect,
  mediaModelSelection,
  availableMediaModels,
  mediaModelParameterProfiles,
  mediaModelOptOutEnabled = true,
  onMediaModelSelect,
  genParams,
  onGenParamsChange,
  disabled = false,
  disabledReason,
}: ComposerConfigMenuProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useComposerControlMenu('composer-config');
  const defaultCategory = configCategoryForMode(activeMode);
  const [category, setCategory] = useComposerConfigCategory(defaultCategory);
  const [section, setSection] = useComposerConfigSection('model');
  const menuRef = useRef<HTMLDivElement>(null);
  const dialogLayout = useBoundedDropdownLayout(menuRef, {
    enabled: isOpen,
    preferredDirection: 'up',
    preferredInlineSize: 460,
  });

  useClickOutsideSingle(menuRef, () => setIsOpen(false));

  const primaryModels = useMemo(() => availableModels.filter(isSelectableLlm), [availableModels]);
  const selected = findTriggerModel({
    activeMode,
    primaryModels,
    selectedModel,
    mediaModelSelection,
    availableMediaModels,
  });
  const catalogLoading = modelCatalogStatus === 'loading';
  const canOpen = !disabled && !catalogLoading;
  const modelTriggerTitle =
    disabledReason ??
    selected?.label ??
    (catalogLoading
      ? t('chat.modelCatalog.loading')
      : activeMode === 'agent'
        ? t('chat.noModelsAvailable')
        : t('chat.generation.model.unconfigured', {
            category: getCategoryLabel(t, activeMode),
          }));

  useEffect(() => {
    if (catalogLoading && isOpen) setIsOpen(false);
  }, [catalogLoading, isOpen, setIsOpen]);

  const parameterSummary =
    activeMode === 'agent' ? undefined : getMediaParameterSummary(activeMode, genParams, t);
  const sections: readonly ComposerConfigSection[] =
    category === 'llm' ? SECTIONS.slice(0, 1) : SECTIONS;

  const openConfig = (nextSection: ComposerConfigSection) => {
    if (!canOpen) return;
    const shouldClose = isOpen && section === nextSection && category === defaultCategory;
    if (shouldClose) {
      setIsOpen(false);
      return;
    }
    setCategory(defaultCategory);
    setSection(nextSection);
    setIsOpen(true);
  };

  return (
    <div className="agent-model-config relative flex min-w-0" ref={menuRef}>
      <button
        type="button"
        data-agent-model-config-trigger="true"
        onClick={() => openConfig('model')}
        aria-label={t('chat.modelMenu.trigger')}
        aria-haspopup="dialog"
        aria-expanded={isOpen && section === 'model'}
        disabled={!canOpen}
        className={`agent-control-chip agent-control-chip-model agent-model-config-trigger ${
          selected ? '' : 'agent-control-chip-muted'
        }`}
        style={
          activeMode === 'agent' || !selected ? undefined : { color: getCategoryColor(activeMode) }
        }
        title={modelTriggerTitle}
      >
        {activeMode === 'agent' ? (
          <SessionModeIcon mode="agent" size={13} />
        ) : (
          <MediaCategoryIcon category={activeMode} size={13} />
        )}
        <span className="agent-control-chip-text">
          {selected ? shortenModelLabel(selected) : modelTriggerTitle}
        </span>
        <ChevronDownIcon className="h-2.5 w-2.5 opacity-60" />
      </button>

      {activeMode === 'agent' || parameterSummary === undefined ? null : (
        <button
          type="button"
          onClick={() => openConfig('params')}
          aria-label={t('chat.generation.params.trigger')}
          aria-haspopup="dialog"
          aria-expanded={isOpen && section === 'params'}
          disabled={disabled}
          className="agent-control-chip agent-control-chip-param agent-generation-params-trigger"
          style={{ color: getCategoryColor(activeMode) }}
          title={t('chat.generation.params.summary', { summary: parameterSummary })}
        >
          <SettingsIcon size={13} />
          <span className="agent-control-chip-text">{parameterSummary}</span>
          <ChevronDownIcon className="h-2.5 w-2.5 opacity-60" />
        </button>
      )}

      {isOpen && canOpen ? (
        <div
          className={`agent-dropdown-menu agent-model-config-dialog absolute ${dropdownPositionClass(dialogLayout.direction)}`}
          role="dialog"
          aria-label={t('chat.configMenu.title')}
          style={{
            width: dialogLayout.inlineSize,
            left: dialogLayout.horizontalOffset,
          }}
        >
          <div className="agent-model-config-header">{t('chat.configMenu.title')}</div>
          <div
            className="agent-model-config-tabs"
            role="tablist"
            aria-label={t('chat.configMenu.category')}
          >
            {CATEGORIES.map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={category === option}
                className={`agent-model-config-tab ${
                  category === option ? 'agent-model-config-tab-selected' : ''
                }`}
                onClick={() => {
                  setCategory(option);
                  if (option === 'llm') setSection('model');
                }}
              >
                {option === 'llm' ? (
                  <SessionModeIcon mode="agent" size={13} />
                ) : (
                  <MediaCategoryIcon category={option} size={13} />
                )}
                <span>{getCategoryLabel(t, option)}</span>
              </button>
            ))}
          </div>

          {sections.length > 1 ? (
            <div
              className="agent-model-config-secondary-tabs"
              role="tablist"
              aria-label={t('chat.configMenu.section')}
            >
              {sections.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={section === option}
                  className={`agent-model-config-secondary-tab ${
                    section === option ? 'agent-model-config-secondary-tab-selected' : ''
                  }`}
                  onClick={() => setSection(option)}
                >
                  {t(`chat.configMenu.section.${option}`)}
                </button>
              ))}
            </div>
          ) : null}

          <div className="agent-model-config-content">
            {category === 'llm' ? (
              <ChatModelPanel
                models={primaryModels}
                selectedModel={selectedModel}
                onModelSelect={onModelSelect}
              />
            ) : section === 'model' ? (
              <MediaModelPanel
                category={category}
                generationModels={availableMediaModels.filter(
                  (model) => model.category === category && isSelectable(model),
                )}
                generationSelection={mediaModelSelection[category]}
                generationOptOutEnabled={mediaModelOptOutEnabled}
                onGenerationSelect={(modelId) => onMediaModelSelect(category, modelId)}
              />
            ) : (
              <MediaParameterPanel
                category={category}
                profile={mediaModelParameterProfiles[category]}
                params={genParams}
                onChange={(partial) => onGenParamsChange(category, partial)}
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ChatModelPanel({
  models,
  selectedModel,
  onModelSelect,
}: {
  readonly models: readonly ChatModelOption[];
  readonly selectedModel: string;
  readonly onModelSelect: (modelId: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <ExactModelGroup
      label={t('chat.modelMenu.primary')}
      models={models}
      selectedId={selectedModel}
      onSelect={onModelSelect}
    />
  );
}

function MediaModelPanel({
  category,
  generationModels,
  generationSelection,
  generationOptOutEnabled,
  onGenerationSelect,
}: {
  readonly category: MediaCategory;
  readonly generationModels: readonly ChatModelOption[];
  readonly generationSelection: string;
  readonly generationOptOutEnabled: boolean;
  readonly onGenerationSelect: (modelId: string) => void;
}) {
  const { t } = useTranslation();
  const categoryLabel = getCategoryLabel(t, category);

  return (
    <ExactModelGroup
      label={t('chat.modelMenu.generation', { category: categoryLabel })}
      models={generationModels}
      selectedId={generationSelection}
      onSelect={onGenerationSelect}
      leadingOption={
        generationOptOutEnabled ? { id: 'none', label: t('chat.generation.model.none') } : undefined
      }
    />
  );
}

function MediaParameterPanel({
  category,
  profile,
  params,
  onChange,
}: {
  readonly category: MediaCategory;
  readonly profile?: MediaModelParameterProfile;
  readonly params: GenerationParams;
  readonly onChange: (params: Partial<GenerationParams[MediaCategory]>) => void;
}) {
  const { t } = useTranslation();

  if (category === 'image' && profile?.kind === 'image') {
    const image = params.image;
    const { controls } = profile;
    return (
      <>
        <ParameterGroup
          label={t('chat.generation.param.size')}
          value={selectedImageSizeId(image, controls.size)}
          options={controls.size.values.map((option) => ({
            value: option.id,
            label:
              option.width === undefined || option.height === undefined
                ? t('chat.generation.param.auto')
                : `${option.aspectRatio} · ${option.width}×${option.height}`,
          }))}
          columns={2}
          onChange={(id) => onChange(imageSizeParams(controls.size, id))}
        />
        <ParameterGroup
          label={t('chat.generation.param.quality')}
          value={selectedStringValue(image.quality, controls.quality)}
          options={controls.quality.values.map((value) => ({
            value,
            label: imageQualityLabel(t, value),
          }))}
          columns={4}
          onChange={(quality) => onChange({ quality })}
        />
      </>
    );
  }

  if (category === 'video' && profile?.kind === 'video') {
    const video = params.video;
    const { controls } = profile;
    return (
      <>
        {controls.aspectRatio ? (
          <ParameterGroup
            label={t('chat.generation.param.ratio')}
            value={selectedStringValue(video.aspectRatio, controls.aspectRatio)}
            options={controls.aspectRatio.values.map(valueOption)}
            columns={3}
            visualRatio
            onChange={(aspectRatio) => onChange({ aspectRatio })}
          />
        ) : null}
        {controls.resolution ? (
          <ParameterGroup
            label={t('chat.generation.param.resolution')}
            value={selectedStringValue(video.resolution, controls.resolution)}
            options={controls.resolution.values.map(valueOption)}
            columns={2}
            onChange={(resolution) => onChange({ resolution })}
          />
        ) : null}
        {controls.duration ? (
          <ParameterGroup
            label={t('chat.generation.param.videoDuration')}
            value={selectedIntegerValue(video.duration, controls.duration)}
            options={integerControlValues(controls.duration).map((value) => ({
              value,
              label: `${value}s`,
            }))}
            columns={3}
            onChange={(duration) => onChange({ duration })}
          />
        ) : null}
        {controls.fps ? (
          <ParameterGroup
            label={t('chat.generation.param.fps')}
            value={selectedIntegerValue(video.fps, controls.fps)}
            options={integerControlValues(controls.fps).map((value) => ({
              value,
              label: `${value} fps`,
            }))}
            columns={3}
            onChange={(fps) => onChange({ fps })}
          />
        ) : null}
        {controls.generateAudio ? (
          <ParameterGroup
            label={t('chat.generation.param.generateAudio')}
            value={video.generateAudio ?? controls.generateAudio.defaultValue}
            options={[
              ...(controls.generateAudio.required
                ? []
                : [{ value: undefined, label: t('chat.generation.param.auto') } as const]),
              { value: false, label: t('chat.generation.param.no') },
              { value: true, label: t('chat.generation.param.yes') },
            ]}
            columns={3}
            onChange={(generateAudio) => onChange({ generateAudio })}
          />
        ) : null}
      </>
    );
  }

  return (
    <div className="agent-model-config-empty" role="status">
      {t('chat.generation.parameterProfileUnavailable')}
    </div>
  );
}

function valueOption<Value extends string>(value: Value): ParamOption<Value> {
  return { value, label: value };
}

type ImageSizeControl = Extract<
  MediaModelParameterProfile,
  { readonly kind: 'image' }
>['controls']['size'];

function selectedImageSizeId(image: GenerationParams['image'], control: ImageSizeControl): string {
  return (
    control.values.find(
      (option) =>
        option.width === image.width &&
        option.height === image.height &&
        option.aspectRatio === image.aspectRatio,
    )?.id ?? control.defaultValue
  );
}

function imageSizeParams(
  control: ImageSizeControl,
  id: string,
): Partial<GenerationParams['image']> {
  const option = control.values.find((candidate) => candidate.id === id);
  if (!option) throw new Error(`Unsupported image size '${id}'.`);
  return {
    width: option.width,
    height: option.height,
    aspectRatio: option.aspectRatio,
  };
}

function selectedStringValue(
  value: string | undefined,
  control: { readonly values: readonly string[]; readonly defaultValue?: string },
): string | undefined {
  return value !== undefined && control.values.includes(value) ? value : control.defaultValue;
}

function selectedIntegerValue(
  value: number | undefined,
  control: {
    readonly min: number;
    readonly max: number;
    readonly step: number;
    readonly defaultValue?: number;
    readonly suggestedValues?: readonly number[];
  },
): number | undefined {
  const values = integerControlValues(control);
  return value !== undefined && values.includes(value) ? value : control.defaultValue;
}

function integerControlValues(control: {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly suggestedValues?: readonly number[];
}): readonly number[] {
  return (
    control.suggestedValues ??
    Array.from(
      { length: Math.floor((control.max - control.min) / control.step) + 1 },
      (_, index) => control.min + index * control.step,
    )
  );
}

function ParameterGroup<Value extends string | number | boolean | undefined>({
  label,
  value,
  options,
  columns,
  visualRatio = false,
  onChange,
}: {
  readonly label: string;
  readonly value: Value | undefined;
  readonly options: readonly ParamOption<Value>[];
  readonly columns: 2 | 3 | 4 | 5;
  readonly visualRatio?: boolean;
  readonly onChange: (value: Value) => void;
}) {
  const { t } = useTranslation();

  return (
    <section className="agent-generation-params-section">
      <h3 className="agent-generation-params-section-title">{label}</h3>
      <div
        className="agent-generation-params-options"
        role="radiogroup"
        aria-label={label}
        data-option-columns={columns}
        data-option-layout={visualRatio ? 'ratio' : 'equal'}
      >
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            className={`agent-generation-params-option ${
              option.value === value ? 'agent-generation-params-option-selected' : ''
            }`}
            title={option.hintKey ? t(option.hintKey) : undefined}
            onClick={() => onChange(option.value)}
          >
            {visualRatio && typeof option.value === 'string' ? (
              <span
                className="agent-generation-params-ratio"
                style={aspectRatioPreviewSize(option.value)}
              />
            ) : null}
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function ExactModelGroup({
  label,
  models,
  selectedId,
  onSelect,
  leadingOption,
}: {
  readonly label: string;
  readonly models: readonly ChatModelOption[];
  readonly selectedId: string;
  readonly onSelect: (modelId: string) => void;
  readonly leadingOption?: { readonly id: string; readonly label: string };
}) {
  const { t } = useTranslation();
  const groups = useMemo(() => groupModelOptionsByProvider(models, t), [models, t]);

  return (
    <section className="agent-model-config-section">
      <h3 className="agent-model-config-section-title">{label}</h3>
      <div className="agent-model-config-radio-list" role="radiogroup" aria-label={label}>
        {leadingOption ? (
          <ModelRadio
            optionId={leadingOption.id}
            label={leadingOption.label}
            checked={selectedId === leadingOption.id}
            muted
            onSelect={() => onSelect(leadingOption.id)}
          />
        ) : null}
        {groups.map((group) => (
          <div key={group.key} className="agent-model-provider-group">
            <div className="agent-model-provider-header">
              <span className="agent-model-provider-name">{group.label}</span>
              <ModelTagList tags={group.tags} className="agent-model-provider-tags" />
            </div>
            {group.models.map((model) => (
              <ModelRadio
                key={model.id}
                optionId={model.id}
                label={shortenModelLabel(model)}
                checked={selectedId === model.id}
                tags={buildModelTags(model, t)}
                onSelect={() => onSelect(model.id)}
              />
            ))}
          </div>
        ))}
        {!leadingOption && models.length === 0 ? (
          <div className="agent-model-config-empty">{t('chat.noModelsAvailable')}</div>
        ) : null}
      </div>
    </section>
  );
}

function ModelRadio({
  optionId,
  label,
  checked,
  tags,
  muted = false,
  onSelect,
}: {
  readonly optionId: string;
  readonly label: string;
  readonly checked: boolean;
  readonly tags?: readonly string[];
  readonly muted?: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-agent-model-option-id={optionId}
      role="radio"
      aria-checked={checked}
      aria-label={label}
      className={`agent-model-config-radio agent-model-option-row ${
        checked ? 'agent-model-config-radio-selected' : ''
      } ${muted ? 'agent-model-config-radio-muted' : ''}`}
      onClick={onSelect}
    >
      <span className="agent-model-config-radio-indicator" aria-hidden="true" />
      <span className="agent-model-option-name">{label}</span>
      {tags ? <ModelTagList tags={tags} className="agent-model-option-tags" /> : null}
    </button>
  );
}

function isSelectable(model: ChatModelOption): boolean {
  return Boolean(model.providerId && model.modelId);
}

function isSelectableLlm(model: ChatModelOption): boolean {
  return model.category === 'llm' && isSelectable(model);
}

function imageQualityLabel(
  t: (key: string, params?: Record<string, string | number>) => string,
  value: string,
): string {
  if (value === 'auto') return t('chat.generation.param.auto');
  if (value === 'low') return t('chat.generation.param.quality.low');
  if (value === 'medium') return t('chat.generation.param.quality.medium');
  if (value === 'high') return t('chat.generation.param.quality.high');
  if (value === 'standard') return t('chat.generation.param.quality.standard');
  if (value === 'hd') return t('chat.generation.param.quality.hd');
  throw new Error(`Unsupported image quality '${value}'.`);
}

function getCategoryLabel(
  t: (key: string, params?: Record<string, string | number>) => string,
  category: ComposerConfigCategory,
): string {
  return category === 'llm'
    ? t('chat.agentConfig.category.chat')
    : t(`chat.generation.category.${category}`);
}

function configCategoryForMode(mode: SessionMode): ComposerConfigCategory {
  return mode === 'agent' ? 'llm' : mode;
}

function getMediaParameterSummary(
  mode: Exclude<SessionMode, 'agent'>,
  params: GenerationParams,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (mode === 'image') {
    return params.image.width && params.image.height
      ? `${params.image.aspectRatio ?? ''} · ${params.image.width}×${params.image.height}`
      : t('chat.generation.param.auto');
  }
  if (mode === 'video') {
    return [
      params.video.aspectRatio,
      params.video.resolution,
      formatDuration(params.video.duration),
    ]
      .filter(Boolean)
      .join(' · ');
  }
  const categoryParams = mode === 'audio' ? params.audio : params.music;
  return formatDuration(categoryParams.duration) || t('chat.generation.param.auto');
}

function formatDuration(value: number | undefined): string {
  return value === undefined ? '' : `${value}s`;
}

function findTriggerModel(input: {
  readonly activeMode: SessionMode;
  readonly primaryModels: readonly ChatModelOption[];
  readonly selectedModel: string;
  readonly mediaModelSelection: Readonly<MediaModelSelection>;
  readonly availableMediaModels: readonly ChatModelOption[];
}): ChatModelOption | undefined {
  return input.primaryModels.find((model) => model.id === input.selectedModel);
}
