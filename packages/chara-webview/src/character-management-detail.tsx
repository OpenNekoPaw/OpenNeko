import type {
  CharacterFoundationSnapshot,
  CharacterLoreEntry,
  GlobalCharacter,
} from '@neko/chara/contracts';
import { DownloadIcon, MessageIcon, UserIcon } from '@neko/ui';
import type { SupportedLocale } from '@neko/ui/i18n';
import { useState, type ReactNode } from 'react';
import { foundationLabel } from './labels';

export interface CharacterManagementDetailActions {
  readonly onExport?: (globalCharacterId: string) => void;
  readonly onImport?: () => void;
  readonly onStartInteraction?: (globalCharacterId: string, characterVersionId: string) => void;
}

export function CharacterManagementDetailSurface({
  actions,
  character,
  locale,
  snapshot,
}: {
  readonly actions: CharacterManagementDetailActions;
  readonly character: GlobalCharacter;
  readonly locale: SupportedLocale;
  readonly snapshot: CharacterFoundationSnapshot;
}): JSX.Element {
  const versions = character.characterVersionIds.flatMap((characterVersionId) => {
    const version = snapshot.character.versions.find(
      (candidate) => candidate.characterVersionId === characterVersionId,
    );
    return version ? [version] : [];
  });
  const [versionSelection, setVersionSelection] = useState({
    globalCharacterId: character.globalCharacterId,
    characterVersionId: character.currentCharacterVersionId,
  });
  const selectedVersionId =
    versionSelection.globalCharacterId === character.globalCharacterId
      ? versionSelection.characterVersionId
      : character.currentCharacterVersionId;
  const selected = versions.find((version) => version.characterVersionId === selectedVersionId);
  const diagnostics = snapshot.diagnostics.filter(
    (diagnostic) =>
      diagnostic.recordId === character.globalCharacterId ||
      character.characterVersionIds.includes(diagnostic.recordId),
  );

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
            {foundationLabel(locale, '全局目录', 'Global catalog')}
          </span>
          <h2>{character.displayName}</h2>
          <p>
            {selected?.definition.summary ||
              foundationLabel(locale, '暂无角色概述。', 'No summary.')}
          </p>
        </div>
      </header>

      <section className="character-management-detail__section" aria-labelledby="character-state">
        <div className="character-management-detail__section-heading">
          <div>
            <span>{foundationLabel(locale, '版本历史', 'Version history')}</span>
            <h3 id="character-state">
              {foundationLabel(locale, '可用版本', 'Available versions')}
            </h3>
          </div>
          <strong>{character.currentCharacterVersionId}</strong>
        </div>
        <div className="character-management-detail__metrics">
          <div>
            <span>{foundationLabel(locale, '版本数量', 'Versions')}</span>
            <strong>{versions.length}</strong>
          </div>
        </div>
      </section>

      {selected ? (
        <>
          <PreviewSection
            locale={locale}
            eyebrow={foundationLabel(locale, '身份与设定', 'Identity and setting')}
            title={foundationLabel(locale, '版本概览', 'Version overview')}
          >
            <dl className="character-management-detail__facts">
              <div>
                <dt>{foundationLabel(locale, '版本', 'Version')}</dt>
                <dd>{selected.label}</dd>
              </div>
              <div>
                <dt>{foundationLabel(locale, '版本标识', 'Version identity')}</dt>
                <dd>{selected.characterVersionId}</dd>
              </div>
              <div>
                <dt>{foundationLabel(locale, '发布时间', 'Published')}</dt>
                <dd>{selected.publishedAt}</dd>
              </div>
            </dl>
            <PreviewText
              label={foundationLabel(locale, '背景概述', 'Background overview')}
              locale={locale}
              value={selected.definition.backgroundStory.overview}
            />
            <LorePreview
              entries={[
                ...selected.definition.backgroundStory.origins,
                ...selected.definition.backgroundStory.personalHistory,
                ...selected.definition.backgroundStory.formativeEvents,
                ...selected.definition.backgroundStory.establishedRelationships,
              ]}
              label={foundationLabel(locale, '背景事实', 'Background facts')}
              locale={locale}
            />
            <PreviewText
              label={foundationLabel(locale, '世界观概述', 'Origin setting overview')}
              locale={locale}
              value={selected.definition.originSetting.overview}
            />
            <LorePreview
              entries={[
                ...selected.definition.originSetting.eras,
                ...selected.definition.originSetting.cultures,
                ...selected.definition.originSetting.socialEnvironment,
                ...selected.definition.originSetting.importantPlaces,
                ...selected.definition.originSetting.organizations,
                ...selected.definition.originSetting.believedRules,
              ]}
              label={foundationLabel(locale, '世界观事实', 'Origin setting facts')}
              locale={locale}
            />
          </PreviewSection>

          <PreviewSection
            locale={locale}
            eyebrow={foundationLabel(locale, '角色边界', 'Character boundaries')}
            title={foundationLabel(locale, 'Canon 与知识', 'Canon and knowledge')}
          >
            <PreviewList
              items={selected.definition.canon}
              label={foundationLabel(locale, 'Canon', 'Canon')}
              locale={locale}
            />
            <PreviewList
              items={selected.definition.knowledgeBoundary}
              label={foundationLabel(locale, '知识边界', 'Knowledge boundary')}
              locale={locale}
            />
          </PreviewSection>

          <PreviewSection
            locale={locale}
            eyebrow={foundationLabel(locale, '对话表现', 'Dialogue behavior')}
            title={foundationLabel(locale, '行为与表达策略', 'Behavior and expression policy')}
          >
            <PreviewList
              items={selected.definition.behaviorPolicy}
              label={foundationLabel(locale, '行为策略', 'Behavior policy')}
              locale={locale}
            />
            <PreviewList
              items={selected.definition.expressionPolicy}
              label={foundationLabel(locale, '表达策略', 'Expression policy')}
              locale={locale}
            />
          </PreviewSection>

          <PreviewSection
            locale={locale}
            eyebrow={foundationLabel(locale, '表现能力', 'Presentation capability')}
            title={foundationLabel(locale, '表现模型与资源', 'Representation models and resources')}
          >
            {selected.definition.representationRefs.length > 0 ? (
              <ul className="character-management-detail__representation-list">
                {selected.definition.representationRefs.map((representation) => (
                  <li key={representation.representationId}>
                    <strong>{representation.kind.toLocaleUpperCase()}</strong>
                    <span>{representation.representationId}</span>
                    <code>{representation.resourceRef}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyValue locale={locale} />
            )}
            <dl className="character-management-detail__facts">
              <div>
                <dt>{foundationLabel(locale, '默认立绘', 'Default portrait')}</dt>
                <dd>
                  {selected.definition.representationDefaults?.portraitRepresentationId ??
                    foundationLabel(locale, '未配置', 'Not configured')}
                </dd>
              </div>
              <div>
                <dt>{foundationLabel(locale, '默认 Avatar', 'Default avatar')}</dt>
                <dd>
                  {selected.definition.representationDefaults?.avatarRepresentationId ??
                    foundationLabel(locale, '未配置', 'Not configured')}
                </dd>
              </div>
            </dl>
          </PreviewSection>

          <PreviewSection
            locale={locale}
            eyebrow={foundationLabel(locale, '语音', 'Voice')}
            title={foundationLabel(locale, 'TTS 默认配置', 'TTS defaults')}
          >
            {selected.definition.voiceDefaults ? (
              <dl className="character-management-detail__facts">
                <div>
                  <dt>{foundationLabel(locale, 'TTS 提供方', 'TTS provider')}</dt>
                  <dd>{selected.definition.voiceDefaults.providerRef}</dd>
                </div>
                <div>
                  <dt>{foundationLabel(locale, '语音资源', 'Voice representation')}</dt>
                  <dd>{selected.definition.voiceDefaults.voiceRepresentationId}</dd>
                </div>
                <div>
                  <dt>{foundationLabel(locale, '语速', 'Speed')}</dt>
                  <dd>{selected.definition.voiceDefaults.speed}</dd>
                </div>
                <div>
                  <dt>{foundationLabel(locale, '自动朗读', 'Auto read')}</dt>
                  <dd>
                    {selected.definition.voiceDefaults.autoRead
                      ? foundationLabel(locale, '开启', 'On')
                      : foundationLabel(locale, '关闭', 'Off')}
                  </dd>
                </div>
              </dl>
            ) : (
              <EmptyValue locale={locale} />
            )}
            <p className="character-management-detail__ownership-note">
              {foundationLabel(
                locale,
                '聊天使用的 LLM 提供方与模型由具体对话拥有；开始对话后在对话中查看和调整。',
                'The chat LLM provider and model belong to the exact conversation; inspect and change them after starting the conversation.',
              )}
            </p>
          </PreviewSection>
        </>
      ) : null}

      {diagnostics.length > 0 ? (
        <section className="character-management-detail__diagnostics">
          {diagnostics.map((diagnostic) => (
            <p key={`${diagnostic.recordKind}:${diagnostic.recordId}`}>{diagnostic.message}</p>
          ))}
        </section>
      ) : null}

      <footer className="character-management-detail__footer">
        <label className="character-management-detail__version-select">
          <span>{foundationLabel(locale, '对话版本', 'Conversation version')}</span>
          <select
            value={selectedVersionId}
            onChange={(event) =>
              setVersionSelection({
                globalCharacterId: character.globalCharacterId,
                characterVersionId: event.currentTarget.value,
              })
            }
          >
            {versions.map((version) => (
              <option key={version.characterVersionId} value={version.characterVersionId}>
                {version.label}
              </option>
            ))}
          </select>
        </label>
        <div className="character-management-detail__primary-actions">
          <button
            className="is-primary"
            disabled={!selected || !actions.onStartInteraction}
            type="button"
            onClick={() =>
              selected &&
              actions.onStartInteraction?.(selected.globalCharacterId, selected.characterVersionId)
            }
          >
            <MessageIcon size={16} />
            {foundationLabel(locale, '开始对话', 'Start conversation')}
          </button>
          <button
            disabled={!actions.onExport}
            type="button"
            onClick={() => actions.onExport?.(character.globalCharacterId)}
          >
            <DownloadIcon size={15} />
            {foundationLabel(locale, '导出角色包', 'Export package')}
          </button>
        </div>
      </footer>
    </article>
  );
}

function PreviewSection({
  children,
  eyebrow,
  locale: _locale,
  title,
}: {
  readonly children: ReactNode;
  readonly eyebrow: string;
  readonly locale: SupportedLocale;
  readonly title: string;
}): JSX.Element {
  return (
    <section className="character-management-detail__section character-management-detail__preview-section">
      <div className="character-management-detail__section-heading">
        <div>
          <span>{eyebrow}</span>
          <h3>{title}</h3>
        </div>
      </div>
      <div className="character-management-detail__preview-content">{children}</div>
    </section>
  );
}

function PreviewText({
  label,
  locale,
  value,
}: {
  readonly label: string;
  readonly locale: SupportedLocale;
  readonly value: string;
}): JSX.Element {
  return (
    <div className="character-management-detail__preview-group">
      <h4>{label}</h4>
      {value.trim().length > 0 ? <p>{value}</p> : <EmptyValue locale={locale} />}
    </div>
  );
}

function LorePreview({
  entries,
  label,
  locale,
}: {
  readonly entries: readonly CharacterLoreEntry[];
  readonly label: string;
  readonly locale: SupportedLocale;
}): JSX.Element {
  return (
    <PreviewList items={entries.map((entry) => entry.statement)} label={label} locale={locale} />
  );
}

function PreviewList({
  items,
  label,
  locale,
}: {
  readonly items: readonly string[];
  readonly label: string;
  readonly locale: SupportedLocale;
}): JSX.Element {
  return (
    <div className="character-management-detail__preview-group">
      <h4>{label}</h4>
      {items.length > 0 ? (
        <ul>
          {items.map((item, index) => (
            <li key={`${String(index)}:${item}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <EmptyValue locale={locale} />
      )}
    </div>
  );
}

function EmptyValue({ locale }: { readonly locale: SupportedLocale }): JSX.Element {
  return (
    <p className="character-management-detail__empty-copy">
      {foundationLabel(locale, '未配置', 'Not configured')}
    </p>
  );
}
