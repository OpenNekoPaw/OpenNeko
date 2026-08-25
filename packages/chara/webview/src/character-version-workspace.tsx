import {
  compareCharacterVersions,
  projectCharacterVersionGraph,
  type CharacterVersionComparisonValue,
} from '@neko/chara-domain/application';
import type {
  CharacterAuthoringCommand,
  CharacterAuthoringSnapshot,
  CharacterProject,
  CharacterVersion,
  CharacterVersionReferenceInventory,
} from '@neko/chara-domain/contracts';
import type { SupportedLocale } from '@neko/ui/i18n';
import { useEffect, useMemo, useState } from 'react';
import { FoundationDiagnostic } from './foundation-ui';
import { foundationLabel } from './labels';

type ExecuteCommand = (command: CharacterAuthoringCommand) => Promise<CharacterAuthoringSnapshot>;

export function CharacterVersionWorkspace({
  execute,
  hasUnsavedDraft,
  locale,
  pendingOperation,
  project,
  snapshot,
  versions,
}: {
  readonly execute: ExecuteCommand;
  readonly hasUnsavedDraft: boolean;
  readonly locale: SupportedLocale;
  readonly pendingOperation?: string;
  readonly project: CharacterProject;
  readonly snapshot: CharacterAuthoringSnapshot;
  readonly versions: readonly CharacterVersion[];
}): JSX.Element {
  const [view, setView] = useState<'graph' | 'list'>('graph');
  const [selectedVersionId, setSelectedVersionId] = useState(versions[0]?.characterVersionId ?? '');
  const [comparisonVersionId, setComparisonVersionId] = useState('');
  const [confirmAction, setConfirmAction] = useState<'continue' | 'delete'>();
  const graph = useMemo(
    () =>
      projectCharacterVersionGraph({
        project,
        versions,
        ...(snapshot.lineage === null ? {} : { lineage: snapshot.lineage }),
      }),
    [project, snapshot.lineage, versions],
  );
  const selectedVersion = versions.find(
    (version) => version.characterVersionId === selectedVersionId,
  );
  const selectedNode = graph.nodes.find((node) => node.characterVersionId === selectedVersionId);
  const selectedInventory = snapshot.referenceInventories.find(
    (inventory) => inventory.characterVersionId === selectedVersionId,
  );
  const comparisonVersion = versions.find(
    (version) => version.characterVersionId === comparisonVersionId,
  );
  const comparison =
    selectedVersion !== undefined && comparisonVersion !== undefined
      ? compareCharacterVersions(selectedVersion, comparisonVersion)
      : undefined;
  const lineageDiagnostic = snapshot.diagnostics.find(
    (diagnostic) => diagnostic.recordKind === 'character-version-lineage',
  );
  const deletionDisabledReason = versionDeletionDisabledReason(
    selectedVersion,
    selectedInventory,
    locale,
  );
  const displayedNodes = useMemo(
    () =>
      view === 'list'
        ? graph.nodes
        : [...graph.nodes].sort(
            (left, right) =>
              Number(left.state === 'unlinked') - Number(right.state === 'unlinked') ||
              left.ancestorCharacterVersionIds.length - right.ancestorCharacterVersionIds.length ||
              left.characterVersionId.localeCompare(right.characterVersionId),
          ),
    [graph.nodes, view],
  );

  useEffect(() => {
    if (versions.some((version) => version.characterVersionId === selectedVersionId)) return;
    setSelectedVersionId(versions[0]?.characterVersionId ?? '');
    setComparisonVersionId('');
    setConfirmAction(undefined);
  }, [selectedVersionId, versions]);

  const selectVersion = (characterVersionId: string) => {
    setSelectedVersionId(characterVersionId);
    setComparisonVersionId((current) => (current === characterVersionId ? '' : current));
    setConfirmAction(undefined);
  };
  const continueFromVersion = async () => {
    if (selectedVersion === undefined) throw new Error('CharacterVersion selection is required.');
    await execute({
      operation: 'character-version-continue',
      input: {
        characterProjectId: project.characterProjectId,
        characterVersionId: selectedVersion.characterVersionId,
        replaceWorkingDraft: true,
      },
    });
    setConfirmAction(undefined);
  };
  const deleteVersion = async () => {
    if (selectedVersion === undefined) throw new Error('CharacterVersion selection is required.');
    await execute({
      operation: 'character-version-delete',
      input: {
        characterProjectId: project.characterProjectId,
        characterVersionId: selectedVersion.characterVersionId,
      },
    });
    setConfirmAction(undefined);
  };

  return (
    <section
      aria-label={foundationLabel(locale, '角色版本工作区', 'Character version workspace')}
      className="character-version-workspace"
      data-character-version-workspace="true"
    >
      <header className="character-version-workspace__header">
        <div>
          <strong>{foundationLabel(locale, '可用版本', 'Usable versions')}</strong>
          <span>
            {foundationLabel(
              locale,
              '查看分支关系、比较不可变内容并检查精确引用。',
              'Inspect branches, compare immutable content, and review exact references.',
            )}
          </span>
        </div>
        <div className="character-version-workspace__view-switcher">
          <button aria-pressed={view === 'graph'} type="button" onClick={() => setView('graph')}>
            {foundationLabel(locale, '关系图', 'Graph')}
          </button>
          <button aria-pressed={view === 'list'} type="button" onClick={() => setView('list')}>
            {foundationLabel(locale, '列表', 'List')}
          </button>
        </div>
      </header>

      {lineageDiagnostic ? (
        <FoundationDiagnostic role="alert">{lineageDiagnostic.message}</FoundationDiagnostic>
      ) : null}
      {graph.diagnostics.map((diagnostic) => (
        <FoundationDiagnostic key={`${diagnostic.code}:${diagnostic.characterVersionId}`}>
          {diagnostic.message}
        </FoundationDiagnostic>
      ))}

      {versions.length === 0 ? (
        <p className="character-version-workspace__empty">
          {foundationLabel(
            locale,
            '尚无可用版本。当前草稿定稿后会出现在这里。',
            'No usable versions yet. Finalized drafts will appear here.',
          )}
        </p>
      ) : (
        <div className="character-version-workspace__layout">
          <div
            aria-label={foundationLabel(locale, '版本选择', 'Version selection')}
            className={`character-version-workspace__nodes is-${view}`}
            role="list"
          >
            {displayedNodes.map((node) => (
              <div key={node.characterVersionId} role="listitem">
                <button
                  aria-pressed={node.characterVersionId === selectedVersionId}
                  className="character-version-workspace__node"
                  style={
                    view === 'graph'
                      ? {
                          paddingInlineStart: `${String(
                            11 + Math.min(node.ancestorCharacterVersionIds.length, 4) * 16,
                          )}px`,
                        }
                      : undefined
                  }
                  type="button"
                  onClick={() => selectVersion(node.characterVersionId)}
                >
                  <span className="character-version-workspace__node-path">
                    {view === 'graph' && node.parentCharacterVersionId !== undefined ? '↳' : '●'}
                  </span>
                  <span>
                    <strong>{node.label}</strong>
                    <code>{node.characterVersionId}</code>
                  </span>
                  <small>
                    {nodeStateLabel(locale, node.state)}
                    {node.isHead ? ` · ${foundationLabel(locale, '分支头', 'Head')}` : ''}
                    {node.isDraftBasis
                      ? ` · ${foundationLabel(locale, '草稿基线', 'Draft basis')}`
                      : ''}
                  </small>
                </button>
              </div>
            ))}
          </div>

          {selectedVersion && selectedNode && selectedInventory ? (
            <article className="character-version-workspace__detail">
              <header>
                <div>
                  <span>{foundationLabel(locale, '所选版本', 'Selected version')}</span>
                  <h5>{selectedVersion.label}</h5>
                  <code>{selectedVersion.characterVersionId}</code>
                </div>
                <span className="character-version-workspace__state">
                  {nodeStateLabel(locale, selectedNode.state)}
                </span>
              </header>
              <dl className="character-version-workspace__facts">
                <div>
                  <dt>{foundationLabel(locale, '创建时间', 'Created')}</dt>
                  <dd>{selectedVersion.publishedAt}</dd>
                </div>
                <div>
                  <dt>{foundationLabel(locale, '父版本', 'Parent')}</dt>
                  <dd>
                    {selectedNode.parentCharacterVersionId ??
                      foundationLabel(locale, '未声明', 'Not declared')}
                  </dd>
                </div>
                <div>
                  <dt>{foundationLabel(locale, '后续版本', 'Derived versions')}</dt>
                  <dd>{selectedNode.childCharacterVersionIds.length}</dd>
                </div>
                <div>
                  <dt>{foundationLabel(locale, '精确引用', 'Exact references')}</dt>
                  <dd>
                    {selectedInventory.coverage === 'complete'
                      ? selectedInventory.references.length
                      : foundationLabel(locale, '不完整', 'Incomplete')}
                  </dd>
                </div>
              </dl>

              <div className="character-version-workspace__actions">
                <button
                  disabled={pendingOperation !== undefined}
                  type="button"
                  onClick={() => setConfirmAction('continue')}
                >
                  {foundationLabel(locale, '从此版本继续', 'Continue from this version')}
                </button>
                <button
                  disabled={pendingOperation !== undefined || deletionDisabledReason !== undefined}
                  title={deletionDisabledReason}
                  type="button"
                  onClick={() => setConfirmAction('delete')}
                >
                  {foundationLabel(locale, '删除版本', 'Delete version')}
                </button>
              </div>
              {deletionDisabledReason ? (
                <p className="character-version-workspace__action-note">{deletionDisabledReason}</p>
              ) : null}
              {confirmAction === 'continue' ? (
                <div className="character-version-workspace__confirmation" role="alert">
                  <strong>
                    {hasUnsavedDraft
                      ? foundationLabel(
                          locale,
                          '当前未保存草稿将被替换。',
                          'The current unsaved draft will be replaced.',
                        )
                      : foundationLabel(
                          locale,
                          '当前工作草稿将切换到此版本。',
                          'The working draft will switch to this version.',
                        )}
                  </strong>
                  <span>
                    {foundationLabel(
                      locale,
                      '不可变版本不会改变；此操作只覆盖一个工作草稿并设置精确基线。',
                      'Immutable versions remain unchanged; this replaces the one working draft and sets its exact basis.',
                    )}
                  </span>
                  <div>
                    <button
                      disabled={pendingOperation !== undefined}
                      type="button"
                      onClick={() => void continueFromVersion().catch(() => undefined)}
                    >
                      {hasUnsavedDraft
                        ? foundationLabel(
                            locale,
                            '放弃当前草稿并继续',
                            'Discard draft and continue',
                          )
                        : foundationLabel(locale, '确认继续', 'Confirm continue')}
                    </button>
                    <button type="button" onClick={() => setConfirmAction(undefined)}>
                      {foundationLabel(locale, '取消', 'Cancel')}
                    </button>
                  </div>
                </div>
              ) : confirmAction === 'delete' && deletionDisabledReason === undefined ? (
                <div
                  className="character-version-workspace__confirmation is-destructive"
                  role="alert"
                >
                  <strong>
                    {foundationLabel(
                      locale,
                      '确认删除这个未引用版本？',
                      'Delete this unreferenced version?',
                    )}
                  </strong>
                  <span>
                    {foundationLabel(
                      locale,
                      '只会删除此版本及其自身关系；不会删除或重绑其他版本。',
                      'Only this version and its own relation are removed; no other version is deleted or rebound.',
                    )}
                  </span>
                  <div>
                    <button
                      disabled={pendingOperation !== undefined}
                      type="button"
                      onClick={() => void deleteVersion().catch(() => undefined)}
                    >
                      {foundationLabel(locale, '确认删除', 'Confirm delete')}
                    </button>
                    <button type="button" onClick={() => setConfirmAction(undefined)}>
                      {foundationLabel(locale, '取消', 'Cancel')}
                    </button>
                  </div>
                </div>
              ) : null}

              <section className="character-version-workspace__references">
                <h6>{foundationLabel(locale, '引用检查', 'Reference inspection')}</h6>
                {selectedInventory.diagnostics.map((diagnostic) => (
                  <FoundationDiagnostic key={diagnostic.ownerKind}>
                    {`${diagnostic.ownerKind}: ${diagnostic.message}`}
                  </FoundationDiagnostic>
                ))}
                {selectedInventory.references.length === 0 ? (
                  <p>{foundationLabel(locale, '没有精确引用。', 'No exact references.')}</p>
                ) : (
                  <ul>
                    {selectedInventory.references.map((reference) => (
                      <li
                        key={`${reference.ownerKind}:${reference.referenceKind}:${reference.referenceId}`}
                      >
                        <strong>{reference.ownerKind}</strong>
                        <span>{referenceKindLabel(locale, reference.referenceKind)}</span>
                        <code>{reference.referenceId}</code>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="character-version-workspace__comparison">
                <h6>{foundationLabel(locale, '精确比较', 'Exact comparison')}</h6>
                <label>
                  <span>
                    {foundationLabel(locale, '与另一版本比较', 'Compare with another version')}
                  </span>
                  <select
                    value={comparisonVersionId}
                    onChange={(event) => setComparisonVersionId(event.currentTarget.value)}
                  >
                    <option value="">
                      {foundationLabel(locale, '选择版本', 'Select version')}
                    </option>
                    {versions
                      .filter((version) => version.characterVersionId !== selectedVersionId)
                      .map((version) => (
                        <option key={version.characterVersionId} value={version.characterVersionId}>
                          {version.label}
                        </option>
                      ))}
                  </select>
                </label>
                {comparison ? (
                  <div className="character-version-workspace__comparison-groups">
                    {comparison.groups.map((group) => (
                      <details key={group.group} open={group.changed}>
                        <summary>
                          <span>{comparisonGroupLabel(locale, group.group)}</span>
                          <strong>
                            {group.changed
                              ? foundationLabel(locale, '已变化', 'Changed')
                              : foundationLabel(locale, '相同', 'Same')}
                          </strong>
                        </summary>
                        <div>
                          <pre>{comparisonValue(group.before)}</pre>
                          <span aria-hidden="true">→</span>
                          <pre>{comparisonValue(group.after)}</pre>
                        </div>
                      </details>
                    ))}
                  </div>
                ) : null}
              </section>
            </article>
          ) : null}
        </div>
      )}
    </section>
  );
}

function versionDeletionDisabledReason(
  version: CharacterVersion | undefined,
  inventory: CharacterVersionReferenceInventory | undefined,
  locale: SupportedLocale,
): string | undefined {
  if (version === undefined || inventory === undefined) {
    return foundationLabel(
      locale,
      '版本引用状态不可用。',
      'Version reference state is unavailable.',
    );
  }
  if (inventory.coverage === 'incomplete') {
    return foundationLabel(
      locale,
      '引用检查不完整，已阻止删除。',
      'Reference inspection is incomplete, so deletion is blocked.',
    );
  }
  if (inventory.references.length > 0) {
    return foundationLabel(
      locale,
      `存在 ${inventory.references.length} 个精确引用，无法删除。`,
      `${inventory.references.length} exact reference(s) block deletion.`,
    );
  }
  return undefined;
}

function nodeStateLabel(
  locale: SupportedLocale,
  state: 'declared-root' | 'linked' | 'unlinked',
): string {
  switch (state) {
    case 'declared-root':
      return foundationLabel(locale, '根版本', 'Root');
    case 'linked':
      return foundationLabel(locale, '已关联', 'Linked');
    case 'unlinked':
      return foundationLabel(locale, '来源未声明', 'Source not declared');
  }
}

function comparisonGroupLabel(
  locale: SupportedLocale,
  group:
    | 'identity'
    | 'background-origin'
    | 'canon'
    | 'knowledge'
    | 'behavior'
    | 'expression'
    | 'representation'
    | 'voice'
    | 'accepted-evidence',
): string {
  const labels = {
    identity: ['身份', 'Identity'],
    'background-origin': ['背景与起源', 'Background and origin'],
    canon: ['角色设定', 'Canon'],
    knowledge: ['知识边界', 'Knowledge'],
    behavior: ['行为策略', 'Behavior'],
    expression: ['表达策略', 'Expression'],
    representation: ['形象资源', 'Representation'],
    voice: ['语音', 'Voice'],
    'accepted-evidence': ['采纳证据', 'Accepted evidence'],
  } as const;
  const label = labels[group];
  return foundationLabel(locale, label[0], label[1]);
}

function referenceKindLabel(
  locale: SupportedLocale,
  kind: CharacterVersionReferenceInventory['references'][number]['referenceKind'],
): string {
  const labels = {
    'working-draft-basis': ['工作草稿基线', 'Working draft basis'],
    'lineage-child': ['派生版本', 'Derived version'],
    'storyline-draft': ['故事线草稿', 'Storyline draft'],
    'storyline-version': ['故事线版本', 'Storyline version'],
    'character-run': ['角色运行', 'Character run'],
    'room-template-participant': ['聊天室模板成员', 'Room template participant'],
    'room-run-participant': ['聊天室运行成员', 'Room run participant'],
    'relationship-memory-candidate': ['关系记忆候选', 'Relationship memory candidate'],
    'relationship-memory': ['关系记忆', 'Relationship memory'],
    'companion-memory-candidate': ['陪伴记忆候选', 'Companion memory candidate'],
    'companion-memory': ['陪伴记忆', 'Companion memory'],
    conversation: ['对话', 'Conversation'],
    'project-dependency': ['项目依赖', 'Project dependency'],
  } as const;
  const label = labels[kind];
  return foundationLabel(locale, label[0], label[1]);
}

function comparisonValue(value: CharacterVersionComparisonValue): string {
  return JSON.stringify(value, null, 2);
}
