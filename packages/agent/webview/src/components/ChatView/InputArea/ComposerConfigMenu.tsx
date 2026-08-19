import { useMemo, useRef } from 'react';
import type { MediaUnderstandingModels, SessionMode } from '@neko/agent-contracts';
import type { ChatModelOption } from '@neko/ai-contracts';
import { SettingsIcon } from '@neko/ui/icons';
import type {
  MediaCategory,
  MediaModelSelection,
  MediaUnderstandingSelection,
} from '../InputAreaContext';
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
  GenerationDuration,
  GenerationParams,
} from './types';

interface ComposerConfigMenuProps {
  readonly activeMode: SessionMode;
  readonly availableModels: readonly ChatModelOption[];
  readonly selectedModel: string;
  readonly onModelSelect: (modelId: string) => void;
  readonly mediaModelSelection: Readonly<MediaModelSelection>;
  readonly availableMediaModels: readonly ChatModelOption[];
  readonly mediaUnderstandingModels?: MediaUnderstandingModels;
  readonly mediaUnderstandingSelection: Readonly<MediaUnderstandingSelection>;
  readonly onMediaModelSelect: (category: MediaCategory, modelId: string) => void;
  readonly onMediaUnderstandingModelSelect: (category: MediaCategory, modelId: string) => void;
  readonly genParams: GenerationParams;
  readonly onGenParamsChange: (params: Partial<GenerationParams>) => void;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
}

interface ParamOption<Value extends string = string> {
  readonly value: Value;
  readonly label: string;
  readonly hintKey?: string;
}

const CATEGORIES: readonly ComposerConfigCategory[] = ['llm', 'image', 'video', 'audio'];
const SECTIONS: readonly ComposerConfigSection[] = ['model', 'params'];
const UNDERSTANDING_CAPABILITIES: Record<MediaCategory, readonly string[]> = {
  image: ['vision', 'image.understand'],
  video: ['vision_video', 'video.understand'],
  audio: ['audio', 'audio.understand'],
};
const RATIO_OPTIONS: readonly ParamOption<GenerationParams['ratio']>[] = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: '3:2', label: '3:2' },
  { value: '21:9', label: '21:9' },
  { value: '2.39:1', label: '2.39:1' },
];
const IMAGE_RESOLUTION_OPTIONS: readonly ParamOption<GenerationParams['resolution']>[] = [
  { value: '512', label: '512' },
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
];
const VIDEO_RESOLUTION_OPTIONS: readonly ParamOption<GenerationParams['resolution']>[] = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
];
const VIDEO_DURATION_OPTIONS: readonly ParamOption[] = [
  { value: 'auto', label: 'AUTO', hintKey: 'chat.generation.paramHint.duration.autoVideo' },
  { value: '5', label: '5s' },
  { value: '8', label: '8s' },
  { value: '12', label: '12s' },
];
const AUDIO_DURATION_OPTIONS: readonly ParamOption[] = [
  { value: 'auto', label: 'AUTO', hintKey: 'chat.generation.paramHint.duration.autoAudio' },
  { value: '3', label: '3s' },
  { value: '8', label: '8s' },
  { value: '15', label: '15s' },
];
const AUDIO_TYPE_OPTIONS = [
  { value: 'sfx', labelKey: 'chat.generation.audioType.sfx' },
  { value: 'ambient', labelKey: 'chat.generation.audioType.ambient' },
  { value: 'voice', labelKey: 'chat.generation.audioType.voice' },
] as const;

export function ComposerConfigMenu({
  activeMode,
  availableModels,
  selectedModel,
  onModelSelect,
  mediaModelSelection,
  availableMediaModels,
  mediaUnderstandingModels,
  mediaUnderstandingSelection,
  onMediaModelSelect,
  onMediaUnderstandingModelSelect,
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
    preferredInlineSize: 420,
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
  const canOpen = !disabled;
  const modelTriggerTitle =
    disabledReason ??
    selected?.label ??
    (activeMode === 'agent'
      ? t('chat.noModelsAvailable')
      : t('chat.generation.model.unconfigured', {
          category: getCategoryLabel(t, activeMode),
        }));

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
        onClick={() => openConfig('model')}
        aria-label={t('chat.modelMenu.trigger')}
        aria-haspopup="dialog"
        aria-expanded={isOpen && section === 'model'}
        disabled={disabled}
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
                understandingModels={availableModels.filter((model) =>
                  supportsUnderstanding(model, category),
                )}
                understandingStatus={mediaUnderstandingModels?.[category]}
                understandingSelection={mediaUnderstandingSelection[category]}
                onUnderstandingSelect={(modelId) =>
                  onMediaUnderstandingModelSelect(category, modelId)
                }
                generationModels={availableMediaModels.filter(
                  (model) => model.category === category && isSelectable(model),
                )}
                generationSelection={mediaModelSelection[category]}
                onGenerationSelect={(modelId) => onMediaModelSelect(category, modelId)}
              />
            ) : (
              <MediaParameterPanel
                category={category}
                params={genParams}
                onChange={onGenParamsChange}
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
  understandingModels,
  understandingStatus,
  understandingSelection,
  onUnderstandingSelect,
  generationModels,
  generationSelection,
  onGenerationSelect,
}: {
  readonly category: MediaCategory;
  readonly understandingModels: readonly ChatModelOption[];
  readonly understandingStatus?: MediaUnderstandingModels[MediaCategory];
  readonly understandingSelection: string;
  readonly onUnderstandingSelect: (modelId: string) => void;
  readonly generationModels: readonly ChatModelOption[];
  readonly generationSelection: string;
  readonly onGenerationSelect: (modelId: string) => void;
}) {
  const { t } = useTranslation();
  const categoryLabel = getCategoryLabel(t, category);

  return (
    <>
      <ExactModelGroup
        label={t('chat.modelMenu.understanding', { category: categoryLabel })}
        models={understandingModels}
        selectedId={understandingSelection}
        onSelect={onUnderstandingSelect}
        leadingOption={{
          id: 'auto',
          label: t('chat.modelMenu.autoUnderstanding', {
            model: understandingStatus?.label ?? t('chat.mediaUnderstanding.unavailable'),
          }),
        }}
      />
      <ExactModelGroup
        label={t('chat.modelMenu.generation', { category: categoryLabel })}
        models={generationModels}
        selectedId={generationSelection}
        onSelect={onGenerationSelect}
        leadingOption={{ id: 'none', label: t('chat.generation.model.none') }}
      />
    </>
  );
}

function MediaParameterPanel({
  category,
  params,
  onChange,
}: {
  readonly category: MediaCategory;
  readonly params: GenerationParams;
  readonly onChange: (params: Partial<GenerationParams>) => void;
}) {
  const { t } = useTranslation();

  if (category === 'image') {
    return (
      <>
        <ParameterGroup
          label={t('chat.generation.param.ratio')}
          value={params.ratio}
          options={RATIO_OPTIONS}
          onChange={(value) => onChange({ ratio: value })}
        />
        <ParameterGroup
          label={t('chat.generation.param.resolution')}
          value={params.resolution}
          options={IMAGE_RESOLUTION_OPTIONS}
          onChange={(value) => onChange({ resolution: value })}
        />
      </>
    );
  }

  if (category === 'video') {
    return (
      <>
        <ParameterGroup
          label={t('chat.generation.param.ratio')}
          value={params.ratio}
          options={RATIO_OPTIONS}
          onChange={(value) => onChange({ ratio: value })}
        />
        <ParameterGroup
          label={t('chat.generation.param.resolution')}
          value={params.resolution}
          options={VIDEO_RESOLUTION_OPTIONS}
          onChange={(value) => onChange({ resolution: value })}
        />
        <ParameterGroup
          label={t('chat.generation.param.videoDuration')}
          value={String(params.videoDuration)}
          options={VIDEO_DURATION_OPTIONS}
          onChange={(value) => onChange({ videoDuration: parseDuration(value) })}
        />
      </>
    );
  }

  return (
    <>
      <ParameterGroup
        label={t('chat.generation.param.audioType')}
        value={params.audioType}
        options={AUDIO_TYPE_OPTIONS.map((option) => ({
          value: option.value,
          label: t(option.labelKey),
        }))}
        onChange={(value) => onChange({ audioType: value })}
      />
      <ParameterGroup
        label={t('chat.generation.param.audioDuration')}
        value={String(params.audioDuration)}
        options={AUDIO_DURATION_OPTIONS}
        onChange={(value) => onChange({ audioDuration: parseDuration(value) })}
      />
    </>
  );
}

function ParameterGroup<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: Value;
  readonly options: readonly ParamOption<Value>[];
  readonly onChange: (value: Value) => void;
}) {
  const { t } = useTranslation();

  return (
    <section className="agent-generation-params-section">
      <h3 className="agent-generation-params-section-title">{label}</h3>
      <div className="agent-generation-params-options" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            className={`agent-generation-params-option ${
              option.value === value ? 'agent-generation-params-option-selected' : ''
            }`}
            title={option.hintKey ? t(option.hintKey) : undefined}
            onClick={() => onChange(option.value)}
          >
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
  label,
  checked,
  tags,
  muted = false,
  onSelect,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly tags?: readonly string[];
  readonly muted?: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
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

function supportsUnderstanding(model: ChatModelOption, category: MediaCategory): boolean {
  if (!isSelectableLlm(model)) return false;
  const capabilities = model.capabilities ?? [];
  return UNDERSTANDING_CAPABILITIES[category].some((capability) =>
    capabilities.includes(capability),
  );
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
  if (mode === 'image') return `${params.ratio} · ${params.resolution}`;
  if (mode === 'video') {
    return `${params.ratio} · ${params.resolution} · ${formatDuration(params.videoDuration)}`;
  }
  const audioType =
    AUDIO_TYPE_OPTIONS.find((option) => option.value === params.audioType)?.labelKey ??
    'chat.generation.audioType.sfx';
  return `${t(audioType)} · ${formatDuration(params.audioDuration)}`;
}

function formatDuration(value: GenerationDuration): string {
  return value === 'auto' ? 'AUTO' : `${value}s`;
}

function parseDuration(value: string): GenerationDuration {
  if (value === 'auto') return 'auto';
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid generation duration: ${value}`);
  }
  return parsed;
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
