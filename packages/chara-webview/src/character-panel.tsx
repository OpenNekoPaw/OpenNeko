import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  type CharacterBackgroundStory,
  type CharacterDefinition,
  type CharacterFoundationCommand,
  type CharacterFoundationSnapshot,
  type CharacterProject,
  type CharacterOriginSetting,
  type CharacterRepresentationRef,
  type CharacterRepresentationDefaults,
  type CharacterRepresentationKind,
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
  readonly characterVersionId: string;
  readonly label: string;
  readonly premise: string;
  readonly desire: string;
  readonly conflict: string;
  readonly growthArc: string;
  readonly stageTitle: string;
  readonly stageDescription: string;
  readonly constraints: string;
}

interface MemoryDraftFields {
  readonly characterMemoryScopeId: string;
  readonly content: string;
  readonly sourceRef: string;
  readonly sensitivityTraits: string;
  readonly retentionTraits: string;
}

interface RelationshipMemoryDraftFields {
  readonly relationshipId: string;
  readonly content: string;
  readonly sourceRef: string;
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
  characterVersionId: '',
  label: '',
  premise: '',
  desire: '',
  conflict: '',
  growthArc: '',
  stageTitle: '',
  stageDescription: '',
  constraints: '',
};

const emptyMemoryFields: MemoryDraftFields = {
  characterMemoryScopeId: '',
  content: '',
  sourceRef: 'user-authored:character-studio',
  sensitivityTraits: '',
  retentionTraits: '',
};

const emptyRelationshipMemoryFields: RelationshipMemoryDraftFields = {
  relationshipId: '',
  content: '',
  sourceRef: 'user-authored:character-studio',
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
  const [memoryFields, setMemoryFields] = useState<MemoryDraftFields>(emptyMemoryFields);
  const [relationshipMemoryFields, setRelationshipMemoryFields] =
    useState<RelationshipMemoryDraftFields>(emptyRelationshipMemoryFields);
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
  const characterRunIds = new Set(characterRuns.map((run) => run.characterRunId));
  const storylineVersions = snapshot.character.storylineVersions.filter((storyline) =>
    versionIds.has(storyline.characterVersionId),
  );
  const storylineVersionIds = new Set(
    storylineVersions.map((storyline) => storyline.characterStorylineVersionId),
  );
  const storylineRuns = snapshot.character.storylineRuns.filter((run) =>
    storylineVersionIds.has(run.characterStorylineVersionId),
  );
  const memoryScopes = snapshot.character.memoryScopes.filter((scope) =>
    characterRunIds.has(scope.characterRunId),
  );
  const relationships = snapshot.character.relationships.filter((relationship) =>
    versionIds.has(relationship.characterVersionId),
  );

  useEffect(() => {
    setVersionLabel('');
    setStorylineFields(emptyStorylineFields);
    setMemoryFields(emptyMemoryFields);
    setRelationshipMemoryFields(emptyRelationshipMemoryFields);
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
    await execute({
      operation: 'character-storyline-publish',
      input: {
        characterStorylineVersionId: createDomainIdentity('character-storyline-version'),
        characterVersionId: storylineFields.characterVersionId,
        label: storylineFields.label,
        premise: storylineFields.premise,
        desire: storylineFields.desire,
        conflict: storylineFields.conflict,
        growthArc: storylineFields.growthArc,
        stages: [
          {
            stageId: createDomainIdentity('character-storyline-stage'),
            title: storylineFields.stageTitle,
            description: storylineFields.stageDescription,
          },
        ],
        turningPoints: [],
        constraints: lines(storylineFields.constraints),
        acceptedEvidenceIds: [],
      },
    });
    setStorylineFields(emptyStorylineFields);
  };
  const createMemoryScope = async (characterRunId: string) => {
    await execute({
      operation: 'character-memory-scope-create',
      input: {
        characterMemoryScopeId: createDomainIdentity('character-memory-scope'),
        characterRunId,
      },
    });
  };
  const proposeMemory = async () => {
    const scope = memoryScopes.find(
      (item) => item.characterMemoryScopeId === memoryFields.characterMemoryScopeId,
    );
    if (!scope) throw new Error('CharacterMemoryScope selection is required.');
    await execute({
      operation: 'character-memory-candidate-propose',
      input: {
        characterMemoryScopeId: scope.characterMemoryScopeId,
        characterMemoryCandidateId: createDomainIdentity('character-memory-candidate'),
        content: memoryFields.content,
        sourceRef: memoryFields.sourceRef,
        observedAt: new Date().toISOString(),
        sensitivityTraits: lines(memoryFields.sensitivityTraits),
        retentionTraits: lines(memoryFields.retentionTraits),
        expectedMemoryRevision: scope.memoryRevision,
      },
    });
    setMemoryFields({ ...emptyMemoryFields, characterMemoryScopeId: scope.characterMemoryScopeId });
  };
  const proposeRelationshipMemory = async () => {
    if (
      !relationships.some((item) => item.relationshipId === relationshipMemoryFields.relationshipId)
    ) {
      throw new Error('UserCharacterRelationship selection is required.');
    }
    await execute({
      operation: 'relationship-memory-candidate-propose',
      input: {
        relationshipId: relationshipMemoryFields.relationshipId,
        candidateId: createDomainIdentity('relationship-memory-candidate'),
        content: relationshipMemoryFields.content,
        sourceRef: relationshipMemoryFields.sourceRef,
      },
    });
    setRelationshipMemoryFields({
      ...emptyRelationshipMemoryFields,
      relationshipId: relationshipMemoryFields.relationshipId,
    });
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
                    <FoundationField label={foundationLabel(locale, '欲望', 'Desire')}>
                      <textarea
                        required
                        rows={3}
                        value={storylineFields.desire}
                        onChange={(event) =>
                          setStorylineFields({ ...storylineFields, desire: event.target.value })
                        }
                      />
                    </FoundationField>
                    <FoundationField label={foundationLabel(locale, '冲突', 'Conflict')}>
                      <textarea
                        required
                        rows={3}
                        value={storylineFields.conflict}
                        onChange={(event) =>
                          setStorylineFields({ ...storylineFields, conflict: event.target.value })
                        }
                      />
                    </FoundationField>
                    <FoundationField label={foundationLabel(locale, '成长弧', 'Growth arc')}>
                      <textarea
                        required
                        rows={3}
                        value={storylineFields.growthArc}
                        onChange={(event) =>
                          setStorylineFields({ ...storylineFields, growthArc: event.target.value })
                        }
                      />
                    </FoundationField>
                    <FoundationField label={foundationLabel(locale, '初始阶段', 'Initial stage')}>
                      <input
                        required
                        value={storylineFields.stageTitle}
                        onChange={(event) =>
                          setStorylineFields({ ...storylineFields, stageTitle: event.target.value })
                        }
                      />
                    </FoundationField>
                    <FoundationField
                      label={foundationLabel(locale, '阶段说明', 'Stage description')}
                    >
                      <textarea
                        rows={3}
                        value={storylineFields.stageDescription}
                        onChange={(event) =>
                          setStorylineFields({
                            ...storylineFields,
                            stageDescription: event.target.value,
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
                    </div>
                  ))}
                </div>
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
                    <strong>{memoryScopes.length}</strong>
                  </div>
                </summary>
                <div className="character-foundation__review-list">
                  {characterRuns.map((run) => {
                    const scope = memoryScopes.find(
                      (item) => item.characterRunId === run.characterRunId,
                    );
                    return (
                      <div key={run.characterRunId}>
                        <code>{run.characterRunId}</code>
                        {scope ? (
                          <span>{`${scope.entries.filter((entry) => entry.status === 'active').length} active · ${scope.candidates.filter((candidate) => candidate.status === 'pending').length} pending`}</span>
                        ) : (
                          <button
                            disabled={pendingOperation !== undefined}
                            type="button"
                            onClick={() =>
                              void createMemoryScope(run.characterRunId).catch(() => undefined)
                            }
                          >
                            {foundationLabel(locale, '创建记忆域', 'Create memory scope')}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {memoryScopes.length > 0 ? (
                  <form
                    className="character-foundation__form-grid"
                    onSubmit={(event) => submitForm(event, proposeMemory)}
                  >
                    <FoundationField label={foundationLabel(locale, '记忆域', 'Memory scope')}>
                      <select
                        required
                        value={memoryFields.characterMemoryScopeId}
                        onChange={(event) =>
                          setMemoryFields({
                            ...memoryFields,
                            characterMemoryScopeId: event.target.value,
                          })
                        }
                      >
                        <option value="">
                          {foundationLabel(locale, '选择记忆域', 'Select a scope')}
                        </option>
                        {memoryScopes.map((scope) => (
                          <option
                            key={scope.characterMemoryScopeId}
                            value={scope.characterMemoryScopeId}
                          >
                            {scope.characterMemoryScopeId}
                          </option>
                        ))}
                      </select>
                    </FoundationField>
                    <FoundationField label={foundationLabel(locale, '记忆内容', 'Memory content')}>
                      <textarea
                        required
                        rows={3}
                        value={memoryFields.content}
                        onChange={(event) =>
                          setMemoryFields({ ...memoryFields, content: event.target.value })
                        }
                      />
                    </FoundationField>
                    <FoundationField
                      label={foundationLabel(locale, '来源引用', 'Source reference')}
                    >
                      <input
                        required
                        value={memoryFields.sourceRef}
                        onChange={(event) =>
                          setMemoryFields({ ...memoryFields, sourceRef: event.target.value })
                        }
                      />
                    </FoundationField>
                    <FoundationField
                      label={foundationLabel(locale, '敏感标签', 'Sensitivity traits')}
                    >
                      <textarea
                        rows={2}
                        value={memoryFields.sensitivityTraits}
                        onChange={(event) =>
                          setMemoryFields({
                            ...memoryFields,
                            sensitivityTraits: event.target.value,
                          })
                        }
                      />
                    </FoundationField>
                    <FoundationField
                      label={foundationLabel(locale, '保留标签', 'Retention traits')}
                    >
                      <textarea
                        rows={2}
                        value={memoryFields.retentionTraits}
                        onChange={(event) =>
                          setMemoryFields({ ...memoryFields, retentionTraits: event.target.value })
                        }
                      />
                    </FoundationField>
                    <FoundationSubmit pending={pendingOperation !== undefined}>
                      {foundationLabel(locale, '提出记忆候选', 'Propose memory candidate')}
                    </FoundationSubmit>
                  </form>
                ) : null}
                <div className="character-foundation__review-list">
                  {memoryScopes.flatMap((scope) =>
                    scope.candidates.map((candidate) => (
                      <div key={candidate.characterMemoryCandidateId}>
                        <strong>{candidate.content}</strong>
                        <span>{candidate.status}</span>
                        {candidate.status === 'pending' ? (
                          <span className="character-foundation__review-actions">
                            <button
                              type="button"
                              onClick={() =>
                                void execute({
                                  operation: 'character-memory-candidate-accept',
                                  input: {
                                    characterMemoryScopeId: scope.characterMemoryScopeId,
                                    characterMemoryCandidateId:
                                      candidate.characterMemoryCandidateId,
                                    characterMemoryEntryId:
                                      createDomainIdentity('character-memory-entry'),
                                    expectedMemoryRevision: scope.memoryRevision,
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
                                  operation: 'character-memory-candidate-reject',
                                  input: {
                                    characterMemoryScopeId: scope.characterMemoryScopeId,
                                    characterMemoryCandidateId:
                                      candidate.characterMemoryCandidateId,
                                    expectedMemoryRevision: scope.memoryRevision,
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
                  )}
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
                {relationships.length > 0 ? (
                  <form
                    className="character-foundation__form-grid"
                    onSubmit={(event) => submitForm(event, proposeRelationshipMemory)}
                  >
                    <FoundationField label={foundationLabel(locale, '角色关系', 'Relationship')}>
                      <select
                        required
                        value={relationshipMemoryFields.relationshipId}
                        onChange={(event) =>
                          setRelationshipMemoryFields({
                            ...relationshipMemoryFields,
                            relationshipId: event.target.value,
                          })
                        }
                      >
                        <option value="">
                          {foundationLabel(locale, '选择关系', 'Select a relationship')}
                        </option>
                        {relationships.map((relationship) => (
                          <option
                            key={relationship.relationshipId}
                            value={relationship.relationshipId}
                          >
                            {relationship.relationshipId}
                          </option>
                        ))}
                      </select>
                    </FoundationField>
                    <FoundationField
                      label={foundationLabel(locale, '关系记忆内容', 'Relationship memory content')}
                    >
                      <textarea
                        required
                        rows={3}
                        value={relationshipMemoryFields.content}
                        onChange={(event) =>
                          setRelationshipMemoryFields({
                            ...relationshipMemoryFields,
                            content: event.target.value,
                          })
                        }
                      />
                    </FoundationField>
                    <FoundationField
                      label={foundationLabel(locale, '来源引用', 'Source reference')}
                    >
                      <input
                        required
                        value={relationshipMemoryFields.sourceRef}
                        onChange={(event) =>
                          setRelationshipMemoryFields({
                            ...relationshipMemoryFields,
                            sourceRef: event.target.value,
                          })
                        }
                      />
                    </FoundationField>
                    <FoundationSubmit pending={pendingOperation !== undefined}>
                      {foundationLabel(locale, '提出关系记忆', 'Propose relationship memory')}
                    </FoundationSubmit>
                  </form>
                ) : (
                  <p>
                    {foundationLabel(
                      locale,
                      '角色进入 Companion 对话后会创建可独立审阅的关系记录。',
                      'Companion dialogue creates relationship records that can be reviewed independently.',
                    )}
                  </p>
                )}
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
                        <span>{memory.sourceRef}</span>
                        <button
                          type="button"
                          onClick={() =>
                            void execute({
                              operation: 'relationship-memory-delete',
                              input: {
                                relationshipId: relationship.relationshipId,
                                memoryId: memory.memoryId,
                              },
                            }).catch(() => undefined)
                          }
                        >
                          {foundationLabel(locale, '删除', 'Delete')}
                        </button>
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
                    value={`${storylineVersions.length} / ${storylineRuns.length}`}
                  />
                  <StudioSummary
                    label={foundationLabel(locale, '角色主观记忆', 'Character memory')}
                    value={`${memoryScopes.length}`}
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
