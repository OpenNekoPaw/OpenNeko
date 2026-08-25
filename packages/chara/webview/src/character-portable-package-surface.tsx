import type {
  CharacterPortableExportScope,
  CharacterPortablePackagePreview,
  CharacterRepresentationKind,
} from '@neko/chara-domain/contracts';
import type { SupportedLocale } from '@neko/ui/i18n';
import { useMemo, useState, type ReactNode } from 'react';
import { foundationLabel } from './labels';

export type CharacterPortableExportRepresentation =
  CharacterPortableExportScope['representations'][number];

export type CharacterPortableExportScopePresentation = CharacterPortableExportScope;

export interface CharacterPortableExportSelection {
  readonly characterVersionId: string;
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
  const [characterVersionId, setCharacterVersionId] = useState(scope.characterVersionIds[0] ?? '');
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
          '导出一个精确的全局角色版本及必要素材；不会携带工作区历史。',
          'Export one exact global Character version and required assets; workspace history is excluded.',
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
          [foundationLabel(locale, '嵌入大小', 'Embedded size'), formatBytes(embeddedBytes)],
        ]}
      />

      <PortableSection
        title={foundationLabel(locale, '角色版本', 'Character version')}
        description={foundationLabel(
          locale,
          '每个 ZIP 只包含一个精确的不可变角色版本。',
          'Each ZIP contains one exact immutable Character version.',
        )}
      >
        <select
          aria-label={foundationLabel(locale, '角色版本', 'Character version')}
          disabled={disabled}
          value={characterVersionId}
          onChange={(event) => setCharacterVersionId(event.currentTarget.value)}
        >
          {scope.characterVersionIds.map((identity) => (
            <option key={identity} value={identity}>
              {identity}
            </option>
          ))}
        </select>
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

      <PortableActions
        disabled={disabled}
        locale={locale}
        primaryLabel={foundationLabel(
          locale,
          '选择保存位置并导出',
          'Choose destination and export',
        )}
        onCancel={onCancel}
        onPrimary={() => onExport({ characterVersionId, embeddedRepresentationIds })}
      />
    </section>
  );
}

export function CharacterPortableImportSurface({
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
      data-character-portable-import="true"
    >
      <PortableHeading
        description={foundationLabel(
          locale,
          '验证已完成。确认后会把这个版本导入全局角色目录；不会从压缩包原地运行。',
          'Validation is complete. Confirmation imports this version into the global Character catalog; the archive is never executed in place.',
        )}
        eyebrow={foundationLabel(locale, '全局角色', 'Global Character')}
        title={preview.displayName}
      />
      <PortableFacts
        facts={[
          [
            foundationLabel(locale, '可用版本', 'Usable versions'),
            preview.characterVersionIds.length,
          ],
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
                '没有发现冲突，可以导入。',
                'No conflicts were found. The package can be imported.',
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
      <PortableActions
        disabled={disabled || !preview.canCommit}
        locale={locale}
        primaryLabel={foundationLabel(locale, '导入到全局目录', 'Import to global catalog')}
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
