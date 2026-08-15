import {
  parseWorldActionIntent,
  parseWorldRuntimeProjection,
  type OpenNekoDesktopWorldRuntimeBridge,
  type WorldActionIntent,
  type WorldJsonValue,
  type WorldRuntimeBinding,
  type WorldRuntimeProjection,
} from '@neko/world/contracts';
import type { SupportedLocale } from '@neko/ui/i18n';
import { SearchIcon } from '@neko/ui';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export type WorldRuntimeLoadState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'ready'; readonly projection: WorldRuntimeProjection };

export interface WorldRuntimePresentation {
  readonly loadState: WorldRuntimeLoadState;
  readonly pending: boolean;
  readonly operationError?: string;
  readonly reload: () => Promise<void>;
  readonly submitAction: (intent: WorldActionIntent) => Promise<void>;
}

export function useWorldRuntimePresentation(input: {
  readonly active: boolean;
  readonly binding?: WorldRuntimeBinding;
  readonly host?: OpenNekoDesktopWorldRuntimeBridge['worldRuntime'];
  readonly windowId: string;
}): WorldRuntimePresentation {
  const [loadState, setLoadState] = useState<WorldRuntimeLoadState>({ kind: 'idle' });
  const [pending, setPending] = useState(false);
  const [operationError, setOperationError] = useState<string>();
  const activeRef = useRef(input.active);
  const requestRef = useRef(0);

  const acceptProjection = useCallback(
    (value: unknown): WorldRuntimeProjection => {
      if (!input.binding) throw new Error('World Runtime binding is unavailable.');
      const projection = parseWorldRuntimeProjection(value);
      if (!sameBinding(projection.binding, input.binding)) {
        throw new Error('World Runtime Host returned a projection for another exact binding.');
      }
      return projection;
    },
    [input.binding],
  );

  const reload = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoadState({ kind: 'loading' });
    setOperationError(undefined);
    try {
      if (!input.host) throw new Error('World Runtime Host port is unavailable.');
      if (!input.binding) throw new Error('World Runtime binding is unavailable.');
      const projection = acceptProjection(
        await input.host.getSnapshot(input.windowId, input.binding),
      );
      if (activeRef.current && requestRef.current === requestId) {
        setLoadState({ kind: 'ready', projection });
      }
    } catch (error) {
      if (activeRef.current && requestRef.current === requestId) {
        setLoadState({ kind: 'failed', message: describeError(error) });
      }
    }
  }, [acceptProjection, input.binding, input.host, input.windowId]);

  useEffect(() => {
    activeRef.current = input.active;
    if (input.active) {
      void reload();
    } else {
      requestRef.current += 1;
      setLoadState({ kind: 'idle' });
      setPending(false);
      setOperationError(undefined);
    }
    return () => {
      activeRef.current = false;
      requestRef.current += 1;
    };
  }, [input.active, reload]);

  const submitAction = useCallback(
    async (value: WorldActionIntent) => {
      const intent = parseWorldActionIntent(value);
      if (!input.binding) throw new Error('World Runtime binding is unavailable.');
      if (
        intent.worldRunId !== input.binding.worldRunId ||
        intent.worldSaveId !== input.binding.worldSaveId ||
        intent.branchId !== input.binding.branchId
      ) {
        throw new Error('World action intent does not match the visible Runtime binding.');
      }
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      setPending(true);
      setOperationError(undefined);
      try {
        if (!input.host) throw new Error('World Runtime Host port is unavailable.');
        const projection = acceptProjection(
          await input.host.submitAction(input.windowId, input.binding, intent),
        );
        if (activeRef.current && requestRef.current === requestId) {
          setLoadState({ kind: 'ready', projection });
        }
      } catch (error) {
        if (activeRef.current && requestRef.current === requestId) {
          setOperationError(describeError(error));
        }
      } finally {
        if (activeRef.current && requestRef.current === requestId) setPending(false);
      }
    },
    [acceptProjection, input.binding, input.host, input.windowId],
  );

  return { loadState, pending, operationError, reload, submitAction };
}

export function WorldRuntimeRoot({
  active,
  binding,
  createIntentId,
  host,
  locale,
  now,
  windowId,
}: {
  readonly active: boolean;
  readonly binding: WorldRuntimeBinding;
  readonly createIntentId: () => string;
  readonly host?: OpenNekoDesktopWorldRuntimeBridge['worldRuntime'];
  readonly locale: SupportedLocale;
  readonly now: () => string;
  readonly windowId: string;
}): JSX.Element {
  const runtime = useWorldRuntimePresentation({ active, binding, host, windowId });
  const projection = runtime.loadState.kind === 'ready' ? runtime.loadState.projection : undefined;

  return (
    <section className="world-runtime" data-world-runtime-root="true">
      {runtime.loadState.kind === 'idle' || runtime.loadState.kind === 'loading' ? (
        <RuntimeMessage>
          {copy(locale, '正在连接世界运行...', 'Connecting to World Runtime...')}
        </RuntimeMessage>
      ) : runtime.loadState.kind === 'failed' ? (
        <RuntimeMessage error>
          <strong>{copy(locale, '无法打开世界运行', 'Unable to open World Runtime')}</strong>
          <span>{runtime.loadState.message}</span>
          <button type="button" onClick={() => void runtime.reload()}>
            {copy(locale, '重试', 'Retry')}
          </button>
        </RuntimeMessage>
      ) : projection ? (
        <div className="world-runtime__composition">
          <WorldRuntimeMainSurface locale={locale} projection={projection} />
          <WorldRuntimeInteractionSurface
            createIntentId={createIntentId}
            locale={locale}
            now={now}
            operationError={runtime.operationError}
            pending={runtime.pending}
            projection={projection}
            submitAction={runtime.submitAction}
          />
          <WorldRuntimeManagerSurface locale={locale} projection={projection} />
          <WorldRuntimeTimelineSurface locale={locale} projection={projection} />
          <WorldRuntimeStatusSurface locale={locale} projection={projection} />
        </div>
      ) : null}
    </section>
  );
}

export function WorldRuntimeMainSurface({
  locale,
  projection,
}: {
  readonly locale: SupportedLocale;
  readonly projection: WorldRuntimeProjection;
}): JSX.Element {
  return (
    <main className="world-runtime__main" data-world-runtime-surface="main">
      <header>
        <span>{copy(locale, '确定性基础运行', 'Deterministic Foundation Runtime')}</span>
        <h1>
          {projection.background || copy(locale, '未设置世界背景', 'World background is empty')}
        </h1>
        <p className="world-runtime__capability-boundary">
          {copy(
            locale,
            '当前仅提供 World 所有者提交的确定性基础运行；故事、玩法、完整世界体验、Agent Play、实时生成与外部引擎尚不可用。',
            'This surface provides only deterministic Foundation Runtime committed by the World owner. Story, Gameplay, complete World Experience, Agent Play, realtime generation, and external engines are unavailable.',
          )}
        </p>
      </header>
      <section>
        <h2>{copy(locale, '地点', 'Locations')}</h2>
        {projection.locations.length === 0 ? (
          <p>{copy(locale, '当前世界没有地点定义。', 'This World has no location definitions.')}</p>
        ) : (
          <div className="world-runtime__location-grid">
            {projection.locations.map((location) => (
              <article key={location.definitionId}>
                <strong>{location.name}</strong>
                <p>{location.description}</p>
              </article>
            ))}
          </div>
        )}
      </section>
      <section>
        <h2>{copy(locale, '当前事实', 'Current facts')}</h2>
        {projection.facts.length === 0 ? (
          <p>{copy(locale, '当前没有可见事实。', 'There are no visible facts.')}</p>
        ) : (
          <dl className="world-runtime__facts">
            {projection.facts.map((fact) => (
              <div key={fact.factId}>
                <dt>{fact.key}</dt>
                <dd>{displayJson(fact.value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </main>
  );
}

export function WorldRuntimeInteractionSurface({
  createIntentId,
  locale,
  now,
  operationError,
  pending,
  projection,
  submitAction,
}: {
  readonly createIntentId: () => string;
  readonly locale: SupportedLocale;
  readonly now: () => string;
  readonly operationError?: string;
  readonly pending: boolean;
  readonly projection: WorldRuntimeProjection;
  readonly submitAction: (intent: WorldActionIntent) => Promise<void>;
}): JSX.Element {
  const [action, setAction] = useState(projection.availableActions[0] ?? '');
  const [parameters, setParameters] = useState('{}');
  const [validationError, setValidationError] = useState<string>();

  useEffect(() => {
    if (!projection.availableActions.includes(action)) {
      setAction(projection.availableActions[0] ?? '');
    }
  }, [action, projection.availableActions]);

  const submit = () => {
    try {
      if (!action) throw new Error('No World action is available.');
      if (!projection.binding.actorId) throw new Error('The participant has no actor binding.');
      const parsed = JSON.parse(parameters) as unknown;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Action parameters must be a JSON object.');
      }
      const intent = parseWorldActionIntent({
        worldActionIntentId: createIntentId(),
        worldRunId: projection.binding.worldRunId,
        worldSaveId: projection.binding.worldSaveId,
        branchId: projection.binding.branchId,
        actorId: projection.binding.actorId,
        action,
        parameters: parsed,
        observedTimepoint: projection.timepoint,
        expectedWorldStateRevision: projection.worldStateRevision,
        createdAt: now(),
      });
      setValidationError(undefined);
      void submitAction(intent);
    } catch (error) {
      setValidationError(describeError(error));
    }
  };

  return (
    <aside className="world-runtime__interaction" data-world-runtime-surface="interaction">
      <h2>{copy(locale, '交互', 'Interaction')}</h2>
      <label>
        <span>{copy(locale, '动作', 'Action')}</span>
        <select value={action} onChange={(event) => setAction(event.currentTarget.value)}>
          {projection.availableActions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{copy(locale, '参数（JSON）', 'Parameters (JSON)')}</span>
        <textarea
          rows={5}
          value={parameters}
          onChange={(event) => setParameters(event.currentTarget.value)}
        />
      </label>
      {validationError || operationError ? (
        <p className="world-runtime__error" role="alert">
          {validationError ?? operationError}
        </p>
      ) : null}
      <button disabled={pending || !action} type="button" onClick={submit}>
        {pending
          ? copy(locale, '提交中...', 'Submitting...')
          : copy(locale, '提交动作', 'Submit action')}
      </button>
    </aside>
  );
}

export function WorldRuntimeManagerSurface({
  locale,
  projection,
}: {
  readonly locale: SupportedLocale;
  readonly projection: WorldRuntimeProjection;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const participants = projection.participants.filter((participant) => {
    const label = `${participant.participantId} ${participant.actorId ?? ''}`;
    return (
      normalizedQuery.length === 0 || label.toLocaleLowerCase(locale).includes(normalizedQuery)
    );
  });
  const branches = projection.branches.filter((branch) => {
    const label = `${branch.branchId} ${branch.active ? 'active' : 'read-only'}`;
    return (
      normalizedQuery.length === 0 || label.toLocaleLowerCase(locale).includes(normalizedQuery)
    );
  });
  return (
    <aside className="world-runtime__manager" data-world-runtime-surface="right-manager">
      <header className="world-runtime__manager-header">
        <strong>{copy(locale, '世界运行', 'World runtime')}</strong>
        <span>{projection.binding.branchId}</span>
      </header>
      <label className="world-runtime__manager-search">
        <SearchIcon size={14} aria-hidden="true" />
        <input
          aria-label={copy(locale, '搜索世界运行', 'Search World runtime')}
          placeholder={copy(locale, '搜索参与者或分支...', 'Search participants or branches...')}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </label>
      <section>
        <h2>{copy(locale, '参与者', 'Participants')}</h2>
        <ul>
          {participants.map((participant) => (
            <li key={participant.participantId}>
              <strong>{participant.participantId}</strong>
              <span>{participant.actorId ?? copy(locale, '观察者', 'Observer')}</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>{copy(locale, '分支', 'Branches')}</h2>
        <ul>
          {branches.map((branch) => (
            <li key={branch.branchId}>
              <strong>{branch.branchId}</strong>
              <span>
                {branch.active ? copy(locale, '当前', 'Active') : copy(locale, '只读', 'Read-only')}{' '}
                · {branch.eventCount}
              </span>
            </li>
          ))}
        </ul>
      </section>
      {participants.length === 0 && branches.length === 0 ? (
        <p className="world-runtime__manager-empty">
          {copy(locale, '没有匹配项。', 'No matching items.')}
        </p>
      ) : null}
    </aside>
  );
}

export function WorldRuntimeTimelineSurface({
  locale,
  projection,
}: {
  readonly locale: SupportedLocale;
  readonly projection: WorldRuntimeProjection;
}): JSX.Element {
  return (
    <section className="world-runtime__timeline" data-world-runtime-surface="bottom-timeline">
      <h2>{copy(locale, '时间线', 'Timeline')}</h2>
      {projection.timeline.length === 0 ? (
        <p>{copy(locale, '尚未提交世界事件。', 'No World events have been committed.')}</p>
      ) : (
        <ol>
          {projection.timeline.map((event) => (
            <li key={event.worldEventId}>
              <span>{event.timepoint}</span>
              <strong>{event.action}</strong>
              <small>{event.actorId}</small>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function WorldRuntimeStatusSurface({
  locale,
  projection,
}: {
  readonly locale: SupportedLocale;
  readonly projection: WorldRuntimeProjection;
}): JSX.Element {
  return (
    <footer className="world-runtime__status" data-world-runtime-surface="status">
      <span>{copy(locale, '确定性运行', 'Deterministic runtime')}</span>
      <span>t {projection.timepoint}</span>
      <span>state {projection.worldStateRevision}</span>
      <span>{projection.binding.branchId}</span>
      {projection.diagnostics.map((diagnostic) => (
        <span className="world-runtime__error" key={diagnostic.code}>
          {diagnostic.message}
        </span>
      ))}
    </footer>
  );
}

function RuntimeMessage({
  children,
  error = false,
}: {
  readonly children: ReactNode;
  readonly error?: boolean;
}): JSX.Element {
  return <div className={`world-runtime__message${error ? ' is-error' : ''}`}>{children}</div>;
}

function sameBinding(left: WorldRuntimeBinding, right: WorldRuntimeBinding): boolean {
  return (
    left.worldProjectId === right.worldProjectId &&
    left.worldVersionId === right.worldVersionId &&
    left.worldRunId === right.worldRunId &&
    left.worldSaveId === right.worldSaveId &&
    left.branchId === right.branchId &&
    left.participantId === right.participantId &&
    left.actorId === right.actorId
  );
}

function displayJson(value: WorldJsonValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function copy(locale: SupportedLocale, zh: string, en: string): string {
  return locale === 'zh-cn' ? zh : en;
}
