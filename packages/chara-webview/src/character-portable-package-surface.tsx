import type {
  CharacterPortableExportScope,
  CharacterPortablePackagePreview,
  CharacterRepresentationKind,
} from '@neko/chara/contracts';
import type { SupportedLocale } from '@neko/ui/i18n';
import { useMemo, useState, type ReactNode } from 'react';
import { foundationLabel } from './labels';

export type CharacterPortableExportRepresentation =
  CharacterPortableExportScope['representations'][number];

export type CharacterPortableExportScopePresentation = CharacterPortableExportScope;

export interface CharacterPortableExportSelection {
  readonly characterStorylineIds: readonly string[];
  readonly authoringTestSnapshotIds: readonly string[];
  readonly embeddedRepresentationIds: readonly string[];
}

export function CharacterPortableExportScopeSurface({
  disabled = false,
  locale,
  onCancel,
  onExport,
  scope,
}: {
  readonly disabled?: boolean;
  readonly locale: SupportedLocale;
  readonly onCancel: () => void;
  readonly onExport: (selection: CharacterPortableExportSelection) => void;
  readonly scope: CharacterPortableExportScopePresentation;
}): JSX.Element {
  const [storylineIds, setStorylineIds] = useState<readonly string[]>(
    scope.characterStorylines.map((storyline) => storyline.characterStorylineId),
  );
  const [authoringTestIds, setAuthoringTestIds] = useState<readonly string[]>([]);
  const [embeddedRepresentationIds, setEmbeddedRepresentationIds] = useState<readonly string[]>([]);
  const embeddedBytes = useMemo(
    () =>
      scope.representations
        .filter((representation) =>
          embeddedRepresentationIds.includes(representation.representationId),
        )
        .reduce((total, representation) => total + representation.ownedByteLength, 0),
    [embeddedRepresentationIds, scope.representations],
  );

  return (
    <section
      aria-label={foundationLabel(locale, '导出角色包', 'Export character package')}
      className="character-portable-surface"
      data-character-portable-export="true"
    >
      <PortableHeading
        description={foundationLabel(
          locale,
          '创建一次性的 .neko-character 快照；不会发布、共享或同步角色。',
          'Create a one-time .neko-character snapshot. This does not publish, share, or synchronize the character.',
        )}
        eyebrow={foundationLabel(locale, '便携快照', 'Portable snapshot')}
        title={scope.displayName}
      />
      <PortableFacts
        facts={[
          [
            foundationLabel(locale, '可用版本', 'Usable versions'),
            scope.characterVersionIds.length,
          ],
          [
            foundationLabel(locale, '分支头', 'Branch heads'),
            scope.branchHeadCharacterVersionIds.length,
          ],
          [
            foundationLabel(locale, '未连接版本', 'Unlinked versions'),
            scope.unlinkedCharacterVersionIds.length,
          ],
          [foundationLabel(locale, '嵌入大小', 'Embedded size'), formatBytes(embeddedBytes)],
        ]}
      />

      <PortableSection
        title={foundationLabel(locale, '故事线范围', 'Storyline scope')}
        description={foundationLabel(
          locale,
          '角色版本和分支始终完整保留；可选择是否包含每条故事线。',
          'Character versions and branches are always preserved; choose which storylines to include.',
        )}
      >
        {scope.characterStorylines.length === 0 ? (
          <p>{foundationLabel(locale, '没有可包含的故事线。', 'No storylines are available.')}</p>
        ) : (
          <PortableChecklist
            items={scope.characterStorylines.map((storyline) => ({
              id: storyline.characterStorylineId,
              label: storyline.displayName,
              meta: storyline.characterStorylineId,
              checked: storylineIds.includes(storyline.characterStorylineId),
              disabled,
            }))}
            onChange={(identity, checked) =>
              setStorylineIds(updateSelection(storylineIds, identity, checked))
            }
          />
        )}
      </PortableSection>

      <PortableSection
        title={foundationLabel(locale, '素材策略', 'Asset policy')}
        description={foundationLabel(
          locale,
          '只有已建立精确本地绑定的素材可以嵌入；其余素材保持为外部依赖。',
          'Only assets with exact localized bindings can be embedded; all others remain external dependencies.',
        )}
      >
        {scope.representations.length === 0 ? (
          <p>
            {foundationLabel(locale, '角色没有表示素材。', 'The character has no representations.')}
          </p>
        ) : (
          <PortableChecklist
            items={scope.representations.map((representation) => ({
              id: representation.representationId,
              label: `${representationKindLabel(locale, representation.kind)} · ${representation.representationId}`,
              meta: representation.canEmbed
                ? foundationLabel(
                    locale,
                    `${representation.ownedFileCount} 个文件 · ${formatBytes(representation.ownedByteLength)}`,
                    `${representation.ownedFileCount} files · ${formatBytes(representation.ownedByteLength)}`,
                  )
                : foundationLabel(locale, '外部依赖', 'External dependency'),
              checked: embeddedRepresentationIds.includes(representation.representationId),
              disabled: disabled || !representation.canEmbed,
            }))}
            onChange={(identity, checked) =>
              setEmbeddedRepresentationIds(
                updateSelection(embeddedRepresentationIds, identity, checked),
              )
            }
          />
        )}
      </PortableSection>

      <PortableSection
        title={foundationLabel(locale, '创作测试', 'Authoring tests')}
        description={foundationLabel(
          locale,
          '测试快照默认不包含；按需显式加入。',
          'Authoring test snapshots are excluded by default; include them explicitly when needed.',
        )}
      >
        {scope.authoringTestSnapshotIds.length === 0 ? (
          <p>{foundationLabel(locale, '没有创作测试快照。', 'No authoring test snapshots.')}</p>
        ) : (
          <PortableChecklist
            items={scope.authoringTestSnapshotIds.map((identity) => ({
              id: identity,
              label: identity,
              checked: authoringTestIds.includes(identity),
              disabled,
            }))}
            onChange={(identity, checked) =>
              setAuthoringTestIds(updateSelection(authoringTestIds, identity, checked))
            }
          />
        )}
      </PortableSection>

      <PortableActions
        disabled={disabled}
        locale={locale}
        primaryLabel={foundationLabel(
          locale,
          '选择保存位置并导出',
          'Choose destination and export',
        )}
        onCancel={onCancel}
        onPrimary={() =>
          onExport({
            characterStorylineIds: storylineIds,
            authoringTestSnapshotIds: authoringTestIds,
            embeddedRepresentationIds,
          })
        }
      />
    </section>
  );
}

export function CharacterPortableImportPreviewSurface({
  disabled = false,
  locale,
  onCancel,
  onCommit,
  preview,
}: {
  readonly disabled?: boolean;
  readonly locale: SupportedLocale;
  readonly onCancel: () => void;
  readonly onCommit: () => void;
  readonly preview: CharacterPortablePackagePreview;
}): JSX.Element {
  const embeddedRepresentationCount = new Set(
    preview.embeddedAssets.map((asset) => asset.representationId),
  ).size;
  const embeddedBytes = preview.embeddedAssets.reduce(
    (total, asset) => total + asset.byteLength,
    0,
  );
  return (
    <section
      aria-label={foundationLabel(locale, '导入角色包预览', 'Character package import preview')}
      className="character-portable-surface"
      data-character-portable-import-preview="true"
    >
      <PortableHeading
        description={foundationLabel(
          locale,
          '验证已完成。确认后会把记录与素材安装到所选目录；不会从压缩包原地运行。',
          'Validation is complete. Confirmation installs records and assets into the selected directory; the archive is never executed in place.',
        )}
        eyebrow={destinationLabel(locale, preview)}
        title={preview.displayName}
      />
      <PortableFacts
        facts={[
          [
            foundationLabel(locale, '可用版本', 'Usable versions'),
            preview.characterVersionIds.length,
          ],
          [
            foundationLabel(locale, '分支头', 'Branch heads'),
            preview.branchHeadCharacterVersionIds.length,
          ],
          [foundationLabel(locale, '故事线', 'Storylines'), preview.characterStorylineIds.length],
          [
            foundationLabel(locale, '嵌入素材', 'Embedded assets'),
            `${embeddedRepresentationCount} · ${formatBytes(embeddedBytes)}`,
          ],
        ]}
      />
      <PortableSection
        title={foundationLabel(locale, '依赖完整性', 'Dependency completeness')}
        description={
          preview.externalDependencies.length === 0
            ? foundationLabel(
                locale,
                '包内已包含所有声明的表示素材。',
                'All declared representation assets are embedded.',
              )
            : foundationLabel(
                locale,
                '以下表示仍依赖包外资源；导入不会伪造占位素材。',
                'These representations still depend on external resources; import will not fabricate placeholders.',
              )
        }
      >
        {preview.externalDependencies.length > 0 ? (
          <ul className="character-portable-surface__rows">
            {preview.externalDependencies.map((dependency) => (
              <li key={dependency.representationId}>
                <strong>{dependency.representationId}</strong>
                <span>{representationKindLabel(locale, dependency.kind)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </PortableSection>
      <PortableSection
        title={foundationLabel(locale, '身份冲突', 'Identity conflicts')}
        description={
          preview.conflicts.length === 0
            ? foundationLabel(
                locale,
                '没有发现冲突，可以安装。',
                'No conflicts were found. The package can be installed.',
              )
            : foundationLabel(
                locale,
                '存在不同事实的精确身份；不会覆盖、合并或自动重命名。',
                'Exact identities with different facts exist; they will not be overwritten, merged, or renamed automatically.',
              )
        }
      >
        {preview.conflicts.length > 0 ? (
          <ul className="character-portable-surface__rows is-conflict" role="alert">
            {preview.conflicts.map((conflict) => (
              <li key={`${conflict.kind}:${conflict.recordId}`}>
                <strong>{conflict.kind}</strong>
                <code>{conflict.recordId}</code>
              </li>
            ))}
          </ul>
        ) : null}
      </PortableSection>
      {preview.unlinkedCharacterVersionIds.length > 0 ? (
        <p className="character-portable-surface__notice">
          {foundationLabel(
            locale,
            `包含 ${preview.unlinkedCharacterVersionIds.length} 个未连接的旧版本；它们会原样保留。`,
            `Includes ${preview.unlinkedCharacterVersionIds.length} unlinked historical versions; they will be preserved as-is.`,
          )}
        </p>
      ) : null}
      <PortableActions
        disabled={disabled || !preview.canCommit}
        locale={locale}
        primaryLabel={foundationLabel(locale, '确认安装', 'Confirm install')}
        onCancel={onCancel}
        onPrimary={onCommit}
      />
    </section>
  );
}

function PortableHeading({
  description,
  eyebrow,
  title,
}: {
  readonly description: string;
  readonly eyebrow: string;
  readonly title: string;
}) {
  return (
    <header className="character-portable-surface__heading">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </header>
  );
}

function PortableFacts({
  facts,
}: {
  readonly facts: readonly (readonly [string, string | number])[];
}) {
  return (
    <dl className="character-portable-surface__facts">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PortableSection({
  children,
  description,
  title,
}: {
  readonly children: ReactNode;
  readonly description: string;
  readonly title: string;
}) {
  return (
    <section className="character-portable-surface__section">
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {children}
    </section>
  );
}

function PortableChecklist({
  items,
  onChange,
}: {
  readonly items: readonly {
    readonly id: string;
    readonly label: string;
    readonly meta?: string;
    readonly checked: boolean;
    readonly disabled: boolean;
  }[];
  readonly onChange: (identity: string, checked: boolean) => void;
}) {
  return (
    <ul className="character-portable-surface__checklist">
      {items.map((item) => (
        <li key={item.id}>
          <label>
            <input
              checked={item.checked}
              disabled={item.disabled}
              type="checkbox"
              onChange={(event) => onChange(item.id, event.currentTarget.checked)}
            />
            <span>
              <strong>{item.label}</strong>
              {item.meta ? <small>{item.meta}</small> : null}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function PortableActions({
  disabled,
  locale,
  onCancel,
  onPrimary,
  primaryLabel,
}: {
  readonly disabled: boolean;
  readonly locale: SupportedLocale;
  readonly onCancel: () => void;
  readonly onPrimary: () => void;
  readonly primaryLabel: string;
}) {
  return (
    <footer className="character-portable-surface__actions">
      <button disabled={disabled} type="button" onClick={onPrimary}>
        {primaryLabel}
      </button>
      <button type="button" onClick={onCancel}>
        {foundationLabel(locale, '取消', 'Cancel')}
      </button>
    </footer>
  );
}

function updateSelection(
  identities: readonly string[],
  identity: string,
  selected: boolean,
): readonly string[] {
  return selected
    ? identities.includes(identity)
      ? identities
      : [...identities, identity]
    : identities.filter((candidate) => candidate !== identity);
}

function destinationLabel(
  locale: SupportedLocale,
  preview: CharacterPortablePackagePreview,
): string {
  return preview.destination.kind === 'standalone-library'
    ? foundationLabel(locale, '独立角色库', 'Standalone library')
    : foundationLabel(locale, '项目内角色', 'Project-local character');
}

function representationKindLabel(
  locale: SupportedLocale,
  kind: CharacterRepresentationKind,
): string {
  const labels: Record<CharacterRepresentationKind, readonly [string, string]> = {
    portrait: ['立绘', 'Portrait'],
    live2d: ['Live2D', 'Live2D'],
    vrm: ['VRM', 'VRM'],
    mmd: ['MMD', 'MMD'],
    pngtuber: ['PNG Tuber', 'PNG Tuber'],
    voice: ['语音', 'Voice'],
  };
  const [zh, en] = labels[kind];
  return foundationLabel(locale, zh, en);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${String(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
