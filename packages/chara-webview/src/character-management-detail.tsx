import type {
  CharacterFoundationSnapshot,
  CharacterManagementDetailProjection,
  CharacterProject,
} from '@neko/chara/contracts';
import {
  BotIcon,
  ChevronDownIcon,
  DownloadIcon,
  EditIcon,
  MessageIcon,
  MoreHorizontalIcon,
  PackageIcon,
  PlusIcon,
  UploadIcon,
  UserIcon,
} from '@neko/ui';
import type { IconProps } from '@neko/ui';
import type { SupportedLocale } from '@neko/ui/i18n';
import { useState, type ComponentType } from 'react';
import { foundationLabel } from './labels';

export interface CharacterManagementDetailActions {
  readonly onExport?: (characterProjectId: string) => void;
  readonly onImport?: () => void;
  readonly onManualCreate?: () => void;
  readonly onOpenAuthoring?: (characterProjectId: string) => void;
  readonly onQuickGenerate?: () => void;
  readonly onStartInteraction?: (characterProjectId: string, characterVersionId: string) => void;
}

export function CharacterManagementDetailSurface({
  actions,
  locale,
  project,
  snapshot,
}: {
  readonly actions: CharacterManagementDetailActions;
  readonly locale: SupportedLocale;
  readonly project: CharacterProject;
  readonly snapshot: CharacterFoundationSnapshot;
}): JSX.Element {
  const versions = snapshot.character.versions.filter(
    (version) => version.characterProjectId === project.characterProjectId,
  );
  const versionIds = new Set(versions.map((version) => version.characterVersionId));
  const detail = snapshot.managementDetails?.find(
    (candidate) => candidate.characterProjectId === project.characterProjectId,
  );
  const diagnostics = snapshot.diagnostics.filter(
    (diagnostic) =>
      diagnostic.recordId === project.characterProjectId || versionIds.has(diagnostic.recordId),
  );
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const interactionVersionId =
    versions.length === 1
      ? versions[0]?.characterVersionId
      : versions.some((version) => version.characterVersionId === selectedVersionId)
        ? selectedVersionId
        : undefined;
  const onStartInteraction = actions.onStartInteraction;
  const startInteraction =
    interactionVersionId && onStartInteraction
      ? () => onStartInteraction(project.characterProjectId, interactionVersionId)
      : undefined;

  return (
    <article
      className="character-management-detail"
      data-character-management-detail-surface="true"
    >
      <header className="character-management-detail__identity">
        <span className="character-management-detail__avatar" aria-hidden="true">
          <UserIcon size={24} />
        </span>
        <div>
          <span className="character-management-detail__placement">
            {placementLabel(locale, detail)}
          </span>
          <h2>{project.displayName}</h2>
          <p>
            {project.draft.summary || foundationLabel(locale, '暂无角色概述。', 'No summary yet.')}
          </p>
        </div>
      </header>

      <section className="character-management-detail__section" aria-labelledby="character-state">
        <div className="character-management-detail__section-heading">
          <div>
            <span>{foundationLabel(locale, '生命周期', 'Lifecycle')}</span>
            <h3 id="character-state">
              {foundationLabel(locale, '草稿与版本', 'Draft and versions')}
            </h3>
          </div>
          <strong className={`character-management-detail__status is-${project.reviewStatus}`}>
            {reviewLabel(locale, project.reviewStatus)}
          </strong>
        </div>
        <div className="character-management-detail__metrics">
          <ManagementMetric
            label={foundationLabel(locale, '草稿状态', 'Draft state')}
            value={reviewLabel(locale, project.reviewStatus)}
          />
          <ManagementMetric
            label={foundationLabel(locale, '可用版本', 'Usable versions')}
            value={String(versions.length)}
          />
        </div>
        <p className="character-management-detail__availability">
          {versions.length === 0
            ? foundationLabel(
                locale,
                '创建可用版本后即可开始对话。',
                'Create a usable version before starting a conversation.',
              )
            : versions.length === 1
              ? foundationLabel(
                  locale,
                  '这个角色已经可以开始对话。',
                  'This character is ready for a conversation.',
                )
              : foundationLabel(
                  locale,
                  '开始对话前请选择一个可用版本。',
                  'Choose a usable version before starting a conversation.',
                )}
        </p>
      </section>

      {diagnostics.length > 0 ? (
        <section
          className="character-management-detail__diagnostics"
          aria-label={foundationLabel(locale, '角色诊断', 'Character diagnostics')}
        >
          {diagnostics.map((diagnostic) => (
            <p key={`${diagnostic.owner}:${diagnostic.recordKind}:${diagnostic.recordId}`}>
              {diagnostic.message}
            </p>
          ))}
        </section>
      ) : null}

      <footer className="character-management-detail__footer">
        {versions.length > 1 ? (
          <label className="character-management-detail__version-select">
            <span>{foundationLabel(locale, '对话版本', 'Conversation version')}</span>
            <select
              value={selectedVersionId}
              onChange={(event) => setSelectedVersionId(event.currentTarget.value)}
            >
              <option value="">
                {foundationLabel(locale, '选择可用版本', 'Choose a usable version')}
              </option>
              {versions.map((version) => (
                <option key={version.characterVersionId} value={version.characterVersionId}>
                  {version.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="character-management-detail__primary-actions">
          <button
            className="is-primary"
            disabled={!startInteraction}
            title={
              startInteraction
                ? undefined
                : versions.length === 0
                  ? foundationLabel(
                      locale,
                      '请先在创作工作区创建可用版本。',
                      'Create a usable version in authoring first.',
                    )
                  : foundationLabel(locale, '请选择一个可用版本。', 'Choose a usable version.')
            }
            type="button"
            onClick={startInteraction}
          >
            <MessageIcon size={16} />
            {foundationLabel(locale, '开始对话', 'Start conversation')}
          </button>
          <button
            disabled={!actions.onOpenAuthoring}
            type="button"
            onClick={() => actions.onOpenAuthoring?.(project.characterProjectId)}
          >
            <EditIcon size={16} />
            {foundationLabel(locale, '编辑角色', 'Edit character')}
          </button>
          <details className="character-management-detail__more-actions">
            <summary aria-label={foundationLabel(locale, '更多操作', 'More actions')}>
              <MoreHorizontalIcon size={17} />
              <ChevronDownIcon size={12} />
            </summary>
            <div>
              <button
                disabled={!actions.onExport}
                type="button"
                onClick={() => actions.onExport?.(project.characterProjectId)}
              >
                <DownloadIcon size={15} />
                {foundationLabel(locale, '导出角色包', 'Export package')}
              </button>
            </div>
          </details>
        </div>
      </footer>
    </article>
  );
}

export function CharacterCreationEntrySurface({
  actions,
  locale,
}: {
  readonly actions: CharacterManagementDetailActions;
  readonly locale: SupportedLocale;
}): JSX.Element {
  return (
    <article className="character-management-detail" data-character-creation-entry="true">
      <header className="character-management-detail__identity">
        <span className="character-management-detail__avatar" aria-hidden="true">
          <PackageIcon size={24} />
        </span>
        <div>
          <span className="character-management-detail__placement">
            {foundationLabel(locale, '创建入口', 'Creation entry')}
          </span>
          <h2>{foundationLabel(locale, '创建角色草稿', 'Create character draft')}</h2>
          <p>
            {foundationLabel(
              locale,
              '选择生成、手动创作或导入；管理页本身不会挂载角色编辑器。',
              'Choose generation, manual authoring, or import. Management never mounts the character editor.',
            )}
          </p>
        </div>
      </header>
      <section className="character-management-detail__section">
        <div className="character-management-detail__actions is-entry">
          <ManagementAction
            description={foundationLabel(
              locale,
              '在标准 Agent 输入框中描述角色。',
              'Describe the character in the standard Agent composer.',
            )}
            icon={BotIcon}
            label={foundationLabel(locale, '快速生成', 'Quick generate')}
            onClick={actions.onQuickGenerate}
          />
          <ManagementAction
            description={foundationLabel(
              locale,
              '创建空白草稿并进入创作工作区。',
              'Create a blank draft and enter authoring.',
            )}
            icon={PlusIcon}
            label={foundationLabel(locale, '手动创建', 'Manual create')}
            onClick={actions.onManualCreate}
          />
          <ManagementAction
            description={foundationLabel(
              locale,
              '验证并安装 .neko-character 角色包。',
              'Validate and install a .neko-character package.',
            )}
            icon={UploadIcon}
            label={foundationLabel(locale, '导入角色', 'Import character')}
            onClick={actions.onImport}
          />
        </div>
      </section>
    </article>
  );
}

function ManagementMetric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function placementLabel(
  locale: SupportedLocale,
  detail?: CharacterManagementDetailProjection,
): string {
  if (detail?.placement.kind === 'content-project') {
    return foundationLabel(locale, '项目角色', 'Project character');
  }
  return detail
    ? foundationLabel(locale, '独立角色库', 'Standalone library')
    : foundationLabel(locale, '角色归属不可用', 'Placement unavailable');
}

function ManagementAction({
  description,
  icon: Icon,
  label,
  onClick,
}: {
  readonly description: string;
  readonly icon: ComponentType<IconProps>;
  readonly label: string;
  readonly onClick?: () => void;
}) {
  return (
    <button
      disabled={!onClick}
      title={!onClick ? description : undefined}
      type="button"
      onClick={onClick}
    >
      <span aria-hidden="true">
        <Icon size={18} />
      </span>
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
    </button>
  );
}

function reviewLabel(locale: SupportedLocale, status: CharacterProject['reviewStatus']): string {
  switch (status) {
    case 'draft':
      return foundationLabel(locale, '草稿', 'Draft');
    case 'ready':
      return foundationLabel(locale, '可以定稿', 'Ready to finalize');
    case 'blocked':
      return foundationLabel(locale, '已阻塞', 'Blocked');
  }
}
