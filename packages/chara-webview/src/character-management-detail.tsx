import type { CharacterFoundationSnapshot, GlobalCharacter } from '@neko/chara/contracts';
import { DownloadIcon, MessageIcon, UserIcon } from '@neko/ui';
import type { SupportedLocale } from '@neko/ui/i18n';
import { useState } from 'react';
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
  const current = versions.find(
    (version) => version.characterVersionId === character.currentCharacterVersionId,
  );
  const [selectedVersionId, setSelectedVersionId] = useState(character.currentCharacterVersionId);
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
            {current?.definition.summary ||
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
            onChange={(event) => setSelectedVersionId(event.currentTarget.value)}
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
