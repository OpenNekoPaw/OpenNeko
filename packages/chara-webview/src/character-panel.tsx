import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  type CharacterBackgroundStory,
  type CompanionMemoryProvenance,
  type CharacterDefinition,
  type CharacterFoundationCommand,
  type CharacterFoundationSnapshot,
  type CharacterProject,
  type CharacterOriginSetting,
  type CharacterRepresentationRef,
  type CharacterRepresentationDefaults,
  type CharacterRepresentationKind,
  type CharacterStorylineDraft,
  type CharacterStorylineVersion,
  type CharacterVoiceDefaults,
} from '@neko/chara/contracts';
import type { SupportedLocale } from '@neko/ui/i18n';
import { useEffect, useMemo, useState } from 'react';
import {
  createDomainIdentity,
  FoundationField,
  FoundationSegmented,
  FoundationSubmit,
  lines,
  submitForm,
} from './foundation-ui';
import { formatCount, foundationLabel } from './labels';

type ExecuteCommand = (command: CharacterFoundationCommand) => Promise<CharacterFoundationSnapshot>;

interface CharacterDraftFields {
  readonly displayName: string;
  readonly summary: string;
  readonly backgroundOverview: string;
  readonly originOverview: string;
  readonly canon: string;
  readonly knowledgeBoundary: string;
  readonly behaviorPolicy: string;
  readonly expressionPolicy: string;
  readonly portraitResourceRef: string;
  readonly avatarKind: Extract<CharacterRepresentationKind, 'live2d' | 'vrm' | 'mmd' | 'pngtuber'>;
  readonly avatarResourceRef: string;
  readonly voiceProviderRef: string;
  readonly voiceResourceRef: string;
  readonly voiceSpeed: number;
  readonly voiceAutoRead: boolean;
}

interface StorylineDraftFields {
  readonly characterStorylineId: string;
  readonly storylineNodeId: string;
  readonly characterVersionId: string;
  readonly label: string;
  readonly premise: string;
  readonly characterState: string;
  readonly relationshipState: string;
  readonly narrativeMemories: string;
  readonly nodeTitle: string;
  readonly situation: string;
  readonly constraints: string;
}

const emptyFields: CharacterDraftFields = {
  displayName: '',
  summary: '',
  backgroundOverview: '',
  originOverview: '',
  canon: '',
  knowledgeBoundary: '',
  behaviorPolicy: '',
  expressionPolicy: '',
  portraitResourceRef: '',
  avatarKind: 'vrm',
  avatarResourceRef: '',
  voiceProviderRef: '',
  voiceResourceRef: '',
  voiceSpeed: 1,
  voiceAutoRead: false,
};

const emptyStorylineFields: StorylineDraftFields = {
  characterStorylineId: '',
  storylineNodeId: '',
  characterVersionId: '',
  label: '',
  premise: '',
  characterState: '',
  relationshipState: '',
  narrativeMemories: '',
  nodeTitle: '',
  situation: '',
  constraints: '',
};

export function CharacterPanel({
  authoringOnly = false,
  creating,
  execute,
  locale,
  onCreated,
  pendingOperation,
  selectedProjectId,
  snapshot,
}: {
  readonly authoringOnly?: boolean;
  readonly creating: boolean;
  readonly execute: ExecuteCommand;
  readonly locale: SupportedLocale;
  readonly onCreated: (characterProjectId: string) => void;
  readonly pendingOperation?: string;
  readonly selectedProjectId?: string;
  readonly snapshot: CharacterFoundationSnapshot;
}): JSX.Element {
  const [fields, setFields] = useState<CharacterDraftFields>(emptyFields);
  const [versionLabel, setVersionLabel] = useState('');
  const [storylineFields, setStorylineFields] =
    useState<StorylineDraftFields>(emptyStorylineFields);
  const [comparisonVersionIds, setComparisonVersionIds] = useState<readonly string[]>(['', '']);
  const selectedProject = snapshot.character.projects.find(
    (project) => project.characterProjectId === selectedProjectId,
  );
  const versions = useMemo(
    () =>
      snapshot.character.versions.filter(
        (version) => version.characterProjectId === selectedProject?.characterProjectId,
      ),
    [selectedProject?.characterProjectId, snapshot.character.versions],
  );
  const versionIds = useMemo(
    () => new Set(versions.map((version) => version.characterVersionId)),
    [versions],
  );
  const characterRuns = snapshot.character.characterRuns.filter((run) =>
    versionIds.has(run.characterVersionId),
  );
  const storylines = snapshot.character.storylines.filter(
    (storyline) => storyline.characterProjectId === selectedProject?.characterProjectId,
  );
  const storylineVersions = snapshot.character.storylineVersions.filter((storyline) =>
    versionIds.has(storyline.characterVersionId),
  );
  const selectedStorylineVersions = storylineVersions.filter(
    (version) => version.characterStorylineId === storylineFields.characterStorylineId,
  );
  const comparisonVersions = comparisonVersionIds.map((versionId) =>
    selectedStorylineVersions.find((version) => version.characterStorylineVersionId === versionId),
  );
  const companionContinuities = snapshot.character.companionContinuities.filter(
    (continuity) => continuity.characterProjectId === selectedProject?.characterProjectId,
  );
  const relationships = snapshot.character.relationships.filter(
    (relationship) => relationship.characterProjectId === selectedProject?.characterProjectId,
  );

  useEffect(() => {
    setVersionLabel('');
    setStorylineFields(emptyStorylineFields);
    setComparisonVersionIds(['', '']);
    if (creating) {
      setFields(emptyFields);
      return;
    }
    if (selectedProject) setFields(projectFields(selectedProject));
  }, [creating, selectedProject]);
  const submitDraft = async () => {
    const definition = definitionFromFields(
      fields,
      selectedProject?.draft.representationRefs ?? [],
      selectedProject?.draft.backgroundStory ?? createEmptyCharacterBackgroundStory(),
      selectedProject?.draft.originSetting ?? createEmptyCharacterOriginSetting(),
      selectedProject?.draft.representationDefaults,
      selectedProject?.draft.voiceDefaults,
    );
    if (creating) {
      const characterProjectId = createDomainIdentity('character-project');
      await execute({
        operation: 'character-project-create',
        input: { characterProjectId, displayName: fields.displayName, draft: definition },
      });
      onCreated(characterProjectId);
      return;
    }
    if (!selectedProject) throw new Error('CharacterProject selection is required.');
    await execute({
      operation: 'character-project-update-draft',
      input: { characterProjectId: selectedProject.characterProjectId, draft: definition },
    });
  };
  const setReview = async (reviewStatus: 'draft' | 'ready' | 'blocked') => {
    if (!selectedProject) throw new Error('CharacterProject selection is required.');
    await execute({
      operation: 'character-project-set-review',
      input: { characterProjectId: selectedProject.characterProjectId, reviewStatus },
    });
  };
  const publish = async () => {
    if (!selectedProject) throw new Error('CharacterProject selection is required.');
    const characterVersionId = createDomainIdentity('character-version');
    await execute({
      operation: 'character-version-publish',
      input: {
        characterProjectId: selectedProject.characterProjectId,
        characterVersionId,
        label: versionLabel,
      },
    });
    setVersionLabel('');
  };
  const publishStoryline = async () => {
    if (!storylineFields.characterVersionId) {
      throw new Error('CharacterVersion selection is required for storyline publication.');
    }
    if (!selectedProject) throw new Error('CharacterProject selection is required.');
    const characterStorylineId =
      storylineFields.characterStorylineId || createDomainIdentity('character-storyline');
    const storylineNodeId =
      storylineFields.storylineNodeId || createDomainIdentity('storyline-node');
    const draft = {
      characterVersionId: storylineFields.characterVersionId,
      premise: storylineFields.premise,
      constraints: lines(storylineFields.constraints),
      nodeOrder: [storylineNodeId],
      nodes: [
        {
          storylineNodeId,
          title: storylineFields.nodeTitle,
          spoilerVisibility: 'visible' as const,
          context: {
            situation: storylineFields.situation,
            characterState: storylineFields.characterState,
            relationshipState: storylineFields.relationshipState,
            allowedStoryFacts: [],
            forbiddenStoryFacts: [],
            narrativeMemories: lines(storylineFields.narrativeMemories),
            knowledgeBoundary: [],
            behaviorConstraints: [],
            expressionConstraints: [],
            authorOnlyNotes: [],
          },
        },
      ],
      edges: [],
    };
    await execute(
      storylineFields.characterStorylineId
        ? {
            operation: 'character-storyline-update-draft',
            input: {
              characterStorylineId,
              displayName: storylineFields.label,
              draft,
            },
          }
        : {
            operation: 'character-storyline-create',
            input: {
              characterStorylineId,
              characterProjectId: selectedProject.characterProjectId,
              displayName: storylineFields.label,
              draft,
            },
          },
    );
    await execute({
      operation: 'character-storyline-publish',
      input: {
        characterStorylineId,
        characterStorylineVersionId: createDomainIdentity('character-storyline-version'),
        label: storylineFields.label,
      },
    });
    setStorylineFields(emptyStorylineFields);
    setComparisonVersionIds(['', '']);
  };
  const selectStoryline = (characterStorylineId: string) => {
    if (!characterStorylineId) {
      setStorylineFields(emptyStorylineFields);
      setComparisonVersionIds(['', '']);
      return;
    }
    const storyline = storylines.find(
      (candidate) => candidate.characterStorylineId === characterStorylineId,
    );
    const draft = snapshot.character.storylineDrafts.find(
      (candidate) => candidate.characterStorylineId === characterStorylineId,
    );
    if (!storyline || !draft) {
      throw new Error(`CharacterStoryline '${characterStorylineId}' draft is unavailable.`);
    }
    setStorylineFields(storylineFieldsFromDraft(storyline.displayName, draft));
    setComparisonVersionIds(['', '']);
  };
  const restoreStorylineVersion = async (version: CharacterStorylineVersion) => {
    await execute({
      operation: 'character-storyline-restore-as-draft',
      input: {
        characterStorylineId: version.characterStorylineId,
        characterStorylineVersionId: version.characterStorylineVersionId,
      },
    });
    const storyline = storylines.find(
      (candidate) => candidate.characterStorylineId === version.characterStorylineId,
    );
    if (!storyline) {
      throw new Error(`CharacterStoryline '${version.characterStorylineId}' is unavailable.`);
    }
    setStorylineFields(storylineFieldsFromVersion(storyline.displayName, version));
  };
  const deleteStoryline = async () => {
    if (!storylineFields.characterStorylineId) {
      throw new Error('CharacterStoryline selection is required.');
    }
    await execute({
      operation: 'character-storyline-delete',
      input: { characterStorylineId: storylineFields.characterStorylineId },
    });
    setStorylineFields(emptyStorylineFields);
    setComparisonVersionIds(['', '']);
  };
  if (!creating && !selectedProject) {
    return (
      <div className="character-management__detail-empty" role="status">
        {foundationLabel(locale, '所选角色不可用。', 'The selected character is unavailable.')}
      </div>
    );
  }

  return (
    <div
      className="character-foundation character-foundation__editor"
      data-character-detail-editor="true"
    >
      <form
        className="character-foundation__form"
        onSubmit={(event) => submitForm(event, submitDraft)}
      >
        <div className="character-foundation__form-heading">
          <div>
            <span>
              {creating
                ? foundationLabel(locale, '新角色', 'New character')
                : selectedProject?.characterProjectId}
            </span>
            <h3>
              {creating
                ? foundationLabel(locale, '定义角色', 'Define character')
                : selectedProject?.displayName}
            </h3>
          </div>
          <FoundationSubmit pending={pendingOperation !== undefined}>
            {creating
              ? foundationLabel(locale, '创建项目', 'Create project')
              : foundationLabel(locale, '保存草稿', 'Save draft')}
          </FoundationSubmit>
        </div>
        <div className="character-foundation__form-sections">
          <section className="character-foundation__panel" data-character-studio-section="identity">
            <FoundationSectionHeading
              description={foundationLabel(
                locale,
                '用于列表识别和快速理解角色。',
                'The essentials used to identify and understand this character.',
              )}
              eyebrow={foundationLabel(locale, '基础资料', 'Essentials')}
              title={foundationLabel(locale, '角色身份', 'Character identity')}
            />
            <div className="character-foundation__form-grid character-foundation__form-grid--identity">
              <FoundationField label={foundationLabel(locale, '显示名称', 'Display name')}>
                <input
                  disabled={!creating}
                  required
                  value={fields.displayName}
                  onChange={(event) => setFields({ ...fields, displayName: event.target.value })}
                />
              </FoundationField>
              <FoundationField label={foundationLabel(locale, '角色概述', 'Summary')}>
                <textarea
                  required
                  rows={3}
                  value={fields.summary}
                  onChange={(event) => setFields({ ...fields, summary: event.target.value })}
                />
              </FoundationField>
            </div>
          </section>

          <details
            className="character-foundation__panel character-foundation__disclosure"
            data-character-studio-section="character-definition"
            open={creating || undefined}
          >
            <summary>
              <FoundationSectionHeading
                description={foundationLabel(
                  locale,
                  '背景、边界与行为规则；运行时会共同约束角色。',
                  'Background, boundaries, and policies that constrain runtime behavior.',
                )}
                eyebrow={foundationLabel(locale, '深层设定', 'Definition')}
                title={foundationLabel(locale, '故事与行为', 'Story and behavior')}
              />
            </summary>
            <div className="character-foundation__form-grid">
              <FoundationField label={foundationLabel(locale, '背景故事', 'Background story')}>
                <textarea
                  data-character-studio-section="background-story"
                  rows={4}
                  value={fields.backgroundOverview}
                  onChange={(event) =>
                    setFields({ ...fields, backgroundOverview: event.target.value })
                  }
                />
              </FoundationField>
              <FoundationField label={foundationLabel(locale, '起源设定', 'Origin setting')}>
                <textarea
                  data-character-studio-section="origin-setting"
                  rows={4}
                  value={fields.originOverview}
                  onChange={(event) => setFields({ ...fields, originOverview: event.target.value })}
                />
              </FoundationField>
              <FoundationField
                hint={foundationLabel(locale, '每行一条已确认事实', 'One confirmed fact per line')}
                label={foundationLabel(locale, '角色设定', 'Canon')}
              >
                <textarea
                  rows={4}
                  value={fields.canon}
                  onChange={(event) => setFields({ ...fields, canon: event.target.value })}
                />
              </FoundationField>
              <FoundationField
                hint={foundationLabel(
                  locale,
                  '每行一条不可越过的知识边界',
                  'One knowledge boundary per line',
                )}
                label={foundationLabel(locale, '知识边界', 'Knowledge boundary')}
              >
                <textarea
                  rows={4}
                  value={fields.knowledgeBoundary}
                  onChange={(event) =>
                    setFields({ ...fields, knowledgeBoundary: event.target.value })
                  }
                />
              </FoundationField>
              <FoundationField
                hint={foundationLabel(locale, '每行一条行为规则', 'One behavior rule per line')}
                label={foundationLabel(locale, '行为策略', 'Behavior policy')}
              >
                <textarea
                  rows={4}
                  value={fields.behaviorPolicy}
                  onChange={(event) => setFields({ ...fields, behaviorPolicy: event.target.value })}
                />
              </FoundationField>
              <FoundationField
                hint={foundationLabel(locale, '每行一条表达规则', 'One expression rule per line')}
                label={foundationLabel(locale, '表达策略', 'Expression policy')}
              >
                <textarea
                  rows={4}
                  value={fields.expressionPolicy}
                  onChange={(event) =>
                    setFields({ ...fields, expressionPolicy: event.target.value })
                  }
                />
              </FoundationField>
            </div>
          </details>

          <details
            className="character-foundation__panel character-foundation__disclosure"
            data-character-studio-section="presentation"
          >
            <summary>
              <FoundationSectionHeading
                description={foundationLabel(
                  locale,
                  '连接全局资产、动态形象和默认语音。',
                  'Connect Global Assets, an avatar, and default voice behavior.',
                )}
                eyebrow={foundationLabel(locale, '表现资源', 'Presentation')}
                title={foundationLabel(locale, '形象与语音', 'Avatar and voice')}
              />
            </summary>
            <div className="character-foundation__form-grid">
              <FoundationField
                hint={foundationLabel(
                  locale,
                  '使用全局资源库中的稳定 opaque identity，例如 global-asset-library:…',
                  'Use a stable opaque identity from Global Assets, such as global-asset-library:…',
                )}
                label={foundationLabel(locale, '默认肖像资源', 'Default portrait resource')}
              >
                <input
                  data-character-studio-section="portrait-resource"
                  placeholder="global-asset-library:…"
                  value={fields.portraitResourceRef}
                  onChange={(event) =>
                    setFields({ ...fields, portraitResourceRef: event.target.value })
                  }
                />
              </FoundationField>
              <FoundationField
                label={foundationLabel(locale, '默认动态形象格式', 'Default Avatar format')}
              >
                <select
                  data-character-studio-section="avatar-kind"
                  value={fields.avatarKind}
                  onChange={(event) =>
                    setFields({
                      ...fields,
                      avatarKind: event.target.value as CharacterDraftFields['avatarKind'],
                    })
                  }
                >
                  <option value="vrm">VRM</option>
                  <option value="live2d">Live2D</option>
                  <option value="mmd">MMD</option>
                  <option value="pngtuber">PNGTuber</option>
                </select>
              </FoundationField>
              <FoundationField
                hint={foundationLabel(
                  locale,
                  '当前 Desktop 提供 VRM renderer；其他格式会在 Avatar Surface 局部显示不可用。',
                  'Desktop currently provides the VRM renderer; other formats fail locally in the Avatar Surface.',
                )}
                label={foundationLabel(locale, '默认动态形象资源', 'Default Avatar resource')}
              >
                <input
                  data-character-studio-section="avatar-resource"
                  placeholder="global-asset-library:…"
                  value={fields.avatarResourceRef}
                  onChange={(event) =>
                    setFields({ ...fields, avatarResourceRef: event.target.value })
                  }
                />
              </FoundationField>
              <FoundationField
                hint={foundationLabel(
                  locale,
                  '使用稳定 provider identity，例如 provider:local-tts',
                  'Use a stable provider identity, such as provider:local-tts',
                )}
                label={foundationLabel(locale, '语音提供方', 'Voice provider')}
              >
                <input
                  data-character-studio-section="voice-provider"
                  placeholder="provider:…"
                  required={fields.voiceResourceRef.trim().length > 0}
                  value={fields.voiceProviderRef}
                  onChange={(event) =>
                    setFields({ ...fields, voiceProviderRef: event.target.value })
                  }
                />
              </FoundationField>
              <FoundationField
                label={foundationLabel(locale, '默认语音资源', 'Default voice resource')}
              >
                <input
                  data-character-studio-section="voice-resource"
                  placeholder="global-asset-library:…"
                  required={fields.voiceProviderRef.trim().length > 0}
                  value={fields.voiceResourceRef}
                  onChange={(event) =>
                    setFields({ ...fields, voiceResourceRef: event.target.value })
                  }
                />
              </FoundationField>
              <div className="character-foundation__voice-controls">
                <FoundationField label={foundationLabel(locale, '语速', 'Voice speed')}>
                  <input
                    data-character-studio-section="voice-speed"
                    max="4"
                    min="0.25"
                    step="0.05"
                    type="number"
                    value={fields.voiceSpeed}
                    onChange={(event) =>
                      setFields({ ...fields, voiceSpeed: Number(event.target.value) })
                    }
                  />
                </FoundationField>
                <label className="character-foundation__toggle">
                  <input
                    checked={fields.voiceAutoRead}
                    data-character-studio-section="voice-auto-read"
                    type="checkbox"
                    onChange={(event) =>
                      setFields({ ...fields, voiceAutoRead: event.target.checked })
                    }
                  />
                  <span>{foundationLabel(locale, '自动朗读', 'Auto read')}</span>
                </label>
              </div>
            </div>
          </details>
        </div>
      </form>
      {!creating && selectedProject ? (
        <>
          <section className="character-foundation__publication">
            <div className="character-foundation__publication-heading">
              <FoundationSectionHeading
                description={foundationLabel(
                  locale,
                  '审阅当前草稿并发布不可变的角色版本。',
                  'Review the current draft and publish an immutable character version.',
                )}
                eyebrow={foundationLabel(locale, '版本管理', 'Publication')}
                title={foundationLabel(locale, '审阅与发布', 'Review and publish')}
              />
            </div>
            <div>
              <span>{foundationLabel(locale, '审阅状态', 'Review status')}</span>
              <FoundationSegmented
                label={foundationLabel(locale, '角色审阅状态', 'Character review status')}
                options={[
                  { value: 'draft', label: foundationLabel(locale, '草稿', 'Draft') },
                  { value: 'ready', label: foundationLabel(locale, '可发布', 'Ready') },
                  { value: 'blocked', label: foundationLabel(locale, '阻塞', 'Blocked') },
                ]}
                value={selectedProject.reviewStatus}
                onChange={(value) => void setReview(value).catch(() => undefined)}
              />
            </div>
            <form onSubmit={(event) => submitForm(event, publish)}>
              <FoundationField label={foundationLabel(locale, '版本名称', 'Version label')}>
                <input
                  required
                  value={versionLabel}
                  onChange={(event) => setVersionLabel(event.target.value)}
                />
              </FoundationField>
              <FoundationSubmit
                disabled={selectedProject.reviewStatus !== 'ready'}
                pending={pendingOperation !== undefined}
              >
                {foundationLabel(locale, '发布版本', 'Publish version')}
              </FoundationSubmit>
            </form>
            <div className="character-foundation__version-list">
              <strong>
                {formatCount(locale, versions.length, '个已发布版本', 'published version')}
              </strong>
              {versions.map((version) => (
                <div key={version.characterVersionId}>
                  <span>{version.label}</span>
                  <code>{version.characterVersionId}</code>
                </div>
              ))}
            </div>
          </section>
          {!authoringOnly ? (
            <>
              <details
                className="character-foundation__studio-authoring character-foundation__studio-disclosure"
                data-character-studio-section="storyline-authoring"
              >
                <summary>
                  <div className="character-foundation__studio-heading">
                    <div>
                      <span>{foundationLabel(locale, '个人故事线', 'Character storylines')}</span>
                      <h4>
                        {foundationLabel(locale, '发布角色故事线', 'Publish a character storyline')}
                      </h4>
                    </div>
                    <strong>{storylineVersions.length}</strong>
                  </div>
                </summary>
                {versions.length === 0 ? (
                  <p>
                    {foundationLabel(
                      locale,
                      '先发布一个角色版本，再为该版本创建故事线。',
                      'Publish a character version before creating a storyline for it.',
                    )}
                  </p>
                ) : (
                  <form
                    className="character-foundation__form-grid"
                    onSubmit={(event) => submitForm(event, publishStoryline)}
                  >
                    <FoundationField
                      label={foundationLabel(locale, '故事线', 'Character storyline')}
                    >
                      <select
                        value={storylineFields.characterStorylineId}
                        onChange={(event) => selectStoryline(event.target.value)}
                      >
                        <option value="">
                          {foundationLabel(locale, '创建新故事线', 'Create a new storyline')}
                        </option>
                        {storylines.map((storyline) => (
                          <option
                            key={storyline.characterStorylineId}
                            value={storyline.characterStorylineId}
                          >
                            {storyline.displayName}
                          </option>
                        ))}
                      </select>
                    </FoundationField>
                    <FoundationField
                      label={foundationLabel(locale, '角色版本', 'Character version')}
                    >
                      <select
                        required
                        value={storylineFields.characterVersionId}
                        onChange={(event) =>
                          setStorylineFields({
                            ...storylineFields,
                            characterVersionId: event.target.value,
                          })
                        }
                      >
                        <option value="">
                          {foundationLabel(locale, '选择版本', 'Select a version')}
                        </option>
                        {versions.map((publication) => (
                          <option
                            key={publication.characterVersionId}
                            value={publication.characterVersionId}
                          >
                            {publication.label}
                          </option>
                        ))}
                      </select>
                    </FoundationField>
                    <FoundationField
                      label={foundationLabel(locale, '故事线名称', 'Storyline label')}
                    >
                      <input
                        required
                        value={storylineFields.label}
                        onChange={(event) =>
                          setStorylineFields({ ...storylineFields, label: event.target.value })
                        }
                      />
                    </FoundationField>
                    <FoundationField label={foundationLabel(locale, '前提', 'Premise')}>
                      <textarea
                        required
                        rows={3}
                        value={storylineFields.premise}
                        onChange={(event) =>
                          setStorylineFields({ ...storylineFields, premise: event.target.value })
                        }
                      />
                    </FoundationField>
                    <FoundationField label={foundationLabel(locale, '角色状态', 'Character state')}>
                      <textarea
                        required
                        rows={3}
                        value={storylineFields.characterState}
                        onChange={(event) =>
                          setStorylineFields({
                            ...storylineFields,
                            characterState: event.target.value,
                          })
                        }
                      />
                    </FoundationField>
                    <FoundationField
                      label={foundationLabel(locale, '关系状态', 'Relationship state')}
                    >
                      <textarea
                        required
                        rows={3}
                        value={storylineFields.relationshipState}
                        onChange={(event) =>
                          setStorylineFields({
                            ...storylineFields,
                            relationshipState: event.target.value,
                          })
                        }
                      />
                    </FoundationField>
                    <FoundationField
                      label={foundationLabel(locale, '叙事记忆', 'Narrative memories')}
                    >
                      <textarea
                        required
                        rows={3}
                        value={storylineFields.narrativeMemories}
                        onChange={(event) =>
                          setStorylineFields({
                            ...storylineFields,
                            narrativeMemories: event.target.value,
                          })
                        }
                      />
                    </FoundationField>
                    <FoundationField label={foundationLabel(locale, '节点标题', 'Node title')}>
                      <input
                        required
                        value={storylineFields.nodeTitle}
                        onChange={(event) =>
                          setStorylineFields({ ...storylineFields, nodeTitle: event.target.value })
                        }
                      />
                    </FoundationField>
                    <FoundationField
                      label={foundationLabel(locale, '当前情境', 'Current situation')}
                    >
                      <textarea
                        required
                        rows={3}
                        value={storylineFields.situation}
                        onChange={(event) =>
                          setStorylineFields({
                            ...storylineFields,
                            situation: event.target.value,
                          })
                        }
                      />
                    </FoundationField>
                    <FoundationField
                      hint={foundationLabel(locale, '每行一条约束', 'One constraint per line')}
                      label={foundationLabel(locale, '故事线约束', 'Storyline constraints')}
                    >
                      <textarea
                        rows={3}
                        value={storylineFields.constraints}
                        onChange={(event) =>
                          setStorylineFields({
                            ...storylineFields,
                            constraints: event.target.value,
                          })
                        }
                      />
                    </FoundationField>
                    <FoundationSubmit pending={pendingOperation !== undefined}>
                      {foundationLabel(locale, '发布故事线', 'Publish storyline')}
                    </FoundationSubmit>
                    {storylineFields.characterStorylineId ? (
                      <button
                        disabled={pendingOperation !== undefined}
                        type="button"
                        onClick={() => void deleteStoryline().catch(() => undefined)}
                      >
                        {foundationLabel(locale, '删除所选故事线', 'Delete selected storyline')}
                      </button>
                    ) : null}
                  </form>
                )}
                <div className="character-foundation__review-list">
                  {storylineVersions.map((storyline) => (
                    <div
                      className="character-foundation__storyline-record"
                      key={storyline.characterStorylineVersionId}
                    >
                      <strong>{storyline.label}</strong>
                      <span>{storyline.premise}</span>
                      <code>{storyline.characterStorylineVersionId}</code>
                      <button
                        disabled={pendingOperation !== undefined}
                        type="button"
                        onClick={() =>
                          void restoreStorylineVersion(storyline).catch(() => undefined)
                        }
                      >
                        {foundationLabel(locale, '恢复为草稿', 'Restore as draft')}
                      </button>
                    </div>
                  ))}
                </div>
                {selectedStorylineVersions.length >= 2 ? (
                  <section
                    aria-label={foundationLabel(
                      locale,
                      '故事线版本比较',
                      'Compare storyline publications',
                    )}
                  >
                    <FoundationField
                      label={foundationLabel(locale, '左侧版本', 'Left publication')}
                    >
                      <select
                        value={comparisonVersionIds[0]}
                        onChange={(event) =>
                          setComparisonVersionIds([
                            event.target.value,
                            comparisonVersionIds[1] ?? '',
                          ])
                        }
                      >
                        <option value="">
                          {foundationLabel(locale, '选择版本', 'Select publication')}
                        </option>
                        {selectedStorylineVersions.map((version) => (
                          <option
                            key={version.characterStorylineVersionId}
                            value={version.characterStorylineVersionId}
                          >
                            {version.label}
                          </option>
                        ))}
                      </select>
                    </FoundationField>
                    <FoundationField
                      label={foundationLabel(locale, '右侧版本', 'Right publication')}
                    >
                      <select
                        value={comparisonVersionIds[1]}
                        onChange={(event) =>
                          setComparisonVersionIds([
                            comparisonVersionIds[0] ?? '',
                            event.target.value,
                          ])
                        }
                      >
                        <option value="">
                          {foundationLabel(locale, '选择版本', 'Select publication')}
                        </option>
                        {selectedStorylineVersions.map((version) => (
                          <option
                            key={version.characterStorylineVersionId}
                            value={version.characterStorylineVersionId}
                          >
                            {version.label}
                          </option>
                        ))}
                      </select>
                    </FoundationField>
                    <div className="character-foundation__review-list">
                      {comparisonVersions.map((version, index) =>
                        version ? (
                          <div key={`${index}:${version.characterStorylineVersionId}`}>
                            <strong>{version.label}</strong>
                            <span>{version.premise}</span>
                            <span>
                              {formatCount(
                                locale,
                                version.nodes.length,
                                '个节点',
                                'storyline node',
                              )}
                            </span>
                            {version.nodes.map((node) => (
                              <span key={node.storylineNodeId}>{node.title}</span>
                            ))}
                          </div>
                        ) : null,
                      )}
                    </div>
                  </section>
                ) : null}
              </details>
              <details
                className="character-foundation__studio-authoring character-foundation__studio-disclosure"
                data-character-studio-section="memory-review"
              >
                <summary>
                  <div className="character-foundation__studio-heading">
                    <div>
                      <span>{foundationLabel(locale, '角色主观记忆', 'Character memory')}</span>
                      <h4>
                        {foundationLabel(
                          locale,
                          '候选与已接受记忆',
                          'Candidates and accepted memories',
                        )}
                      </h4>
                    </div>
                    <strong>{companionContinuities.length}</strong>
                  </div>
                </summary>
                <div className="character-foundation__review-list">
                  {companionContinuities.map((continuity) => (
                    <div key={continuity.companionContinuityId}>
                      <code>{continuity.companionContinuityId}</code>
                      <span>{`${continuity.entries.filter((entry) => entry.status === 'active').length} active · ${continuity.candidates.filter((candidate) => candidate.status === 'pending').length} pending`}</span>
                    </div>
                  ))}
                  {companionContinuities.length === 0 ? (
                    <div>
                      <span>
                        {foundationLabel(
                          locale,
                          '角色进入日常对话后，会按用户与角色创建长期连续性记录。',
                          'Companion dialogue creates long-term continuity for this user and character.',
                        )}
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="character-foundation__review-list">
                  {companionContinuities.flatMap((continuity) => [
                    ...continuity.candidates.map((candidate) => (
                      <div key={candidate.companionMemoryCandidateId}>
                        <strong>{candidate.content}</strong>
                        <span>{candidate.status}</span>
                        <code>{formatMemoryProvenance(candidate.provenance)}</code>
                        {candidate.status === 'pending' ? (
                          <span className="character-foundation__review-actions">
                            <button
                              type="button"
                              onClick={() =>
                                void execute({
                                  operation: 'companion-memory-candidate-accept',
                                  input: {
                                    companionContinuityId: continuity.companionContinuityId,
                                    companionMemoryCandidateId:
                                      candidate.companionMemoryCandidateId,
                                    companionMemoryEntryId:
                                      createDomainIdentity('companion-memory-entry'),
                                    expectedContinuityRevision: continuity.continuityRevision,
                                  },
                                }).catch(() => undefined)
                              }
                            >
                              {foundationLabel(locale, '接受', 'Accept')}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void execute({
                                  operation: 'companion-memory-candidate-reject',
                                  input: {
                                    companionContinuityId: continuity.companionContinuityId,
                                    companionMemoryCandidateId:
                                      candidate.companionMemoryCandidateId,
                                    expectedContinuityRevision: continuity.continuityRevision,
                                  },
                                }).catch(() => undefined)
                              }
                            >
                              {foundationLabel(locale, '拒绝', 'Reject')}
                            </button>
                          </span>
                        ) : null}
                      </div>
                    )),
                    ...continuity.entries.map((entry) => (
                      <div key={entry.companionMemoryEntryId}>
                        <strong>{entry.content}</strong>
                        <span>{entry.status}</span>
                        <code>{formatMemoryProvenance(entry.provenance)}</code>
                        {entry.status === 'active' ? (
                          <button
                            type="button"
                            onClick={() =>
                              void execute({
                                operation: 'companion-memory-entry-delete',
                                input: {
                                  companionContinuityId: continuity.companionContinuityId,
                                  companionMemoryEntryId: entry.companionMemoryEntryId,
                                  expectedContinuityRevision: continuity.continuityRevision,
                                },
                              }).catch(() => undefined)
                            }
                          >
                            {foundationLabel(locale, '删除', 'Delete')}
                          </button>
                        ) : null}
                      </div>
                    )),
                  ])}
                </div>
              </details>
              <details
                className="character-foundation__studio-authoring character-foundation__studio-disclosure"
                data-character-studio-section="relationship-memory-review"
              >
                <summary>
                  <div className="character-foundation__studio-heading">
                    <div>
                      <span>{foundationLabel(locale, '关系记忆', 'Relationship memory')}</span>
                      <h4>
                        {foundationLabel(
                          locale,
                          '独立审阅关系记忆',
                          'Review relationship memory independently',
                        )}
                      </h4>
                    </div>
                    <strong>{relationships.length}</strong>
                  </div>
                </summary>
                {relationships.length === 0 ? (
                  <p>
                    {foundationLabel(
                      locale,
                      '角色进入 Companion 对话后会创建可独立审阅的关系记录。',
                      'Companion dialogue creates relationship records that can be reviewed independently.',
                    )}
                  </p>
                ) : null}
                <div className="character-foundation__review-list">
                  {relationships.flatMap((relationship) => [
                    ...relationship.candidates.map((candidate) => (
                      <div key={`${relationship.relationshipId}:${candidate.candidateId}`}>
                        <strong>{candidate.content}</strong>
                        <span>{candidate.status}</span>
                        {candidate.status === 'pending' ? (
                          <span className="character-foundation__review-actions">
                            <button
                              type="button"
                              onClick={() =>
                                void execute({
                                  operation: 'relationship-memory-candidate-accept',
                                  input: {
                                    relationshipId: relationship.relationshipId,
                                    candidateId: candidate.candidateId,
                                    memoryId: createDomainIdentity('relationship-memory'),
                                    expectedRelationshipRevision: relationship.relationshipRevision,
                                  },
                                }).catch(() => undefined)
                              }
                            >
                              {foundationLabel(locale, '接受', 'Accept')}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void execute({
                                  operation: 'relationship-memory-candidate-reject',
                                  input: {
                                    relationshipId: relationship.relationshipId,
                                    candidateId: candidate.candidateId,
                                    expectedRelationshipRevision: relationship.relationshipRevision,
                                  },
                                }).catch(() => undefined)
                              }
                            >
                              {foundationLabel(locale, '拒绝', 'Reject')}
                            </button>
                          </span>
                        ) : null}
                      </div>
                    )),
                    ...relationship.memories.map((memory) => (
                      <div key={`${relationship.relationshipId}:${memory.memoryId}`}>
                        <strong>{memory.content}</strong>
                        <code>{formatMemoryProvenance(memory.provenance)}</code>
                        {memory.status === 'active' ? (
                          <button
                            type="button"
                            onClick={() =>
                              void execute({
                                operation: 'relationship-memory-delete',
                                input: {
                                  relationshipId: relationship.relationshipId,
                                  memoryId: memory.memoryId,
                                  expectedRelationshipRevision: relationship.relationshipRevision,
                                },
                              }).catch(() => undefined)
                            }
                          >
                            {foundationLabel(locale, '删除', 'Delete')}
                          </button>
                        ) : null}
                      </div>
                    )),
                  ])}
                </div>
              </details>
              <section
                className="character-foundation__studio-inventory"
                data-character-studio-section="runtime-inventory"
              >
                <h4>
                  {foundationLabel(locale, '角色能力与历史', 'Character capabilities and history')}
                </h4>
                <div className="character-foundation__studio-grid">
                  <StudioSummary
                    label={foundationLabel(locale, '个人故事线', 'Character storylines')}
                    value={`${storylines.length} / ${storylineVersions.length}`}
                  />
                  <StudioSummary
                    label={foundationLabel(locale, '角色主观记忆', 'Character memory')}
                    value={`${companionContinuities.length}`}
                  />
                  <StudioSummary
                    label={foundationLabel(locale, '关系记忆', 'Relationship memory')}
                    value={`${relationships.reduce((count, item) => count + item.memories.length, 0)}`}
                  />
                  <StudioSummary
                    label={foundationLabel(locale, '表现资源', 'Presentation resources')}
                    value={`${selectedProject.draft.representationRefs.length}`}
                  />
                  <StudioSummary
                    label={foundationLabel(locale, '语音默认值', 'Voice defaults')}
                    value={
                      selectedProject.draft.voiceDefaults?.voiceRepresentationId ??
                      foundationLabel(locale, '未配置', 'Not configured')
                    }
                  />
                  <StudioSummary
                    label={foundationLabel(locale, '运行历史', 'Runtime history')}
                    value={`${characterRuns.length}`}
                  />
                </div>
              </section>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function projectFields(project: CharacterProject): CharacterDraftFields {
  const portrait = selectedRepresentation(
    project.draft.representationRefs,
    project.draft.representationDefaults?.portraitRepresentationId,
  );
  const avatar = selectedRepresentation(
    project.draft.representationRefs,
    project.draft.representationDefaults?.avatarRepresentationId,
  );
  const voice = selectedRepresentation(
    project.draft.representationRefs,
    project.draft.voiceDefaults?.voiceRepresentationId,
  );
  return {
    displayName: project.displayName,
    summary: project.draft.summary,
    backgroundOverview: project.draft.backgroundStory.overview,
    originOverview: project.draft.originSetting.overview,
    canon: project.draft.canon.join('\n'),
    knowledgeBoundary: project.draft.knowledgeBoundary.join('\n'),
    behaviorPolicy: project.draft.behaviorPolicy.join('\n'),
    expressionPolicy: project.draft.expressionPolicy.join('\n'),
    portraitResourceRef: portrait?.kind === 'portrait' ? portrait.resourceRef : '',
    avatarKind:
      avatar && ['live2d', 'vrm', 'mmd', 'pngtuber'].includes(avatar.kind)
        ? (avatar.kind as CharacterDraftFields['avatarKind'])
        : 'vrm',
    avatarResourceRef:
      avatar && ['live2d', 'vrm', 'mmd', 'pngtuber'].includes(avatar.kind)
        ? avatar.resourceRef
        : '',
    voiceProviderRef: project.draft.voiceDefaults?.providerRef ?? '',
    voiceResourceRef: voice?.kind === 'voice' ? voice.resourceRef : '',
    voiceSpeed: project.draft.voiceDefaults?.speed ?? 1,
    voiceAutoRead: project.draft.voiceDefaults?.autoRead ?? false,
  };
}

function storylineFieldsFromDraft(
  label: string,
  draft: CharacterStorylineDraft,
): StorylineDraftFields {
  const nodeId = draft.nodeOrder[0];
  const node = draft.nodes.find((candidate) => candidate.storylineNodeId === nodeId);
  if (!nodeId || !node) {
    throw new Error(`CharacterStoryline '${draft.characterStorylineId}' has no editable node.`);
  }
  return storylineFieldsFromContent(label, draft, nodeId, node);
}

function storylineFieldsFromVersion(
  displayName: string,
  version: CharacterStorylineVersion,
): StorylineDraftFields {
  const nodeId = version.nodeOrder[0];
  const node = version.nodes.find((candidate) => candidate.storylineNodeId === nodeId);
  if (!nodeId || !node) {
    throw new Error(
      `CharacterStorylineVersion '${version.characterStorylineVersionId}' has no editable node.`,
    );
  }
  return storylineFieldsFromContent(displayName, version, nodeId, node);
}

function storylineFieldsFromContent(
  displayName: string,
  content: Pick<
    CharacterStorylineDraft,
    'characterStorylineId' | 'characterVersionId' | 'premise' | 'constraints'
  >,
  storylineNodeId: string,
  node: CharacterStorylineDraft['nodes'][number],
): StorylineDraftFields {
  return {
    characterStorylineId: content.characterStorylineId,
    storylineNodeId,
    characterVersionId: content.characterVersionId,
    label: displayName,
    premise: content.premise,
    characterState: node.context.characterState ?? '',
    relationshipState: node.context.relationshipState ?? '',
    narrativeMemories: node.context.narrativeMemories.join('\n'),
    nodeTitle: node.title,
    situation: node.context.situation,
    constraints: content.constraints.join('\n'),
  };
}

function definitionFromFields(
  fields: CharacterDraftFields,
  representationRefs: readonly CharacterRepresentationRef[],
  backgroundStory: CharacterBackgroundStory,
  originSetting: CharacterOriginSetting,
  representationDefaults: CharacterRepresentationDefaults | undefined,
  voiceDefaults: CharacterVoiceDefaults | undefined,
): CharacterDefinition {
  const presentation = presentationFromFields(
    fields,
    representationRefs,
    representationDefaults,
    voiceDefaults,
  );
  return {
    summary: fields.summary,
    backgroundStory: { ...backgroundStory, overview: fields.backgroundOverview },
    originSetting: { ...originSetting, overview: fields.originOverview },
    canon: lines(fields.canon),
    knowledgeBoundary: lines(fields.knowledgeBoundary),
    behaviorPolicy: lines(fields.behaviorPolicy),
    expressionPolicy: lines(fields.expressionPolicy),
    representationRefs: presentation.representationRefs,
    ...(presentation.representationDefaults === undefined
      ? {}
      : { representationDefaults: presentation.representationDefaults }),
    ...(presentation.voiceDefaults === undefined
      ? {}
      : { voiceDefaults: presentation.voiceDefaults }),
  };
}

function presentationFromFields(
  fields: CharacterDraftFields,
  currentRefs: readonly CharacterRepresentationRef[],
  currentDefaults: CharacterRepresentationDefaults | undefined,
  currentVoiceDefaults: CharacterVoiceDefaults | undefined,
): {
  readonly representationRefs: readonly CharacterRepresentationRef[];
  readonly representationDefaults?: CharacterRepresentationDefaults;
  readonly voiceDefaults?: CharacterVoiceDefaults;
} {
  const portraitRepresentationId = currentDefaults?.portraitRepresentationId ?? 'portrait-main';
  const avatarRepresentationId = currentDefaults?.avatarRepresentationId ?? 'avatar-main';
  const voiceRepresentationId = currentVoiceDefaults?.voiceRepresentationId ?? 'voice-main';
  const replacedIds = new Set([
    portraitRepresentationId,
    avatarRepresentationId,
    voiceRepresentationId,
  ]);
  const representationRefs = currentRefs.filter((ref) => !replacedIds.has(ref.representationId));
  const portraitResourceRef = fields.portraitResourceRef.trim();
  const avatarResourceRef = fields.avatarResourceRef.trim();
  const voiceProviderRef = fields.voiceProviderRef.trim();
  const voiceResourceRef = fields.voiceResourceRef.trim();
  if (portraitResourceRef) {
    representationRefs.push({
      representationId: portraitRepresentationId,
      kind: 'portrait',
      resourceRef: portraitResourceRef,
    });
  }
  if (avatarResourceRef) {
    representationRefs.push({
      representationId: avatarRepresentationId,
      kind: fields.avatarKind,
      resourceRef: avatarResourceRef,
    });
  }
  if (voiceResourceRef) {
    representationRefs.push({
      representationId: voiceRepresentationId,
      kind: 'voice',
      resourceRef: voiceResourceRef,
    });
  }
  const nextDefaults: CharacterRepresentationDefaults = {
    ...(portraitResourceRef ? { portraitRepresentationId } : {}),
    ...(avatarResourceRef ? { avatarRepresentationId } : {}),
  };
  return {
    representationRefs,
    ...(portraitResourceRef || avatarResourceRef ? { representationDefaults: nextDefaults } : {}),
    ...(voiceProviderRef && voiceResourceRef
      ? {
          voiceDefaults: {
            providerRef: voiceProviderRef,
            voiceRepresentationId,
            speed: fields.voiceSpeed,
            autoRead: fields.voiceAutoRead,
          },
        }
      : {}),
  };
}

function selectedRepresentation(
  refs: readonly CharacterRepresentationRef[],
  representationId: string | undefined,
): CharacterRepresentationRef | undefined {
  return representationId === undefined
    ? undefined
    : refs.find((ref) => ref.representationId === representationId);
}

function formatMemoryProvenance(provenance: CompanionMemoryProvenance): string {
  return provenance.kind === 'conversation-turn'
    ? `${provenance.conversationId} / ${provenance.turnId}`
    : `${provenance.roomRunId} / ${provenance.roomEventId}`;
}

function StudioSummary({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="character-foundation__studio-summary">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FoundationSectionHeading({
  description,
  eyebrow,
  title,
}: {
  readonly description: string;
  readonly eyebrow: string;
  readonly title: string;
}) {
  return (
    <div className="character-foundation__section-heading">
      <div>
        <span>{eyebrow}</span>
        <h4>{title}</h4>
      </div>
      <p>{description}</p>
    </div>
  );
}
