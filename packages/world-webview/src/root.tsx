import {
  WORLD_FOUNDATION_FACT_DELETE_ACTION,
  WORLD_FOUNDATION_FACT_SET_ACTION,
} from '@neko/world/application';
import {
  worldFactSemanticRef,
  type OpenNekoDesktopWorldBridge,
  type WorldDefinition,
  type WorldFact,
  type WorldFoundationCommand,
  type WorldFoundationSnapshot,
  type WorldJsonValue,
  type WorldProject,
  type WorldSaveBranch,
  type WorldSemanticDiffEntry,
  type WorldTransformationCandidate,
} from '@neko/world/contracts';
import { EmptyState, GridIcon, PlusIcon, RefreshIcon, WarningIcon } from '@neko/ui';
import type { SupportedLocale } from '@neko/ui/i18n';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

type LoadState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'ready'; readonly snapshot: WorldFoundationSnapshot };

export function WorldFoundationRoot({
  active,
  host,
  locale,
}: {
  readonly active: boolean;
  readonly host?: OpenNekoDesktopWorldBridge['worldFoundation'];
  readonly locale: SupportedLocale;
}): JSX.Element {
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'idle' });
  const [pending, setPending] = useState<string>();
  const [diagnostic, setDiagnostic] = useState<string>();
  const [selectedProjectId, setSelectedProjectId] = useState<string>();
  const [selectedRunId, setSelectedRunId] = useState<string>();
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    setLoadState({ kind: 'loading' });
    setDiagnostic(undefined);
    try {
      if (!host) throw new Error('World Foundation Host port is unavailable.');
      const snapshot = await host.getSnapshot();
      setLoadState({ kind: 'ready', snapshot });
    } catch (error) {
      setLoadState({ kind: 'failed', message: describeError(error) });
    }
  }, [host]);

  useEffect(() => {
    if (!active) {
      setLoadState({ kind: 'idle' });
      return;
    }
    void reload();
  }, [active, reload]);

  const execute = useCallback(
    async (command: WorldFoundationCommand) => {
      setPending(command.operation);
      setDiagnostic(undefined);
      try {
        if (!host) throw new Error('World Foundation Host port is unavailable.');
        const snapshot = await host.execute(command);
        setLoadState({ kind: 'ready', snapshot });
        return snapshot;
      } catch (error) {
        setDiagnostic(describeError(error));
        throw error;
      } finally {
        setPending(undefined);
      }
    },
    [host],
  );

  if (loadState.kind === 'idle' || loadState.kind === 'loading') {
    return <Status>{label(locale, '正在读取世界资料…', 'Loading World Foundation…')}</Status>;
  }
  if (loadState.kind === 'failed') {
    return (
      <Status error>
        <span>{loadState.message}</span>
        <button type="button" onClick={() => void reload()}>
          {label(locale, '重试', 'Retry')}
        </button>
      </Status>
    );
  }

  const snapshot = loadState.snapshot;
  const selectedProject =
    snapshot.world.projects.find((item) => item.worldProjectId === selectedProjectId) ??
    snapshot.world.projects[0];
  const selectedRuntime =
    snapshot.world.runtimes.find((item) => item.run.worldRunId === selectedRunId) ??
    snapshot.world.runtimes[0];

  return (
    <section className="world-foundation" data-world-foundation="true">
      <header className="world-foundation__header">
        <div>
          <span>WORLD FOUNDATION</span>
          <h1>{label(locale, '世界', 'Worlds')}</h1>
          <p>
            {label(
              locale,
              '创作世界定义，发布版本，并检查确定性的状态、事件与分支。',
              'Author world definitions, publish versions, and inspect deterministic state, events, and branches.',
            )}
          </p>
        </div>
        <div className="world-foundation__header-actions">
          <span className="world-foundation__scope-badge">
            {label(locale, '基础预览', 'Foundation preview')}
          </span>
          <button
            aria-label={label(locale, '刷新', 'Refresh')}
            type="button"
            onClick={() => void reload()}
          >
            <RefreshIcon size={15} />
          </button>
          <button type="button" onClick={() => setCreating(true)}>
            <PlusIcon size={15} /> {label(locale, '新建世界', 'New world')}
          </button>
        </div>
      </header>

      {diagnostic ? <Diagnostic>{diagnostic}</Diagnostic> : null}
      {snapshot.diagnostics.map((item) => (
        <Diagnostic key={`${item.recordKind}:${item.recordId}`}>
          {`${item.recordKind} / ${item.recordId}: ${item.message}`}
        </Diagnostic>
      ))}

      <div className="world-foundation__notice">
        <WarningIcon size={15} />
        <span>
          {label(
            locale,
            '完整 World Experience、Story、Gameplay、实时 AI、游戏引擎和世界模型尚未启用。',
            'Complete World Experience, Story, Gameplay, realtime AI, game engines, and world models are not enabled.',
          )}
        </span>
      </div>

      <div className="world-foundation__workspace">
        <WorldLibrary
          locale={locale}
          onCreate={() => setCreating(true)}
          onSelectProject={(id) => {
            setCreating(false);
            setSelectedProjectId(id);
          }}
          onSelectRun={setSelectedRunId}
          selectedProjectId={selectedProject?.worldProjectId}
          selectedRunId={selectedRuntime?.run.worldRunId}
          snapshot={snapshot}
        />
        <WorldStudio
          creating={creating || !selectedProject}
          execute={execute}
          locale={locale}
          pending={pending}
          project={creating ? undefined : selectedProject}
          snapshot={snapshot}
          onCreated={(id) => {
            setCreating(false);
            setSelectedProjectId(id);
          }}
        />
        <WorldPreview
          execute={execute}
          locale={locale}
          pending={pending}
          runtime={selectedRuntime}
          snapshot={snapshot}
          onRunCreated={setSelectedRunId}
        />
      </div>
    </section>
  );
}

function WorldLibrary({
  locale,
  onCreate,
  onSelectProject,
  onSelectRun,
  selectedProjectId,
  selectedRunId,
  snapshot,
}: {
  readonly locale: SupportedLocale;
  readonly onCreate: () => void;
  readonly onSelectProject: (id: string) => void;
  readonly onSelectRun: (id: string) => void;
  readonly selectedProjectId?: string;
  readonly selectedRunId?: string;
  readonly snapshot: WorldFoundationSnapshot;
}): JSX.Element {
  return (
    <aside className="world-foundation__library">
      <section>
        <div className="world-foundation__section-title">
          <span>{label(locale, '世界资料库', 'World library')}</span>
          <strong>{snapshot.world.projects.length}</strong>
        </div>
        {snapshot.world.projects.length === 0 ? (
          <EmptyState
            fill
            icon={<GridIcon size={22} />}
            title={label(locale, '创建第一个世界', 'Create your first world')}
            action={
              <button type="button" onClick={onCreate}>
                {label(locale, '新建世界', 'New world')}
              </button>
            }
          />
        ) : (
          <div className="world-foundation__list">
            {snapshot.world.projects.map((project) => {
              const count = snapshot.world.versions.filter(
                (version) => version.worldProjectId === project.worldProjectId,
              ).length;
              return (
                <button
                  className={project.worldProjectId === selectedProjectId ? 'is-active' : undefined}
                  key={project.worldProjectId}
                  type="button"
                  onClick={() => onSelectProject(project.worldProjectId)}
                >
                  <span>{project.title}</span>
                  <small>
                    {reviewLabel(locale, project.reviewStatus)} · {count}{' '}
                    {label(locale, '个版本', 'versions')}
                  </small>
                </button>
              );
            })}
          </div>
        )}
      </section>
      <section>
        <div className="world-foundation__section-title">
          <span>{label(locale, '预览记录', 'Preview runs')}</span>
          <strong>{snapshot.world.runtimes.length}</strong>
        </div>
        <div className="world-foundation__list">
          {snapshot.world.runtimes.map(({ run, save }) => (
            <button
              className={run.worldRunId === selectedRunId ? 'is-active' : undefined}
              key={run.worldRunId}
              type="button"
              onClick={() => onSelectRun(run.worldRunId)}
            >
              <span>{save.label}</span>
              <small>
                {save.branches.length} {label(locale, '个分支', 'branches')} · r
                {run.worldStateRevision}
              </small>
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}

interface DraftForm {
  readonly title: string;
  readonly background: string;
  readonly locations: string;
  readonly organizations: string;
  readonly rules: string;
  readonly facts: string;
}

function WorldStudio({
  creating,
  execute,
  locale,
  onCreated,
  pending,
  project,
  snapshot,
}: {
  readonly creating: boolean;
  readonly execute: (command: WorldFoundationCommand) => Promise<WorldFoundationSnapshot>;
  readonly locale: SupportedLocale;
  readonly onCreated: (id: string) => void;
  readonly pending?: string;
  readonly project?: WorldProject;
  readonly snapshot: WorldFoundationSnapshot;
}): JSX.Element {
  const [form, setForm] = useState<DraftForm>(() => formFromProject(project));
  const [publishLabel, setPublishLabel] = useState('First publication');
  useEffect(() => setForm(formFromProject(project)), [creating, project]);
  const busy = pending !== undefined;
  const versions = project
    ? snapshot.world.versions.filter((version) => version.worldProjectId === project.worldProjectId)
    : [];

  const submit = async () => {
    const draft = definitionFromForm(form, project?.draft);
    if (project) {
      await execute({
        operation: 'world-project-update-draft',
        input: { worldProjectId: project.worldProjectId, draft },
      });
      return;
    }
    const id = `world-project:${crypto.randomUUID()}`;
    await execute({
      operation: 'world-project-create',
      input: { worldProjectId: id, title: form.title.trim(), draft },
    });
    onCreated(id);
  };

  return (
    <main className="world-foundation__studio">
      <div className="world-foundation__pane-heading">
        <div>
          <span>
            {label(
              locale,
              creating ? '新世界' : '世界工作室',
              creating ? 'New world' : 'World Studio',
            )}
          </span>
          <h2>{creating ? label(locale, '定义世界', 'Define world') : project?.title}</h2>
        </div>
        {project ? (
          <span className={`world-foundation__status is-${project.reviewStatus}`}>
            {reviewLabel(locale, project.reviewStatus)}
          </span>
        ) : null}
      </div>

      <div className="world-foundation__form-grid">
        <Field label={label(locale, '名称', 'Name')}>
          <input
            disabled={Boolean(project)}
            value={form.title}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setForm((current) => ({ ...current, title: value }));
            }}
          />
        </Field>
        <Field wide label={label(locale, '背景设定', 'Background')}>
          <textarea
            rows={5}
            value={form.background}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setForm((current) => ({ ...current, background: value }));
            }}
          />
        </Field>
        <Field
          label={label(locale, '地点', 'Locations')}
          hint={label(locale, '每行：名称 | 描述', 'One per line: name | description')}
        >
          <textarea
            rows={5}
            value={form.locations}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setForm((current) => ({ ...current, locations: value }));
            }}
          />
        </Field>
        <Field
          label={label(locale, '组织', 'Organizations')}
          hint={label(locale, '每行：名称 | 描述', 'One per line: name | description')}
        >
          <textarea
            rows={5}
            value={form.organizations}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setForm((current) => ({ ...current, organizations: value }));
            }}
          />
        </Field>
        <Field
          label={label(locale, '世界规则', 'World rules')}
          hint={label(locale, '每行一条规则', 'One rule per line')}
        >
          <textarea
            rows={5}
            value={form.rules}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setForm((current) => ({ ...current, rules: value }));
            }}
          />
        </Field>
        <Field
          label={label(locale, '初始事实', 'Initial facts')}
          hint={label(locale, '每行：key = JSON', 'One per line: key = JSON')}
        >
          <textarea
            rows={5}
            value={form.facts}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setForm((current) => ({ ...current, facts: value }));
            }}
          />
        </Field>
      </div>
      <div className="world-foundation__actions">
        <button disabled={busy || !form.title.trim()} type="button" onClick={() => void submit()}>
          {label(
            locale,
            project ? '保存草稿' : '创建项目',
            project ? 'Save draft' : 'Create project',
          )}
        </button>
        {project ? (
          <>
            <select
              aria-label={label(locale, '审核状态', 'Review status')}
              disabled={busy}
              value={project.reviewStatus}
              onChange={(event) =>
                void execute({
                  operation: 'world-project-set-review',
                  input: {
                    worldProjectId: project.worldProjectId,
                    reviewStatus: event.currentTarget.value as 'draft' | 'ready' | 'blocked',
                  },
                })
              }
            >
              <option value="draft">{label(locale, '草稿', 'Draft')}</option>
              <option value="ready">{label(locale, '可发布', 'Ready')}</option>
              <option value="blocked">{label(locale, '阻塞', 'Blocked')}</option>
            </select>
            <input
              aria-label={label(locale, '版本名称', 'Version label')}
              value={publishLabel}
              onChange={(event) => setPublishLabel(event.currentTarget.value)}
            />
            <button
              className="is-primary"
              disabled={busy || project.reviewStatus !== 'ready' || !publishLabel.trim()}
              type="button"
              onClick={() =>
                void execute({
                  operation: 'world-version-publish',
                  input: {
                    worldProjectId: project.worldProjectId,
                    worldVersionId: `world-version:${crypto.randomUUID()}`,
                    label: publishLabel.trim(),
                  },
                })
              }
            >
              {label(locale, '发布版本', 'Publish version')}
            </button>
          </>
        ) : null}
      </div>
      {project ? (
        <div className="world-foundation__versions">
          <strong>{label(locale, '已发布版本', 'Published versions')}</strong>
          {versions.length === 0 ? (
            <span>{label(locale, '尚无版本', 'No versions yet')}</span>
          ) : (
            versions.map((version) => (
              <span key={version.worldVersionId}>
                {version.label} · {formatDate(version.publishedAt, locale)}
              </span>
            ))
          )}
        </div>
      ) : null}
    </main>
  );
}

function WorldPreview({
  execute,
  locale,
  onRunCreated,
  pending,
  runtime,
  snapshot,
}: {
  readonly execute: (command: WorldFoundationCommand) => Promise<WorldFoundationSnapshot>;
  readonly locale: SupportedLocale;
  readonly onRunCreated: (id: string) => void;
  readonly pending?: string;
  readonly runtime?: WorldFoundationSnapshot['world']['runtimes'][number];
  readonly snapshot: WorldFoundationSnapshot;
}): JSX.Element {
  const [versionId, setVersionId] = useState(snapshot.world.versions[0]?.worldVersionId ?? '');
  const [factKey, setFactKey] = useState('');
  const [factValue, setFactValue] = useState('true');
  const [transformationIntent, setTransformationIntent] = useState(
    label(locale, '调整当前世界状态。', 'Change the current World state.'),
  );
  const [transformationDraftDiagnostic, setTransformationDraftDiagnostic] = useState<string>();
  const [transformationReview, setTransformationReview] = useState<TransformationReview>();
  const activeBranch = runtime?.save.branches.find(
    (branch) => branch.branchId === runtime.run.branchId,
  );
  const busy = pending !== undefined;
  useEffect(() => {
    setTransformationDraftDiagnostic(undefined);
    setTransformationReview(undefined);
  }, [runtime?.run.worldRunId]);

  const startRun = async () => {
    const token = crypto.randomUUID();
    const worldRunId = `world-run:${token}`;
    await execute({
      operation: 'world-preview-run-create',
      input: {
        worldVersionId: versionId,
        worldRunId,
        worldSaveId: `world-save:${token}`,
        branchId: 'branch-main',
        saveLabel: label(locale, '基础预览', 'Foundation preview'),
      },
    });
    onRunCreated(worldRunId);
  };

  const prepareSetFact = () => {
    try {
      if (!runtime || !activeBranch) {
        throw new Error('World transformation requires an exact visible runtime branch.');
      }
      const key = factKey.trim();
      const existing = activeBranch.state.facts.find((item) => item.key === key);
      const fact: WorldFact = {
        factId: existing?.factId ?? `world-fact:${crypto.randomUUID()}`,
        key,
        value: parseJson(factValue),
        visibility: existing?.visibility ?? { kind: 'public' },
        knownByActorIds: existing?.knownByActorIds ?? ['foundation-author'],
      };
      const candidate = createFactTransformationCandidate({
        runtime,
        branch: activeBranch,
        intent: transformationIntent,
        sourceRefIds: sourceRefsForRuntime(snapshot, runtime.run.worldVersionId),
        diff: existing
          ? {
              operation: 'replace',
              semanticRef: worldFactSemanticRef(fact.factId),
              before: worldFactJson(existing),
              after: worldFactJson(fact),
            }
          : {
              operation: 'add',
              semanticRef: worldFactSemanticRef(fact.factId),
              after: worldFactJson(fact),
            },
        capabilityId: WORLD_FOUNDATION_FACT_SET_ACTION,
      });
      setTransformationDraftDiagnostic(undefined);
      setTransformationReview({ candidate, status: 'review' });
    } catch (error) {
      setTransformationReview(undefined);
      setTransformationDraftDiagnostic(describeError(error));
    }
  };

  const prepareDeleteFact = (fact: WorldFact) => {
    try {
      if (!runtime || !activeBranch) {
        throw new Error('World transformation requires an exact visible runtime branch.');
      }
      const candidate = createFactTransformationCandidate({
        runtime,
        branch: activeBranch,
        intent: label(locale, `删除世界事实 ${fact.key}。`, `Remove World fact ${fact.key}.`),
        sourceRefIds: sourceRefsForRuntime(snapshot, runtime.run.worldVersionId),
        diff: {
          operation: 'remove',
          semanticRef: worldFactSemanticRef(fact.factId),
          before: worldFactJson(fact),
        },
        capabilityId: WORLD_FOUNDATION_FACT_DELETE_ACTION,
      });
      setTransformationDraftDiagnostic(undefined);
      setTransformationReview({ candidate, status: 'review' });
    } catch (error) {
      setTransformationReview(undefined);
      setTransformationDraftDiagnostic(describeError(error));
    }
  };

  const applyTransformation = async () => {
    if (!transformationReview || transformationReview.status === 'committed') {
      throw new Error('World transformation review is not applicable.');
    }
    setTransformationReview({
      candidate: transformationReview.candidate,
      status: 'applying',
    });
    try {
      await execute({
        operation: 'world-transformation-state-commit',
        input: transformationReview.candidate,
      });
      setTransformationReview({
        candidate: transformationReview.candidate,
        status: 'committed',
      });
      setFactKey('');
    } catch (error) {
      setTransformationReview({
        candidate: transformationReview.candidate,
        status: 'failed',
        diagnostic: describeError(error),
      });
    }
  };

  return (
    <aside className="world-foundation__preview">
      <div className="world-foundation__pane-heading">
        <div>
          <span>{label(locale, '确定性检查', 'Deterministic inspection')}</span>
          <h2>{label(locale, '基础预览', 'Foundation preview')}</h2>
        </div>
      </div>
      <div className="world-foundation__start-run">
        <select
          aria-label={label(locale, '世界版本', 'World version')}
          value={versionId}
          onChange={(event) => setVersionId(event.currentTarget.value)}
        >
          <option value="">{label(locale, '选择已发布版本', 'Select a published version')}</option>
          {snapshot.world.versions.map((version) => (
            <option key={version.worldVersionId} value={version.worldVersionId}>
              {version.label}
            </option>
          ))}
        </select>
        <button disabled={busy || !versionId} type="button" onClick={() => void startRun()}>
          {label(locale, '开始预览', 'Start preview')}
        </button>
      </div>
      {!runtime || !activeBranch ? (
        <EmptyState
          fill
          icon={<GridIcon size={22} />}
          title={label(
            locale,
            '发布版本后开始基础预览',
            'Publish a version to start a Foundation preview',
          )}
        />
      ) : (
        <>
          <div className="world-foundation__runtime-meta">
            <span>{runtime.save.label}</span>
            <strong>
              r{activeBranch.state.worldStateRevision} · t{activeBranch.state.timepoint}
            </strong>
          </div>
          <div className="world-foundation__branches">
            {runtime.save.branches.map((branch) => (
              <button
                className={branch.branchId === runtime.run.branchId ? 'is-active' : undefined}
                disabled={busy}
                key={branch.branchId}
                type="button"
                onClick={() =>
                  void execute({
                    operation: 'world-preview-branch-activate',
                    input: {
                      worldRunId: runtime.run.worldRunId,
                      worldSaveId: runtime.save.worldSaveId,
                      branchId: branch.branchId,
                    },
                  })
                }
              >
                {branch.branchId}
              </button>
            ))}
          </div>
          <section className="world-foundation__fact-editor">
            <strong>{label(locale, '提出世界改造', 'Propose World transformation')}</strong>
            <textarea
              aria-label={label(locale, '改造意图', 'Transformation intent')}
              rows={2}
              value={transformationIntent}
              onChange={(event) => setTransformationIntent(event.currentTarget.value)}
            />
            <input
              aria-label={label(locale, '事实键', 'Fact key')}
              placeholder="city.weather"
              value={factKey}
              onChange={(event) => setFactKey(event.currentTarget.value)}
            />
            <input
              aria-label={label(locale, 'JSON 值', 'JSON value')}
              placeholder='"rain"'
              value={factValue}
              onChange={(event) => setFactValue(event.currentTarget.value)}
            />
            <button
              disabled={busy || !factKey.trim() || !transformationIntent.trim()}
              type="button"
              onClick={prepareSetFact}
            >
              {label(locale, '生成候选', 'Prepare candidate')}
            </button>
            {transformationDraftDiagnostic ? (
              <small className="is-error" role="alert">
                {transformationDraftDiagnostic}
              </small>
            ) : null}
          </section>
          {transformationReview ? (
            <TransformationReviewPanel
              busy={busy}
              locale={locale}
              review={transformationReview}
              onApply={() => void applyTransformation()}
              onDismiss={() => setTransformationReview(undefined)}
            />
          ) : null}
          <section className="world-foundation__runtime-section">
            <strong>{label(locale, '当前事实', 'Current facts')}</strong>
            {activeBranch.state.facts.map((fact) => (
              <div className="world-foundation__fact" key={fact.factId}>
                <span>
                  <b>{fact.key}</b>
                  <code>{JSON.stringify(fact.value)}</code>
                </span>
                <button
                  aria-label={`${label(locale, '删除', 'Delete')} ${fact.key}`}
                  disabled={busy}
                  type="button"
                  onClick={() => prepareDeleteFact(fact)}
                >
                  ×
                </button>
              </div>
            ))}
          </section>
          <section className="world-foundation__runtime-section">
            <strong>{label(locale, '已提交事件 / 回放', 'Committed events / replay')}</strong>
            {[...activeBranch.events].reverse().map((event) => (
              <div className="world-foundation__event" key={event.worldEventId}>
                <span>
                  #{event.sequence} · {event.action.replace('world.foundation.', '')}
                </span>
                <button
                  disabled={busy}
                  type="button"
                  onClick={() =>
                    void execute({
                      operation: 'world-preview-branch-fork',
                      input: {
                        worldRunId: runtime.run.worldRunId,
                        worldSaveId: runtime.save.worldSaveId,
                        parentBranchId: activeBranch.branchId,
                        forkedFromWorldEventId: event.worldEventId,
                        branchId: `branch:${crypto.randomUUID()}`,
                        expectedWorldStateRevision: activeBranch.state.worldStateRevision,
                      },
                    })
                  }
                >
                  {label(locale, '从此分支', 'Fork here')}
                </button>
              </div>
            ))}
          </section>
        </>
      )}
    </aside>
  );
}

type TransformationReview =
  | { readonly candidate: WorldTransformationCandidate; readonly status: 'review' | 'applying' }
  | { readonly candidate: WorldTransformationCandidate; readonly status: 'committed' }
  | {
      readonly candidate: WorldTransformationCandidate;
      readonly status: 'failed';
      readonly diagnostic: string;
    };

function TransformationReviewPanel({
  busy,
  locale,
  onApply,
  onDismiss,
  review,
}: {
  readonly busy: boolean;
  readonly locale: SupportedLocale;
  readonly onApply: () => void;
  readonly onDismiss: () => void;
  readonly review: TransformationReview;
}): JSX.Element {
  const diff = review.candidate.diff[0];
  const requirement = review.candidate.requirements[0];
  if (!diff || !requirement) throw new Error('World transformation review is incomplete.');
  return (
    <section className="world-foundation__transformation" aria-live="polite">
      <div className="world-foundation__transformation-heading">
        <div>
          <span>{label(locale, '改造候选', 'Transformation candidate')}</span>
          <strong>{transformationStatusLabel(locale, review.status)}</strong>
        </div>
        <button type="button" onClick={onDismiss}>
          {label(locale, '关闭', 'Dismiss')}
        </button>
      </div>
      <dl>
        <div>
          <dt>{label(locale, '来源与意图', 'Source & intent')}</dt>
          <dd>{review.candidate.source.intent}</dd>
          <small>
            {review.candidate.source.sourceRefIds.length > 0
              ? review.candidate.source.sourceRefIds.join(' · ')
              : label(locale, '当前作者直接输入', 'Direct author input')}
          </small>
        </div>
        <div>
          <dt>{label(locale, '语义差异', 'Semantic diff')}</dt>
          <dd>
            <span className={`world-foundation__diff-operation is-${diff.operation}`}>
              {diff.operation}
            </span>
            <code>{diff.semanticRef}</code>
          </dd>
          {'before' in diff ? <pre>{JSON.stringify(diff.before, null, 2)}</pre> : null}
          {'after' in diff ? <pre>{JSON.stringify(diff.after, null, 2)}</pre> : null}
        </div>
        <div>
          <dt>{label(locale, '能力诊断', 'Capability diagnostics')}</dt>
          <dd>
            <span className="world-foundation__capability-mode">{requirement.mode}</span>
            <code>{`${requirement.capabilityKind}:${requirement.capabilityId}`}</code>
          </dd>
          <small className={review.status === 'failed' ? 'is-error' : undefined}>
            {review.status === 'failed'
              ? review.diagnostic
              : review.status === 'committed'
                ? label(
                    locale,
                    '精确能力已解析，并通过 WorldRuntime 事件链提交。',
                    'Exact capability resolved and committed through the WorldRuntime event path.',
                  )
                : label(
                    locale,
                    '应用时将校验精确能力、权限和当前状态版本。',
                    'Apply validates the exact capability, authority, and current state revision.',
                  )}
          </small>
        </div>
      </dl>
      {review.status !== 'committed' ? (
        <button
          className="is-primary"
          disabled={busy || review.status === 'applying'}
          type="button"
          onClick={onApply}
        >
          {review.status === 'applying'
            ? label(locale, '正在应用…', 'Applying…')
            : label(locale, '应用改造', 'Apply transformation')}
        </button>
      ) : null}
    </section>
  );
}

function createFactTransformationCandidate(input: {
  readonly runtime: WorldFoundationSnapshot['world']['runtimes'][number];
  readonly branch: WorldSaveBranch;
  readonly intent: string;
  readonly sourceRefIds: readonly string[];
  readonly diff: WorldSemanticDiffEntry;
  readonly capabilityId: string;
}): WorldTransformationCandidate {
  return {
    worldTransformationCandidateId: `world-transformation:${crypto.randomUUID()}`,
    category: 'world-state',
    owner: 'world-runtime',
    requester: { actorId: 'foundation-author', authority: 'author' },
    base: {
      kind: 'runtime',
      worldVersionId: input.runtime.run.worldVersionId,
      worldRunId: input.runtime.run.worldRunId,
      worldSaveId: input.runtime.save.worldSaveId,
      branchId: input.branch.branchId,
      worldStateRevision: input.branch.state.worldStateRevision,
      timepoint: input.branch.state.timepoint,
    },
    source: { intent: input.intent.trim(), sourceRefIds: input.sourceRefIds },
    diff: [input.diff],
    requirements: [
      {
        capabilityKind: 'world-action',
        capabilityId: input.capabilityId,
        mode: 'required',
      },
    ],
    createdAt: new Date().toISOString(),
  };
}

function sourceRefsForRuntime(
  snapshot: WorldFoundationSnapshot,
  worldVersionId: string,
): readonly string[] {
  const publication = snapshot.world.versions.find(
    (item) => item.worldVersionId === worldVersionId,
  );
  if (!publication) throw new Error(`WorldVersion '${worldVersionId}' is unavailable.`);
  const project = snapshot.world.projects.find(
    (item) => item.worldProjectId === publication.worldProjectId,
  );
  if (!project) throw new Error(`WorldProject '${publication.worldProjectId}' is unavailable.`);
  return project.sourceRefs.map((item) => item.sourceRefId);
}

function worldFactJson(fact: WorldFact): WorldJsonValue {
  const visibility: WorldJsonValue =
    fact.visibility.kind === 'actors'
      ? { kind: 'actors', actorIds: [...fact.visibility.actorIds] }
      : { kind: fact.visibility.kind };
  return {
    factId: fact.factId,
    key: fact.key,
    value: fact.value,
    visibility,
    knownByActorIds: [...fact.knownByActorIds],
  };
}

function formFromProject(project?: WorldProject): DraftForm {
  return {
    title: project?.title ?? '',
    background: project?.draft.background ?? '',
    locations:
      project?.draft.locations.map((item) => `${item.name} | ${item.description}`).join('\n') ?? '',
    organizations:
      project?.draft.organizations.map((item) => `${item.name} | ${item.description}`).join('\n') ??
      '',
    rules: project?.draft.rules.map((item) => item.statement).join('\n') ?? '',
    facts:
      project?.draft.initialFacts
        .map((item) => `${item.key} = ${JSON.stringify(item.value)}`)
        .join('\n') ?? '',
  };
}

function definitionFromForm(form: DraftForm, current?: WorldDefinition): WorldDefinition {
  const locations = parseNamedLines(form.locations, current?.locations ?? [], 'world-location');
  const organizations = parseNamedLines(
    form.organizations,
    current?.organizations ?? [],
    'world-organization',
  );
  const rules = nonEmptyLines(form.rules).map((statement) => ({
    ruleId:
      current?.rules.find((item) => item.statement === statement)?.ruleId ??
      `world-rule:${crypto.randomUUID()}`,
    statement,
    sourceRefIds: current?.rules.find((item) => item.statement === statement)?.sourceRefIds ?? [],
  }));
  const initialFacts = nonEmptyLines(form.facts).map((line) => {
    const separator = line.indexOf('=');
    if (separator < 1) throw new Error(`Invalid fact line '${line}'. Expected key = JSON.`);
    const key = line.slice(0, separator).trim();
    const existing = current?.initialFacts.find((item) => item.key === key);
    return {
      factId: existing?.factId ?? `world-fact:${crypto.randomUUID()}`,
      key,
      value: parseJson(line.slice(separator + 1).trim()),
      visibility: existing?.visibility ?? { kind: 'public' as const },
      knownByActorIds: existing?.knownByActorIds ?? ['foundation-author'],
    };
  });
  return {
    background: form.background,
    worldBook: current?.worldBook ?? [],
    locations,
    organizations,
    rules,
    initialFacts,
  };
}

function parseNamedLines(value: string, current: WorldDefinition['locations'], prefix: string) {
  return nonEmptyLines(value).map((line) => {
    const [name = '', ...description] = line.split('|');
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error(`Invalid named definition '${line}'.`);
    const existing = current.find((item) => item.name === normalizedName);
    return {
      definitionId: existing?.definitionId ?? `${prefix}:${crypto.randomUUID()}`,
      name: normalizedName,
      description: description.join('|').trim(),
      sourceRefIds: existing?.sourceRefIds ?? [],
    };
  });
}

function nonEmptyLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseJson(value: string): WorldJsonValue {
  try {
    return JSON.parse(value) as WorldJsonValue;
  } catch {
    throw new Error(`Invalid JSON value '${value}'.`);
  }
}

function Field({
  children,
  hint,
  label: fieldLabel,
  wide,
}: {
  readonly children: ReactNode;
  readonly hint?: string;
  readonly label: string;
  readonly wide?: boolean;
}): JSX.Element {
  return (
    <label className={wide ? 'is-wide' : undefined}>
      <span>{fieldLabel}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function Status({
  children,
  error,
}: {
  readonly children: ReactNode;
  readonly error?: boolean;
}): JSX.Element {
  return (
    <section className={`world-foundation world-foundation__loading${error ? ' is-error' : ''}`}>
      {children}
    </section>
  );
}

function Diagnostic({ children }: { readonly children: ReactNode }): JSX.Element {
  return (
    <div className="world-foundation__diagnostic" role="alert">
      <WarningIcon size={14} />
      {children}
    </div>
  );
}

function label(locale: SupportedLocale, zh: string, en: string): string {
  return locale.startsWith('zh') ? zh : en;
}

function reviewLabel(locale: SupportedLocale, status: WorldProject['reviewStatus']): string {
  if (status === 'ready') return label(locale, '可发布', 'Ready');
  if (status === 'blocked') return label(locale, '阻塞', 'Blocked');
  return label(locale, '草稿', 'Draft');
}

function transformationStatusLabel(
  locale: SupportedLocale,
  status: TransformationReview['status'],
): string {
  if (status === 'committed') return label(locale, '已提交', 'Committed');
  if (status === 'failed') return label(locale, '需要处理', 'Needs attention');
  if (status === 'applying') return label(locale, '校验中', 'Validating');
  return label(locale, '待审阅', 'Review');
}

function formatDate(value: string, locale: SupportedLocale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
