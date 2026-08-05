import { EditIcon, PackageIcon, PlusIcon, SendIcon, WarningIcon } from '@neko/ui/icons';
import React, { useState, type ReactElement } from 'react';
import type {
  ProjectEntityInspectorIntent,
  ProjectEntityInspectorOperation,
  ProjectEntityInspectorProjection,
} from '@neko/entity-domain';
import './style.css';

export interface EntityInspectorProps {
  readonly projection: ProjectEntityInspectorProjection;
  readonly locale: 'en' | 'zh-cn';
  readonly disabled?: boolean;
  readonly onIntent: (intent: ProjectEntityInspectorIntent) => void | Promise<void>;
}

export function EntityInspector({
  disabled = false,
  locale,
  onIntent,
  projection,
}: EntityInspectorProps): ReactElement {
  const labels = locale === 'zh-cn' ? ZH_LABELS : EN_LABELS;
  const [canonicalName, setCanonicalName] = useState(projection.names.canonical);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [bindingPath, setBindingPath] = useState('');
  const can = (operation: ProjectEntityInspectorOperation): boolean =>
    projection.operations.includes(operation);
  const entityId = projection.entityId;
  const candidateId = projection.candidateId;

  const submitEdit = (): void => {
    if (!entityId || !canonicalName.trim()) return;
    void onIntent({
      type: 'edit',
      entityId,
      changes: { names: { ...projection.names, canonical: canonicalName.trim() } },
    });
  };
  const submitMerge = (): void => {
    if ((!entityId && !candidateId) || !mergeTargetId.trim()) return;
    const source = entityId
      ? { sourceEntityId: entityId }
      : candidateId
        ? { candidateId }
        : undefined;
    if (!source) return;
    void onIntent({
      type: 'merge',
      ...source,
      targetEntityId: mergeTargetId.trim(),
    });
  };
  const submitBinding = (): void => {
    if (!entityId || !bindingPath.trim()) return;
    void onIntent({
      type: 'bind',
      entityId,
      binding: {
        role: 'reference',
        target: { kind: 'workspace-file', path: bindingPath.trim() },
      },
    });
  };

  return (
    <aside className="neko-entity-inspector" aria-label={labels.inspector}>
      <header>
        <div>
          <strong>{projection.names.display ?? projection.names.canonical}</strong>
          <span>{`${labels[projection.status]} · ${labels[projection.kind]}`}</span>
        </div>
      </header>

      {Object.keys(projection.facts).length > 0 ? (
        <section>
          <h3>{labels.facts}</h3>
          <dl>
            {Object.entries(projection.facts).map(([key, value]) => (
              <React.Fragment key={key}>
                <dt>{key}</dt>
                <dd>{presentFact(value)}</dd>
              </React.Fragment>
            ))}
          </dl>
        </section>
      ) : null}

      {projection.evidence?.length ? (
        <section>
          <h3>{labels.evidence}</h3>
          <ul>
            {projection.evidence.map((evidence) => (
              <li key={evidence.evidenceId}>
                <strong>{evidence.label ?? evidence.sourceId}</strong>
                <span>{evidence.owner}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {projection.bindings.length > 0 ? (
        <section>
          <h3>{labels.bindings}</h3>
          <ul>
            {projection.bindings.map((binding) => (
              <li
                key={binding.bindingId}
                data-attention={binding.availability === 'needs-attention'}
              >
                <div>
                  <strong>{binding.role}</strong>
                  <span>{binding.availability}</span>
                </div>
                {can('unbind') && entityId ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      void onIntent({
                        type: 'unbind',
                        entityId,
                        bindingId: binding.bindingId,
                      })
                    }
                  >
                    {labels.unbind}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {projection.provenance ? (
        <section>
          <h3>{labels.provenance}</h3>
          <dl>
            <dt>{labels.origin}</dt>
            <dd>{`${projection.provenance.origin.assetId} @ ${projection.provenance.applied.revision}`}</dd>
            <dt>{labels.availability}</dt>
            <dd>{projection.provenance.availability}</dd>
            <dt>{labels.localChanges}</dt>
            <dd>{projection.provenance.localModifications ? labels.yes : labels.no}</dd>
          </dl>
        </section>
      ) : null}

      {projection.blockers.length > 0 ? (
        <section className="neko-entity-inspector__blockers">
          <h3>
            <WarningIcon size={13} /> {labels.blockers}
          </h3>
          {projection.blockers.map((blocker) => (
            <p key={`${blocker.code}:${blocker.operation ?? 'all'}`}>{blocker.message}</p>
          ))}
        </section>
      ) : null}

      <section className="neko-entity-inspector__actions">
        <h3>{labels.actions}</h3>
        {projection.status === 'candidate' && can('confirm') && candidateId ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              void onIntent({
                type: 'confirm',
                candidateId,
                accepted: {
                  kind: projection.kind,
                  names: projection.names,
                  facts: projection.facts,
                },
              })
            }
          >
            <PlusIcon size={13} /> {labels.confirm}
          </button>
        ) : null}
        {can('edit') ? (
          <div className="neko-entity-inspector__input-action">
            <input
              aria-label={labels.name}
              value={canonicalName}
              onChange={(event) => setCanonicalName(event.currentTarget.value)}
            />
            <button type="button" disabled={disabled || !canonicalName.trim()} onClick={submitEdit}>
              <EditIcon size={13} /> {labels.save}
            </button>
          </div>
        ) : null}
        {can('bind') ? (
          <div className="neko-entity-inspector__input-action">
            <input
              aria-label={labels.workspacePath}
              placeholder="characters/neko.png"
              value={bindingPath}
              onChange={(event) => setBindingPath(event.currentTarget.value)}
            />
            <button
              type="button"
              disabled={disabled || !bindingPath.trim()}
              onClick={submitBinding}
            >
              <PlusIcon size={13} /> {labels.bind}
            </button>
          </div>
        ) : null}
        {can('merge') && (entityId || candidateId) ? (
          <div className="neko-entity-inspector__input-action">
            <input
              aria-label={labels.mergeTarget}
              value={mergeTargetId}
              onChange={(event) => setMergeTargetId(event.currentTarget.value)}
            />
            <button
              type="button"
              disabled={disabled || !mergeTargetId.trim()}
              onClick={submitMerge}
            >
              {labels.merge}
            </button>
          </div>
        ) : null}
        <DirectActions
          disabled={disabled}
          labels={labels}
          onIntent={onIntent}
          projection={projection}
        />
      </section>
    </aside>
  );
}

function DirectActions({
  disabled,
  labels,
  onIntent,
  projection,
}: {
  readonly disabled: boolean;
  readonly labels: Record<keyof typeof EN_LABELS, string>;
  readonly onIntent: EntityInspectorProps['onIntent'];
  readonly projection: ProjectEntityInspectorProjection;
}): ReactElement {
  const entityId = projection.entityId;
  if (!entityId) return <></>;
  const actions: {
    readonly operation: ProjectEntityInspectorOperation;
    readonly intent: ProjectEntityInspectorIntent;
  }[] = [];
  if (projection.operations.includes('deprecate')) {
    actions.push({
      operation: 'deprecate',
      intent: { type: 'deprecate', entityId },
    });
  }
  if (projection.operations.includes('publish')) {
    actions.push({
      operation: 'publish',
      intent: { type: 'publish', entityId },
    });
  }
  if (projection.operations.includes('diff') && projection.provenance?.available) {
    actions.push({
      operation: 'diff',
      intent: { type: 'diff', entityId, available: projection.provenance.available },
    });
  }
  if (projection.operations.includes('reference') && projection.interaction?.conversationId) {
    actions.push({
      operation: 'reference',
      intent: {
        type: 'reference',
        entityId,
        conversationId: projection.interaction.conversationId,
      },
    });
  }
  if (projection.operations.includes('character-dialogue') && projection.interaction?.characterId) {
    actions.push({
      operation: 'character-dialogue',
      intent: {
        type: 'character-dialogue',
        entityId,
        characterId: projection.interaction.characterId,
        ...(projection.interaction.conversationId
          ? { conversationId: projection.interaction.conversationId }
          : {}),
      },
    });
  }
  if (projection.operations.includes('room-open') && projection.interaction?.roomId) {
    actions.push({
      operation: 'room-open',
      intent: { type: 'room-open', entityId, roomId: projection.interaction.roomId },
    });
  }
  if (
    projection.operations.includes('character-embody') &&
    projection.interaction?.characterId &&
    projection.interaction.conversationId
  ) {
    actions.push({
      operation: 'character-embody',
      intent: {
        type: 'character-embody',
        entityId,
        characterId: projection.interaction.characterId,
        conversationId: projection.interaction.conversationId,
      },
    });
  }
  return (
    <div className="neko-entity-inspector__direct-actions">
      {actions.map(({ intent, operation }) => (
        <button
          type="button"
          disabled={disabled}
          key={operation}
          onClick={() => void onIntent(intent)}
        >
          {operation === 'publish' ? <PackageIcon size={13} /> : <SendIcon size={13} />}
          {labels[operation]}
        </button>
      ))}
    </div>
  );
}

function presentFact(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

const EN_LABELS = {
  inspector: 'Entity Inspector',
  confirmed: 'Confirmed',
  candidate: 'Candidate',
  'needs-attention': 'Needs attention',
  deprecated: 'Deprecated',
  character: 'Character',
  scene: 'Scene',
  object: 'Object',
  location: 'Location',
  style: 'Style',
  facts: 'Facts',
  evidence: 'Evidence',
  bindings: 'Bindings',
  provenance: 'Provenance',
  origin: 'Origin',
  availability: 'Availability',
  localChanges: 'Local changes',
  yes: 'Yes',
  no: 'No',
  blockers: 'Blockers',
  actions: 'Actions',
  confirm: 'Confirm',
  name: 'Name',
  save: 'Save',
  workspacePath: 'Workspace path',
  bind: 'Bind',
  unbind: 'Unbind',
  mergeTarget: 'Target Entity ID',
  merge: 'Merge',
  deprecate: 'Deprecate',
  publish: 'Publish',
  diff: 'Review update',
  reference: 'Reference',
  'character-dialogue': 'Start dialogue',
  'room-open': 'Open room',
  'character-embody': 'Embody',
  instantiate: 'Instantiate',
  'apply-update': 'Apply update',
  edit: 'Edit',
} as const;

const ZH_LABELS = {
  inspector: '实体检查器',
  confirmed: '已确认',
  candidate: '候选',
  'needs-attention': '需要处理',
  deprecated: '已弃用',
  character: '角色',
  scene: '场景',
  object: '物件',
  location: '地点',
  style: '风格',
  facts: '事实',
  evidence: '证据',
  bindings: '绑定',
  provenance: '来源',
  origin: '原始资产',
  availability: '可用性',
  localChanges: '本地修改',
  yes: '是',
  no: '否',
  blockers: '阻塞项',
  actions: '操作',
  confirm: '确认',
  name: '名称',
  save: '保存',
  workspacePath: '工作区路径',
  bind: '绑定',
  unbind: '解绑',
  mergeTarget: '目标实体 ID',
  merge: '合并',
  deprecate: '弃用',
  publish: '发布',
  diff: '检查更新',
  reference: '引用',
  'character-dialogue': '开始对话',
  'room-open': '打开群聊',
  'character-embody': '代入角色',
  instantiate: '实例化',
  'apply-update': '应用更新',
  edit: '编辑',
} satisfies Record<keyof typeof EN_LABELS, string>;
