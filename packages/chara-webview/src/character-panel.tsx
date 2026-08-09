import type {
  CharacterDefinition,
  CharacterFoundationCommand,
  CharacterFoundationSnapshot,
  CharacterProject,
  CharacterRepresentationRef,
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
  readonly canon: string;
  readonly knowledgeBoundary: string;
  readonly behaviorPolicy: string;
  readonly expressionPolicy: string;
}

const emptyFields: CharacterDraftFields = {
  displayName: '',
  summary: '',
  canon: '',
  knowledgeBoundary: '',
  behaviorPolicy: '',
  expressionPolicy: '',
};

export function CharacterPanel({
  creating,
  execute,
  locale,
  onCreated,
  pendingOperation,
  selectedProjectId,
  snapshot,
}: {
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

  useEffect(() => {
    setVersionLabel('');
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
        <div className="character-foundation__form-grid">
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
          <FoundationField
            hint={foundationLabel(locale, '每行一条已确认事实', 'One confirmed fact per line')}
            label={foundationLabel(locale, '角色设定', 'Canon')}
          >
            <textarea
              rows={5}
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
              rows={5}
              value={fields.knowledgeBoundary}
              onChange={(event) => setFields({ ...fields, knowledgeBoundary: event.target.value })}
            />
          </FoundationField>
          <FoundationField
            hint={foundationLabel(locale, '每行一条行为规则', 'One behavior rule per line')}
            label={foundationLabel(locale, '行为策略', 'Behavior policy')}
          >
            <textarea
              rows={5}
              value={fields.behaviorPolicy}
              onChange={(event) => setFields({ ...fields, behaviorPolicy: event.target.value })}
            />
          </FoundationField>
          <FoundationField
            hint={foundationLabel(locale, '每行一条表达规则', 'One expression rule per line')}
            label={foundationLabel(locale, '表达策略', 'Expression policy')}
          >
            <textarea
              rows={5}
              value={fields.expressionPolicy}
              onChange={(event) => setFields({ ...fields, expressionPolicy: event.target.value })}
            />
          </FoundationField>
        </div>
      </form>
      {!creating && selectedProject ? (
        <section className="character-foundation__publication">
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
      ) : null}
    </div>
  );
}

function projectFields(project: CharacterProject): CharacterDraftFields {
  return {
    displayName: project.displayName,
    summary: project.draft.summary,
    canon: project.draft.canon.join('\n'),
    knowledgeBoundary: project.draft.knowledgeBoundary.join('\n'),
    behaviorPolicy: project.draft.behaviorPolicy.join('\n'),
    expressionPolicy: project.draft.expressionPolicy.join('\n'),
  };
}

function definitionFromFields(
  fields: CharacterDraftFields,
  representationRefs: readonly CharacterRepresentationRef[],
): CharacterDefinition {
  return {
    summary: fields.summary,
    canon: lines(fields.canon),
    knowledgeBoundary: lines(fields.knowledgeBoundary),
    behaviorPolicy: lines(fields.behaviorPolicy),
    expressionPolicy: lines(fields.expressionPolicy),
    representationRefs,
  };
}
