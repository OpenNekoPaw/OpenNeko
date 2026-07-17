import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AgentCreativityPreset,
  AgentLlmConfig,
  AgentReasoningPreset,
  AgentVerbosityPreset,
  MediaUnderstandingModelStatus,
  MediaUnderstandingModels,
  SessionMode,
} from '@neko-agent/types';
import type { ChatModelOption } from '@neko/shared';
import { ModelSelector } from './ModelSelector';
import { ChevronRightIcon } from '@neko/shared/icons';
import { ChevronDownIcon } from './DropdownMenu';
import { MediaCategoryIcon, SessionModeIcon } from './ComposerIcons';
import { getCategoryColor } from './ModelIcon';
import { SessionModeSelector } from './SessionModeSelector';
import { useClickOutsideSingle } from './useClickOutside';
import {
  dropdownPositionClass,
  useDropdownPlacement,
  type DropdownPlacement,
} from './useDropdownDirection';
import {
  buildModelTags,
  groupModelOptionsByProvider,
  shortenModelLabel,
} from './model-option-presentation';
import { ModelTagList } from './ModelTagList';
import { useTranslation } from '@/i18n/I18nContext';
import type {
  MediaCategory,
  MediaModelSelection,
  MediaUnderstandingSelection,
} from '@/components/ChatView/InputAreaContext';
import type { ComposerModeConfigProjection } from '@/presenters/composer-mode-config-presenter';
import type {
  AgentConfigCategory,
  ComposerControlMenuId,
  GenCategory,
  GenerationDuration,
  GenerationParams,
} from './types';
import {
  useComposerAgentConfigCategory,
  useComposerControlMenu,
  useComposerUnderstandingCategory,
} from './composer-menu-runtime';

interface ModeConfigBarProps {
  readonly projection: ComposerModeConfigProjection;
  readonly availableSessionModes: readonly SessionMode[];
  readonly availableModels: readonly ChatModelOption[];
  readonly selectedModel: string;
  readonly onSessionModeChange: (mode: SessionMode) => void;
  readonly onModelSelect: (modelId: string) => void;
  readonly mediaModelSelection: Readonly<MediaModelSelection>;
  readonly availableMediaModels: readonly ChatModelOption[];
  readonly mediaUnderstandingModels?: MediaUnderstandingModels;
  readonly mediaUnderstandingSelection: Readonly<MediaUnderstandingSelection>;
  readonly onMediaModelSelect: (category: MediaCategory, modelId: string) => void;
  readonly onMediaUnderstandingModelSelect: (category: MediaCategory, modelId: string) => void;
  readonly genCategory: GenCategory;
  readonly genParams: GenerationParams;
  readonly onGenCategoryChange: (category: GenCategory) => void;
  readonly onGenParamsChange: (params: Partial<GenerationParams>) => void;
  readonly llmConfig: AgentLlmConfig;
  readonly onLlmConfigChange: (config: AgentLlmConfig) => void;
  readonly showAgentConfig: boolean;
  readonly showMediaConfig: boolean;
  readonly disabled?: boolean;
}

const REASONING_OPTIONS: readonly AgentReasoningPreset[] = ['fast', 'balanced', 'deep'];
const VERBOSITY_OPTIONS: readonly AgentVerbosityPreset[] = ['brief', 'standard', 'detailed'];
const CREATIVITY_OPTIONS: readonly AgentCreativityPreset[] = ['stable', 'creative', 'wild'];
const MEDIA_CATEGORIES: readonly MediaCategory[] = ['image', 'video', 'audio'];
const MEDIA_UNDERSTANDING_CAPABILITIES: Record<MediaCategory, readonly string[]> = {
  image: ['vision', 'image.understand'],
  audio: ['audio', 'audio.understand'],
  video: ['vision_video', 'video.understand'],
};
type Translate = (key: string, params?: Record<string, string | number>) => string;

interface ParamOption {
  readonly value: string;
  readonly label: string;
  readonly hintKey?: string;
}

interface ResolvedParamOption {
  readonly value: string;
  readonly label: string;
  readonly hint?: string;
}

const RATIO_OPTIONS: readonly ParamOption[] = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: '3:2', label: '3:2' },
  { value: '21:9', label: '21:9' },
  { value: '2.39:1', label: '2.39:1' },
];

const IMAGE_RESOLUTION_OPTIONS: readonly ParamOption[] = [
  { value: '512', label: '512' },
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
];

const VIDEO_RESOLUTION_OPTIONS: readonly ParamOption[] = [
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
  {
    value: 'sfx',
    labelKey: 'chat.generation.audioType.sfx',
  },
  {
    value: 'ambient',
    labelKey: 'chat.generation.audioType.ambient',
  },
  {
    value: 'voice',
    labelKey: 'chat.generation.audioType.voice',
  },
];

export function ModeConfigBar({
  projection,
  availableSessionModes,
  availableModels,
  selectedModel,
  onSessionModeChange,
  onModelSelect,
  mediaModelSelection,
  availableMediaModels,
  mediaUnderstandingModels,
  mediaUnderstandingSelection,
  onMediaModelSelect,
  onMediaUnderstandingModelSelect,
  genCategory,
  genParams,
  onGenCategoryChange,
  onGenParamsChange,
  llmConfig,
  onLlmConfigChange,
  showAgentConfig,
  showMediaConfig,
  disabled = false,
}: ModeConfigBarProps) {
  const { t } = useTranslation();
  const availableAgentCategories = useMemo(
    () => getAvailableAgentConfigCategories(availableModels, availableMediaModels),
    [availableMediaModels, availableModels],
  );
  const [agentConfigCategory, setAgentConfigCategory] = useComposerAgentConfigCategory(
    getInitialAgentConfigCategory(availableAgentCategories, genCategory),
  );
  const isAgentMode = projection.mode === 'agent';
  const activeCategory: AgentConfigCategory = isAgentMode
    ? getActiveAgentConfigCategory(agentConfigCategory, availableAgentCategories, genCategory)
    : projection.mode;

  useEffect(() => {
    if (!isAgentMode) return;
    const nextCategory = getActiveAgentConfigCategory(
      agentConfigCategory,
      availableAgentCategories,
      genCategory,
    );
    if (nextCategory !== agentConfigCategory) {
      setAgentConfigCategory(nextCategory);
    }
    if (nextCategory !== 'llm' && nextCategory !== genCategory) {
      onGenCategoryChange(nextCategory);
    }
  }, [
    agentConfigCategory,
    availableAgentCategories,
    genCategory,
    isAgentMode,
    onGenCategoryChange,
    setAgentConfigCategory,
  ]);

  const handleAgentConfigCategoryChange = (category: AgentConfigCategory) => {
    setAgentConfigCategory(category);
    if (category !== 'llm') {
      onGenCategoryChange(category);
    }
  };

  return (
    <div className="agent-composer-control-row">
      <div
        className="agent-composer-control-group agent-composer-control-group-mode"
        role="group"
        aria-label={t('chat.input.control.mode')}
      >
        <SessionModeSelector
          mode={projection.mode}
          onChange={(mode) => {
            if (disabled) return;
            onSessionModeChange(mode);
          }}
          availableModes={availableSessionModes}
          disabled={disabled}
        />
      </div>

      <div
        className="agent-composer-control-group agent-composer-control-group-config"
        role="group"
        aria-label={t('chat.input.control.params')}
      >
        {isAgentMode && showAgentConfig ? (
          <AgentModeConfigBar
            category={activeCategory}
            categoryOptions={availableAgentCategories}
            onCategoryChange={handleAgentConfigCategoryChange}
            availableModels={availableModels}
            selectedModel={selectedModel}
            onModelSelect={onModelSelect}
            mediaModelSelection={mediaModelSelection}
            availableMediaModels={availableMediaModels}
            mediaUnderstandingModels={mediaUnderstandingModels}
            mediaUnderstandingSelection={mediaUnderstandingSelection}
            onMediaModelSelect={onMediaModelSelect}
            onMediaUnderstandingModelSelect={onMediaUnderstandingModelSelect}
            genParams={genParams}
            onGenParamsChange={onGenParamsChange}
            llmConfig={llmConfig}
            onLlmConfigChange={onLlmConfigChange}
            disabled={disabled}
          />
        ) : projection.mode !== 'agent' && showMediaConfig ? (
          <MediaModelParamsBar
            category={projection.mode}
            mediaModelSelection={mediaModelSelection}
            availableMediaModels={availableMediaModels}
            onMediaModelSelect={onMediaModelSelect}
            genParams={genParams}
            onGenParamsChange={onGenParamsChange}
            disabled={disabled}
          />
        ) : null}
      </div>
    </div>
  );
}

interface AgentLlmConfigBarProps {
  readonly availableModels: readonly ChatModelOption[];
  readonly selectedModel: string;
  readonly onModelSelect: (modelId: string) => void;
  readonly mediaUnderstandingModels?: MediaUnderstandingModels;
  readonly mediaUnderstandingSelection: Readonly<MediaUnderstandingSelection>;
  readonly onMediaUnderstandingModelSelect: (category: MediaCategory, modelId: string) => void;
  readonly llmConfig: AgentLlmConfig;
  readonly onLlmConfigChange: (config: AgentLlmConfig) => void;
  readonly disabled?: boolean;
}

interface AgentModeConfigBarProps extends AgentLlmConfigBarProps {
  readonly category: AgentConfigCategory;
  readonly categoryOptions: readonly AgentConfigCategory[];
  readonly onCategoryChange: (category: AgentConfigCategory) => void;
  readonly mediaModelSelection: Readonly<MediaModelSelection>;
  readonly availableMediaModels: readonly ChatModelOption[];
  readonly mediaUnderstandingModels?: MediaUnderstandingModels;
  readonly mediaUnderstandingSelection: Readonly<MediaUnderstandingSelection>;
  readonly onMediaModelSelect: (category: MediaCategory, modelId: string) => void;
  readonly onMediaUnderstandingModelSelect: (category: MediaCategory, modelId: string) => void;
  readonly showUnderstandingModel?: boolean;
  readonly genParams: GenerationParams;
  readonly onGenParamsChange: (params: Partial<GenerationParams>) => void;
}

function AgentModeConfigBar({
  category,
  categoryOptions,
  onCategoryChange,
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
  llmConfig,
  onLlmConfigChange,
  disabled,
}: AgentModeConfigBarProps) {
  return (
    <div className="agent-mode-config-stack">
      <AgentConfigCategorySelector
        category={category}
        options={categoryOptions}
        onChange={onCategoryChange}
        disabled={disabled}
      />
      {category === 'llm' ? (
        <AgentLlmConfigBar
          availableModels={availableModels}
          selectedModel={selectedModel}
          onModelSelect={onModelSelect}
          mediaUnderstandingModels={mediaUnderstandingModels}
          mediaUnderstandingSelection={mediaUnderstandingSelection}
          onMediaUnderstandingModelSelect={onMediaUnderstandingModelSelect}
          llmConfig={llmConfig}
          onLlmConfigChange={onLlmConfigChange}
          disabled={disabled}
        />
      ) : (
        <MediaModelParamsBar
          category={category}
          mediaModelSelection={mediaModelSelection}
          availableMediaModels={availableMediaModels}
          onMediaModelSelect={onMediaModelSelect}
          genParams={genParams}
          onGenParamsChange={onGenParamsChange}
          disabled={disabled}
        />
      )}
    </div>
  );
}

function AgentLlmConfigBar({
  availableModels,
  selectedModel,
  onModelSelect,
  mediaUnderstandingModels,
  mediaUnderstandingSelection,
  onMediaUnderstandingModelSelect,
  llmConfig,
  onLlmConfigChange,
  disabled,
}: AgentLlmConfigBarProps) {
  const { t } = useTranslation();
  const color = getCategoryColor('llm');
  const controls = getSelectedLlmParameterControls(availableModels, selectedModel);
  const showBehaviorControls = controls.reasoning || controls.verbosity || controls.creativity;

  return (
    <div className="agent-inline-config-stack">
      <div
        className="agent-inline-config-group agent-inline-config-group-models"
        role="group"
        aria-label={t('chat.agentConfig.group.models')}
      >
        <ModelSelector
          selectedModel={selectedModel}
          models={[...availableModels]}
          onSelect={onModelSelect}
          color={color}
          disabled={disabled}
        />
        <AgentUnderstandingConfigChip
          availableModels={availableModels}
          mediaUnderstandingModels={mediaUnderstandingModels}
          mediaUnderstandingSelection={mediaUnderstandingSelection}
          onMediaUnderstandingModelSelect={onMediaUnderstandingModelSelect}
          color={color}
          disabled={disabled}
        />
      </div>

      {showBehaviorControls ? (
        <div
          className="agent-inline-config-group agent-inline-config-group-behavior"
          role="group"
          aria-label={t('chat.agentConfig.group.behavior')}
        >
          {controls.reasoning ? (
            <PresetDropdown
              menuId="llm-reasoning"
              titleKey="chat.agentConfig.section.reasoning"
              value={llmConfig.reasoningPreset ?? 'balanced'}
              options={REASONING_OPTIONS}
              labelPrefix="chat.agentConfig.reasoning"
              color={color}
              onChange={(reasoningPreset) => onLlmConfigChange({ ...llmConfig, reasoningPreset })}
              disabled={disabled}
            />
          ) : null}
          {controls.verbosity ? (
            <PresetDropdown
              menuId="llm-verbosity"
              titleKey="chat.agentConfig.section.verbosity"
              value={llmConfig.verbosityPreset ?? 'standard'}
              options={VERBOSITY_OPTIONS}
              labelPrefix="chat.agentConfig.verbosity"
              color={color}
              onChange={(verbosityPreset) => onLlmConfigChange({ ...llmConfig, verbosityPreset })}
              disabled={disabled}
            />
          ) : null}
          {controls.creativity ? (
            <PresetDropdown
              menuId="llm-creativity"
              titleKey="chat.agentConfig.section.creativity"
              value={llmConfig.creativityPreset ?? 'creative'}
              options={CREATIVITY_OPTIONS}
              labelPrefix="chat.agentConfig.creativity"
              color={color}
              onChange={(creativityPreset) => onLlmConfigChange({ ...llmConfig, creativityPreset })}
              disabled={disabled}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface AgentUnderstandingConfigChipProps {
  readonly availableModels: readonly ChatModelOption[];
  readonly mediaUnderstandingModels?: MediaUnderstandingModels;
  readonly mediaUnderstandingSelection: Readonly<MediaUnderstandingSelection>;
  readonly onMediaUnderstandingModelSelect: (category: MediaCategory, modelId: string) => void;
  readonly color: string;
  readonly disabled?: boolean;
}

function AgentUnderstandingConfigChip({
  availableModels,
  mediaUnderstandingModels,
  mediaUnderstandingSelection,
  onMediaUnderstandingModelSelect,
  color,
  disabled = false,
}: AgentUnderstandingConfigChipProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useComposerControlMenu('understanding-model');
  const [activeCategory, setActiveCategory] = useComposerUnderstandingCategory();
  const [placement, setPlacement] = useState<DropdownPlacement>({
    direction: 'down',
    alignment: 'start',
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const getPlacement = useDropdownPlacement(menuRef, {
    preferredDirection: 'down',
    estimatedWidth: 360,
  });
  useClickOutsideSingle(menuRef, () => {
    setIsOpen(false);
    setActiveCategory(null);
  });

  const handleOpen = () => {
    if (disabled) return;
    if (!isOpen) setPlacement(getPlacement());
    setIsOpen(!isOpen);
    if (isOpen) setActiveCategory(null);
  };

  const summary = MEDIA_CATEGORIES.map(
    (category) =>
      `${getConfigCategoryLabel(t, category)}:${getUnderstandingMenuStatusLabel(
        mediaUnderstandingModels?.[category],
        mediaUnderstandingSelection[category],
        getUnderstandingModelsForCategory(availableModels, category),
        t,
      )}`,
  ).join(' / ');
  const title = t('chat.mediaUnderstanding.menu.titleWithSummary', { summary });
  const activeModels = activeCategory
    ? getUnderstandingModelsForCategory(availableModels, activeCategory)
    : [];
  const activeStatus = activeCategory ? mediaUnderstandingModels?.[activeCategory] : undefined;
  const activeSelectedId = activeCategory ? mediaUnderstandingSelection[activeCategory] : 'auto';
  const groupedModels = useMemo(
    () => groupModelOptionsByProvider(activeModels, t),
    [activeModels, t],
  );

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={handleOpen}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={disabled}
        className={`agent-control-chip agent-control-chip-model agent-control-chip-understand ${
          disabled ? 'agent-control-chip-muted' : ''
        }`}
        style={{ color }}
        title={title}
        aria-label={title}
      >
        <span className="agent-control-chip-text">{t('chat.mediaUnderstanding.menu.chip')}</span>
        <ChevronDownIcon className="w-2.5 h-2.5 opacity-60" />
      </button>

      {isOpen ? (
        <div
          className={`agent-dropdown-menu agent-dropdown-menu-model agent-dropdown-menu-understanding absolute ${dropdownPositionClass(placement)}`}
          role="menu"
        >
          {activeCategory ? (
            <>
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className="agent-dropdown-item agent-dropdown-item-muted"
                role="menuitem"
              >
                {t('chat.mediaUnderstanding.menu.back')}
              </button>
              <div className="agent-dropdown-header">
                {t('chat.mediaUnderstanding.menu.categoryTitle', {
                  category: getConfigCategoryLabel(t, activeCategory),
                })}
              </div>
              <button
                type="button"
                onClick={() => {
                  onMediaUnderstandingModelSelect(activeCategory, 'auto');
                  setIsOpen(false);
                  setActiveCategory(null);
                }}
                className={`agent-dropdown-item ${
                  activeSelectedId === 'auto'
                    ? 'agent-dropdown-item-selected'
                    : 'agent-dropdown-item-muted'
                }`}
                role="menuitem"
              >
                {t('chat.mediaUnderstanding.model.auto', {
                  model: getMediaUnderstandingModelLabel(activeStatus, t),
                })}
              </button>
              {groupedModels.map((group) => (
                <div key={group.key} className="agent-model-provider-group">
                  <div className="agent-model-provider-header">
                    <span className="agent-model-provider-name">{group.label}</span>
                    <ModelTagList tags={group.tags} className="agent-model-provider-tags" />
                  </div>
                  {group.models.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => {
                        onMediaUnderstandingModelSelect(activeCategory, model.id);
                        setIsOpen(false);
                        setActiveCategory(null);
                      }}
                      className={`agent-dropdown-item agent-dropdown-item-inline-detail ${
                        model.id === activeSelectedId ? 'agent-dropdown-item-selected' : ''
                      } agent-model-option-row`}
                      role="menuitem"
                    >
                      <span className="agent-model-option-name">{model.label}</span>
                      <ModelTagList
                        tags={buildModelTags(model, t)}
                        className="agent-model-option-tags"
                      />
                    </button>
                  ))}
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="agent-dropdown-header">{t('chat.mediaUnderstanding.menu.title')}</div>
              {MEDIA_CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className="agent-dropdown-item agent-dropdown-item-inline-detail agent-understanding-category-row"
                  role="menuitem"
                  aria-label={t('chat.mediaUnderstanding.menu.categoryRow', {
                    category: getConfigCategoryLabel(t, category),
                    model: getUnderstandingMenuStatusLabel(
                      mediaUnderstandingModels?.[category],
                      mediaUnderstandingSelection[category],
                      getUnderstandingModelsForCategory(availableModels, category),
                      t,
                    ),
                  })}
                >
                  <span
                    className="agent-understanding-category-icon"
                    style={{ color: getCategoryColor(category) }}
                  >
                    <MediaCategoryIcon category={category} size={14} />
                  </span>
                  <span className="agent-understanding-category-label">
                    <span className="agent-understanding-category-name">
                      {getConfigCategoryLabel(t, category)}
                    </span>
                    <span className="agent-understanding-category-model">
                      {getUnderstandingMenuStatusLabel(
                        mediaUnderstandingModels?.[category],
                        mediaUnderstandingSelection[category],
                        getUnderstandingModelsForCategory(availableModels, category),
                        t,
                      )}
                    </span>
                  </span>
                  <ChevronRightIcon className="agent-understanding-category-chevron" />
                </button>
              ))}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

interface AgentConfigCategorySelectorProps {
  readonly category: AgentConfigCategory;
  readonly options: readonly AgentConfigCategory[];
  readonly onChange: (category: AgentConfigCategory) => void;
  readonly disabled?: boolean;
}

function AgentConfigCategorySelector({
  category,
  options,
  onChange,
  disabled = false,
}: AgentConfigCategorySelectorProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useComposerControlMenu('agent-config-category');
  const [placement, setPlacement] = useState<DropdownPlacement>({
    direction: 'up',
    alignment: 'start',
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const canSwitchCategory = options.length > 1;
  const canOpen = canSwitchCategory && !disabled;

  useClickOutsideSingle(menuRef, () => setIsOpen(false));
  const getPlacement = useDropdownPlacement(menuRef, {
    preferredDirection: 'up',
    estimatedWidth: 128,
  });

  const currentLabel = getConfigCategoryLabel(t, category);
  const color = getConfigCategoryColor(category);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => {
          if (!canOpen) return;
          if (!isOpen) setPlacement(getPlacement());
          setIsOpen(!isOpen);
        }}
        aria-label={currentLabel}
        aria-haspopup={canOpen ? 'menu' : undefined}
        aria-expanded={canOpen ? isOpen : false}
        disabled={disabled}
        className={`agent-control-chip agent-control-chip-mode ${
          canOpen ? '' : 'agent-control-chip-static'
        }`}
        style={{ color }}
        title={currentLabel}
      >
        <ConfigCategoryIcon category={category} />
        <span className="agent-control-chip-text">{currentLabel}</span>
        {canOpen && <ChevronDownIcon className="w-2.5 h-2.5 opacity-60" />}
      </button>

      {isOpen && canOpen && (
        <div
          className={`agent-dropdown-menu agent-dropdown-menu-compact agent-dropdown-menu-preset absolute ${dropdownPositionClass(placement)}`}
          role="menu"
        >
          {options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                onChange(option);
                setIsOpen(false);
              }}
              className={`agent-dropdown-item ${
                option === category ? 'agent-dropdown-item-selected' : ''
              }`}
              role="menuitem"
            >
              <span style={{ color: getConfigCategoryColor(option) }}>
                <ConfigCategoryIcon category={option} />
              </span>
              <span className="agent-dropdown-item-label">{getConfigCategoryLabel(t, option)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface MediaModelParamsBarProps {
  readonly category: MediaCategory;
  readonly mediaModelSelection: Readonly<MediaModelSelection>;
  readonly availableMediaModels: readonly ChatModelOption[];
  readonly onMediaModelSelect: (category: MediaCategory, modelId: string) => void;
  readonly genParams: GenerationParams;
  readonly onGenParamsChange: (params: Partial<GenerationParams>) => void;
  readonly disabled?: boolean;
}

function MediaModelParamsBar({
  category,
  mediaModelSelection,
  availableMediaModels,
  onMediaModelSelect,
  genParams,
  onGenParamsChange,
  disabled,
}: MediaModelParamsBarProps) {
  const models = availableMediaModels.filter((model) => model.category === category);
  const color = getCategoryColor(category);

  return (
    <div className="agent-generation-params">
      <InlineMediaModelChip
        category={category}
        selectedId={mediaModelSelection[category]}
        models={models}
        onSelect={(modelId) => onMediaModelSelect(category, modelId)}
        disabled={disabled}
      />
      <MediaParamsPanel
        category={category}
        params={genParams}
        onChange={onGenParamsChange}
        color={color}
        disabled={disabled}
      />
    </div>
  );
}

interface InlineMediaModelChipProps {
  readonly category: MediaCategory;
  readonly selectedId: string;
  readonly models: readonly ChatModelOption[];
  readonly onSelect: (modelId: string) => void;
  readonly disabled?: boolean;
}

function InlineMediaModelChip({
  category,
  selectedId,
  models,
  onSelect,
  disabled = false,
}: InlineMediaModelChipProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useComposerControlMenu('media-model');
  const [placement, setPlacement] = useState<DropdownPlacement>({
    direction: 'down',
    alignment: 'start',
  });
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutsideSingle(menuRef, () => setIsOpen(false));
  const getPlacement = useDropdownPlacement(menuRef, {
    preferredDirection: 'down',
    estimatedWidth: 360,
  });

  const color = getCategoryColor(category);
  const selected = models.find((model) => model.id === selectedId);
  const hasModels = models.length > 0;
  const canOpen = hasModels && !disabled;
  const isConfigured = Boolean(selected) && selectedId !== 'none';
  const categoryLabel = getConfigCategoryLabel(t, category);
  const groupedModels = useMemo(
    () =>
      groupModelOptionsByProvider(
        models.filter((model) => model.providerId && model.modelId),
        t,
      ),
    [models, t],
  );

  const handleOpen = () => {
    if (!canOpen) return;
    if (!isOpen) setPlacement(getPlacement());
    setIsOpen(!isOpen);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={handleOpen}
        aria-haspopup={canOpen ? 'menu' : undefined}
        aria-expanded={canOpen ? isOpen : false}
        disabled={disabled}
        className={`agent-control-chip agent-control-chip-model ${
          isConfigured ? '' : 'agent-control-chip-muted'
        }`}
        style={{
          color: isConfigured ? color : 'var(--vscode-descriptionForeground)',
        }}
        title={
          selected?.label ??
          (hasModels
            ? t('chat.generation.model.select', { category: categoryLabel })
            : t('chat.generation.model.unconfigured', { category: categoryLabel }))
        }
      >
        <span className="agent-control-chip-text">
          {selected && isConfigured
            ? shortenModelLabel(selected, 10, '...')
            : t('chat.generation.model.noneShort')}
        </span>
        {canOpen && <ChevronDownIcon className="w-2.5 h-2.5 opacity-60" />}
      </button>

      {isOpen && canOpen && (
        <div
          className={`agent-dropdown-menu agent-dropdown-menu-model absolute ${dropdownPositionClass(placement)}`}
          role="menu"
        >
          <button
            type="button"
            onClick={() => {
              onSelect('none');
              setIsOpen(false);
            }}
            className={`agent-dropdown-item ${
              selectedId === 'none' ? 'agent-dropdown-item-selected' : 'agent-dropdown-item-muted'
            }`}
            role="menuitem"
          >
            {t('chat.generation.model.none')}
          </button>
          {groupedModels.map((group) => (
            <div key={group.key} className="agent-model-provider-group">
              <div className="agent-model-provider-header">
                <span className="agent-model-provider-name">{group.label}</span>
                <ModelTagList tags={group.tags} className="agent-model-provider-tags" />
              </div>
              {group.models.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => {
                    onSelect(model.id);
                    setIsOpen(false);
                  }}
                  className={`agent-dropdown-item agent-dropdown-item-inline-detail ${
                    model.id === selectedId ? 'agent-dropdown-item-selected' : ''
                  } agent-model-option-row`}
                  role="menuitem"
                >
                  <span className="agent-model-option-name">{shortenModelLabel(model)}</span>
                  <ModelTagList
                    tags={buildModelTags(model, t)}
                    className="agent-model-option-tags"
                  />
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface MediaParamsPanelProps {
  readonly category: MediaCategory;
  readonly params: GenerationParams;
  readonly onChange: (params: Partial<GenerationParams>) => void;
  readonly color: string;
  readonly disabled?: boolean;
}

function MediaParamsPanel({
  category,
  params,
  onChange,
  color,
  disabled = false,
}: MediaParamsPanelProps) {
  const { t } = useTranslation();

  if (category === 'image') {
    return (
      <>
        <ParamDropdown
          menuId="generation-ratio"
          value={params.ratio}
          options={RATIO_OPTIONS}
          onChange={(value) => onChange({ ratio: value as GenerationParams['ratio'] })}
          color={color}
          ariaLabel={t('chat.generation.param.ratio')}
          disabled={disabled}
        />
        <ParamDropdown
          menuId="generation-resolution"
          value={params.resolution}
          options={IMAGE_RESOLUTION_OPTIONS}
          onChange={(value) => onChange({ resolution: value as GenerationParams['resolution'] })}
          color={color}
          ariaLabel={t('chat.generation.param.resolution')}
          disabled={disabled}
        />
      </>
    );
  }

  if (category === 'video') {
    return (
      <>
        <ParamDropdown
          menuId="generation-ratio"
          value={params.ratio}
          options={RATIO_OPTIONS}
          onChange={(value) => onChange({ ratio: value as GenerationParams['ratio'] })}
          color={color}
          ariaLabel={t('chat.generation.param.ratio')}
          disabled={disabled}
        />
        <ParamDropdown
          menuId="generation-resolution"
          value={params.resolution}
          options={VIDEO_RESOLUTION_OPTIONS}
          onChange={(value) => onChange({ resolution: value as GenerationParams['resolution'] })}
          color={color}
          ariaLabel={t('chat.generation.param.resolution')}
          disabled={disabled}
        />
        <ParamDropdown
          menuId="generation-duration"
          value={String(params.videoDuration)}
          options={VIDEO_DURATION_OPTIONS}
          onChange={(value) => onChange({ videoDuration: parseGenerationDuration(value) })}
          color={color}
          ariaLabel={t('chat.generation.param.videoDuration')}
          disabled={disabled}
        />
      </>
    );
  }

  return (
    <>
      <ParamDropdown
        menuId="generation-audio-type"
        value={params.audioType}
        options={AUDIO_TYPE_OPTIONS.map((option) => ({
          value: option.value,
          label: t(option.labelKey),
        }))}
        onChange={(value) => onChange({ audioType: value as GenerationParams['audioType'] })}
        color={color}
        ariaLabel={t('chat.generation.param.audioType')}
        disabled={disabled}
      />
      <ParamDropdown
        menuId="generation-duration"
        value={String(params.audioDuration)}
        options={AUDIO_DURATION_OPTIONS}
        onChange={(value) => onChange({ audioDuration: parseGenerationDuration(value) })}
        color={color}
        ariaLabel={t('chat.generation.param.audioDuration')}
        disabled={disabled}
      />
    </>
  );
}

interface ParamDropdownProps {
  readonly menuId: ComposerControlMenuId;
  readonly value: string;
  readonly options: readonly ParamOption[] | readonly ResolvedParamOption[];
  readonly onChange: (value: string) => void;
  readonly color: string;
  readonly ariaLabel: string;
  readonly disabled?: boolean;
}

function ParamDropdown({
  menuId,
  value,
  options,
  onChange,
  color,
  ariaLabel,
  disabled = false,
}: ParamDropdownProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useComposerControlMenu(menuId);
  const [placement, setPlacement] = useState<DropdownPlacement>({
    direction: 'down',
    alignment: 'start',
  });
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutsideSingle(menuRef, () => setIsOpen(false));
  const getPlacement = useDropdownPlacement(menuRef, {
    preferredDirection: 'down',
    estimatedWidth: 128,
  });

  const resolvedOptions = options.map((option) => resolveParamOption(t, option));
  const selected = resolvedOptions.find((option) => option.value === value);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          if (!isOpen) setPlacement(getPlacement());
          setIsOpen(!isOpen);
        }}
        aria-label={ariaLabel}
        aria-haspopup={disabled ? undefined : 'menu'}
        aria-expanded={disabled ? false : isOpen}
        disabled={disabled}
        className="agent-control-chip agent-control-chip-param"
        style={{ color }}
      >
        <span className="agent-control-chip-text">{selected?.label ?? value}</span>
        <ChevronDownIcon className="w-2.5 h-2.5 opacity-60" />
      </button>

      {isOpen && !disabled && (
        <div
          className={`agent-dropdown-menu agent-dropdown-menu-compact agent-dropdown-menu-param absolute ${dropdownPositionClass(placement)}`}
          role="menu"
        >
          <div className="agent-dropdown-header" role="presentation">
            {ariaLabel}
          </div>
          {resolvedOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`agent-dropdown-item agent-dropdown-item-inline-detail ${
                option.value === value ? 'agent-dropdown-item-selected' : ''
              }`}
              role="menuitem"
            >
              <span className="agent-dropdown-item-label">
                {option.label}
                {option.hint ? (
                  <>
                    {' · '}
                    <span className="agent-dropdown-item-description">{option.hint}</span>
                  </>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface PresetDropdownProps<Value extends string> {
  readonly menuId: ComposerControlMenuId;
  readonly titleKey: string;
  readonly value: Value;
  readonly options: readonly Value[];
  readonly labelPrefix: string;
  readonly color?: string;
  readonly onChange: (value: Value) => void;
  readonly disabled?: boolean;
}

function PresetDropdown<Value extends string>({
  menuId,
  titleKey,
  value,
  options,
  labelPrefix,
  color,
  onChange,
  disabled = false,
}: PresetDropdownProps<Value>) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useComposerControlMenu(menuId);
  const [placement, setPlacement] = useState<DropdownPlacement>({
    direction: 'down',
    alignment: 'start',
  });
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutsideSingle(menuRef, () => setIsOpen(false));
  const getPlacement = useDropdownPlacement(menuRef, {
    preferredDirection: 'down',
    estimatedWidth: 128,
  });

  const selectedLabel = t(`${labelPrefix}.${value}`);
  const titleLabel = t(titleKey);
  const title = `${titleLabel}: ${selectedLabel}`;

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          if (!isOpen) setPlacement(getPlacement());
          setIsOpen(!isOpen);
        }}
        aria-label={t(titleKey)}
        aria-haspopup={disabled ? undefined : 'menu'}
        aria-expanded={disabled ? false : isOpen}
        disabled={disabled}
        className="agent-control-chip agent-control-chip-param agent-control-chip-preset"
        style={color ? { color } : undefined}
        title={title}
      >
        <span className="agent-control-chip-text">{selectedLabel}</span>
        <ChevronDownIcon className="w-2.5 h-2.5 opacity-60" />
      </button>

      {isOpen && !disabled && (
        <div
          className={`agent-dropdown-menu agent-dropdown-menu-compact agent-dropdown-menu-preset absolute ${dropdownPositionClass(placement)}`}
          role="menu"
        >
          <div className="agent-dropdown-header" role="presentation">
            {titleLabel}
          </div>
          {options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                onChange(option);
                setIsOpen(false);
              }}
              className={`agent-dropdown-item agent-dropdown-item-inline-detail ${
                option === value ? 'agent-dropdown-item-selected' : ''
              }`}
              role="menuitem"
            >
              <span className="agent-dropdown-item-label">{t(`${labelPrefix}.${option}`)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function getAvailableAgentConfigCategories(
  availableModels: readonly ChatModelOption[],
  availableMediaModels: readonly ChatModelOption[],
): readonly AgentConfigCategory[] {
  const categories: AgentConfigCategory[] = [];
  if (availableModels.some((model) => model.providerId && model.modelId)) {
    categories.push('llm');
  }
  for (const category of MEDIA_CATEGORIES) {
    if (availableMediaModels.some((model) => model.category === category)) {
      categories.push(category);
    }
  }
  return categories;
}

function getInitialAgentConfigCategory(
  availableCategories: readonly AgentConfigCategory[],
  generationCategory: GenCategory,
): AgentConfigCategory {
  if (availableCategories.includes('llm')) return 'llm';
  if (availableCategories.includes(generationCategory)) return generationCategory;
  return availableCategories[0] ?? 'llm';
}

function getActiveAgentConfigCategory(
  currentCategory: AgentConfigCategory,
  availableCategories: readonly AgentConfigCategory[],
  generationCategory: GenCategory,
): AgentConfigCategory {
  if (availableCategories.length === 0) return 'llm';
  if (availableCategories.includes(currentCategory)) return currentCategory;
  return getInitialAgentConfigCategory(availableCategories, generationCategory);
}

function getSelectedLlmParameterControls(
  availableModels: readonly ChatModelOption[],
  selectedModel: string,
): NonNullable<ChatModelOption['llmParameterControls']> {
  const model = availableModels.find((option) => option.id === selectedModel);
  if (!model) {
    return {
      reasoning: false,
      verbosity: false,
      creativity: false,
      maxOutputTokens: false,
    };
  }
  return (
    model.llmParameterControls ?? {
      reasoning: false,
      verbosity: false,
      creativity: true,
      maxOutputTokens: true,
    }
  );
}

function ConfigCategoryIcon({ category }: { readonly category: AgentConfigCategory }) {
  if (category === 'llm') {
    return <SessionModeIcon mode="agent" size={13} />;
  }
  return <MediaCategoryIcon category={category} size={13} />;
}

function getConfigCategoryLabel(t: Translate, category: AgentConfigCategory): string {
  if (category === 'llm') return t('chat.agentConfig.category.chat');
  return t(`chat.generation.category.${category}`);
}

function getConfigCategoryColor(category: AgentConfigCategory): string {
  return getCategoryColor(category);
}

function getMediaUnderstandingModelLabel(
  status: MediaUnderstandingModelStatus | undefined,
  t: Translate,
): string {
  if (!status) {
    return t('chat.mediaUnderstanding.unavailable');
  }
  if (status.status === 'missing') {
    return t('chat.mediaUnderstanding.unavailable');
  }
  return (
    status.label ?? status.optionId ?? status.modelId ?? t('chat.mediaUnderstanding.unavailable')
  );
}

function getUnderstandingMenuStatusLabel(
  status: MediaUnderstandingModelStatus | undefined,
  selectedId: string,
  models: readonly ChatModelOption[],
  t: Translate,
): string {
  if (selectedId !== 'auto') {
    const selected = models.find((model) => model.id === selectedId);
    return selected ? selected.label : selectedId;
  }
  return getMediaUnderstandingModelLabel(status, t);
}

function getUnderstandingModelsForCategory(
  models: readonly ChatModelOption[],
  category: MediaCategory,
): readonly ChatModelOption[] {
  const supportedCapabilities = MEDIA_UNDERSTANDING_CAPABILITIES[category];
  return models.filter(
    (model) =>
      model.category === 'llm' &&
      (model.capabilities ?? []).some((capability) => supportedCapabilities.includes(capability)),
  );
}

function resolveParamOption(t: Translate, option: ParamOption | ResolvedParamOption) {
  return {
    value: option.value,
    label: option.label,
    hint:
      'hint' in option
        ? option.hint
        : 'hintKey' in option && option.hintKey
          ? t(option.hintKey)
          : undefined,
  };
}

function parseGenerationDuration(value: string): GenerationDuration {
  if (value === 'auto') return 'auto';
  const duration = Number(value);
  if (!Number.isFinite(duration)) {
    throw new Error(`Invalid generation duration: ${value}`);
  }
  return duration;
}
