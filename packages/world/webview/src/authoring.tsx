import { WorldAuthoringPreviewService } from '@neko/world-domain/application';
import { parseWorldJsonValue } from '@neko/world-domain/contracts';
import type {
  OpenNekoDesktopWorldAuthoringBridge,
  WorldAuthoringBinding,
  WorldAuthoringCommand,
  WorldAuthoringSnapshot,
  WorldDefinition,
  WorldJsonValue,
  WorldProject,
} from '@neko/world-domain/contracts';
import { WarningIcon } from '@neko/ui';
import type { SupportedLocale } from '@neko/ui/i18n';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

type AuthoringLoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'ready'; readonly snapshot: WorldAuthoringSnapshot };

interface DraftForm {
  readonly background: string;
  readonly locations: string;
  readonly organizations: string;
  readonly rules: string;
  readonly facts: string;
}

const previewService = new WorldAuthoringPreviewService();

export function WorldAuthoringStudioRoot({
  binding,
  host,
  initialSnapshot,
  locale,
  windowId,
}: {
  readonly binding: WorldAuthoringBinding;
  readonly host?: OpenNekoDesktopWorldAuthoringBridge['worldAuthoring'];
  readonly initialSnapshot?: WorldAuthoringSnapshot;
  readonly locale: SupportedLocale;
  readonly windowId: string;
}): JSX.Element {
  const [loadState, setLoadState] = useState<AuthoringLoadState>(() =>
    initialSnapshot ? { kind: 'ready', snapshot: initialSnapshot } : { kind: 'loading' },
  );
  const [pending, setPending] = useState<string>();
  const [diagnostic, setDiagnostic] = useState<string>();
  const initialSnapshotConsumed = useRef(initialSnapshot !== undefined);
  const reload = useCallback(async () => {
    setLoadState({ kind: 'loading' });
    setDiagnostic(undefined);
    try {
      if (!host) throw new Error('World authoring Host port is unavailable.');
      setLoadState({ kind: 'ready', snapshot: await host.getSnapshot(windowId, binding) });
    } catch (error) {
      setLoadState({ kind: 'failed', message: describeError(error) });
    }
  }, [binding, host, windowId]);

  useEffect(() => {
    if (initialSnapshotConsumed.current) {
      initialSnapshotConsumed.current = false;
      return;
    }
    void reload();
  }, [reload]);

  const execute = useCallback(
    async (command: WorldAuthoringCommand): Promise<void> => {
      setPending(command.operation);
      setDiagnostic(undefined);
      try {
        if (!host) throw new Error('World authoring Host port is unavailable.');
        setLoadState({ kind: 'ready', snapshot: await host.execute(windowId, binding, command) });
      } catch (error) {
        setDiagnostic(describeError(error));
        throw error;
      } finally {
        setPending(undefined);
      }
    },
    [binding, host, windowId],
  );

  if (loadState.kind === 'loading') {
    return <Status>{text(locale, '正在读取世界创作目标...', 'Loading world target...')}</Status>;
  }
  if (loadState.kind === 'failed') {
    return (
      <Status error>
        <span>{loadState.message}</span>
        <button type="button" onClick={() => void reload()}>
          {text(locale, '重试', 'Retry')}
        </button>
      </Status>
    );
  }

  return (
    <section className="world-authoring-studio" data-world-authoring-studio="true">
      {diagnostic ? <Diagnostic>{diagnostic}</Diagnostic> : null}
      {loadState.snapshot.diagnostics.map((item) => (
        <Diagnostic key={`${item.recordKind}:${item.recordId}`}>{item.message}</Diagnostic>
      ))}
      <WorldAuthoringForm
        execute={execute}
        locale={locale}
        pending={pending}
        snapshot={loadState.snapshot}
      />
      <WorldDraftPreview locale={locale} project={loadState.snapshot.project} />
    </section>
  );
}

function WorldAuthoringForm({
  execute,
  locale,
  pending,
  snapshot,
}: {
  readonly execute: (command: WorldAuthoringCommand) => Promise<void>;
  readonly locale: SupportedLocale;
  readonly pending?: string;
  readonly snapshot: WorldAuthoringSnapshot;
}): JSX.Element {
  const { project } = snapshot;
  const [form, setForm] = useState<DraftForm>(() => formFromProject(project));
  const [publicationLabel, setPublicationLabel] = useState('First publication');
  useEffect(() => setForm(formFromProject(project)), [project]);
  const busy = pending !== undefined;

  return (
    <main className="world-authoring__studio">
      <div className="world-authoring__pane-heading">
        <div>
          <span>{text(locale, '世界工作室', 'World Studio')}</span>
          <h2>{project.title}</h2>
        </div>
        <span className={`world-authoring__status is-${project.reviewStatus}`}>
          {reviewLabel(locale, project.reviewStatus)}
        </span>
      </div>
      <div className="world-authoring__form-grid">
        <Field wide label={text(locale, '背景设定', 'Background')}>
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
          hint={text(locale, '每行：名称 | 描述', 'One per line: name | description')}
          label={text(locale, '地点', 'Locations')}
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
          hint={text(locale, '每行：名称 | 描述', 'One per line: name | description')}
          label={text(locale, '组织', 'Organizations')}
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
          hint={text(locale, '每行一条规则', 'One rule per line')}
          label={text(locale, '世界规则', 'World rules')}
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
          hint={text(locale, '每行：key = JSON', 'One per line: key = JSON')}
          label={text(locale, '初始事实', 'Initial facts')}
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
      <div className="world-authoring__actions">
        <button
          disabled={busy}
          type="button"
          onClick={() =>
            void execute({
              operation: 'world-project-update-draft',
              input: {
                worldProjectId: project.worldProjectId,
                draft: definitionFromForm(form, project.draft),
              },
            })
          }
        >
          {text(locale, '保存草稿', 'Save draft')}
        </button>
        <select
          aria-label={text(locale, '审核状态', 'Review status')}
          disabled={busy}
          value={project.reviewStatus}
          onChange={(event) =>
            void execute({
              operation: 'world-project-set-review',
              input: {
                worldProjectId: project.worldProjectId,
                reviewStatus: parseReviewStatus(event.currentTarget.value),
              },
            })
          }
        >
          <option value="draft">{text(locale, '草稿', 'Draft')}</option>
          <option value="ready">{text(locale, '可发布', 'Ready')}</option>
          <option value="blocked">{text(locale, '阻塞', 'Blocked')}</option>
        </select>
        <input
          aria-label={text(locale, '版本名称', 'Version label')}
          value={publicationLabel}
          onChange={(event) => setPublicationLabel(event.currentTarget.value)}
        />
        <button
          className="is-primary"
          disabled={busy || project.reviewStatus !== 'ready' || !publicationLabel.trim()}
          type="button"
          onClick={() =>
            void execute({
              operation: 'world-version-publish',
              input: {
                worldProjectId: project.worldProjectId,
                worldVersionId: `world-version:${crypto.randomUUID()}`,
                label: publicationLabel.trim(),
              },
            })
          }
        >
          {text(locale, '发布版本', 'Publish version')}
        </button>
      </div>
      <div className="world-authoring__versions">
        <strong>{text(locale, '已发布版本', 'Published versions')}</strong>
        {snapshot.versions.length === 0 ? (
          <span>{text(locale, '尚无版本', 'No versions yet')}</span>
        ) : (
          snapshot.versions.map((version) => (
            <span key={version.worldVersionId}>
              {version.label} · {formatDate(version.publishedAt, locale)}
            </span>
          ))
        )}
      </div>
    </main>
  );
}

function WorldDraftPreview({
  locale,
  project,
}: {
  readonly locale: SupportedLocale;
  readonly project: WorldProject;
}): JSX.Element {
  const preview = previewService.create(project);
  return (
    <aside className="world-authoring-preview" data-world-authoring-preview="true">
      <div className="world-authoring__pane-heading">
        <div>
          <span>{text(locale, '草稿检查', 'Draft inspection')}</span>
          <h2>{text(locale, '创作预览', 'Authoring preview')}</h2>
        </div>
        <small>
          {preview.sourceReferenceCount} {text(locale, '个来源', 'source references')}
        </small>
      </div>
      <p>{preview.background || text(locale, '尚未填写背景。', 'No background yet.')}</p>
      <dl className="world-authoring-preview__counts">
        <div>
          <dt>{text(locale, '地点', 'Locations')}</dt>
          <dd>{preview.locations.length}</dd>
        </div>
        <div>
          <dt>{text(locale, '组织', 'Organizations')}</dt>
          <dd>{preview.organizations.length}</dd>
        </div>
        <div>
          <dt>{text(locale, '规则', 'Rules')}</dt>
          <dd>{preview.rules.length}</dd>
        </div>
        <div>
          <dt>{text(locale, '初始事实', 'Initial facts')}</dt>
          <dd>{preview.initialFacts.length}</dd>
        </div>
      </dl>
      {preview.diagnostics.length > 0 ? (
        <ul className="world-authoring-preview__diagnostics">
          {preview.diagnostics.map((item) => (
            <li key={item.code}>{item.message}</li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}

function formFromProject(project: WorldProject): DraftForm {
  return {
    background: project.draft.background,
    locations: project.draft.locations
      .map((item) => `${item.name} | ${item.description}`)
      .join('\n'),
    organizations: project.draft.organizations
      .map((item) => `${item.name} | ${item.description}`)
      .join('\n'),
    rules: project.draft.rules.map((item) => item.statement).join('\n'),
    facts: project.draft.initialFacts
      .map((item) => `${item.key} = ${JSON.stringify(item.value)}`)
      .join('\n'),
  };
}

function definitionFromForm(form: DraftForm, current: WorldDefinition): WorldDefinition {
  const locations = parseNamedLines(form.locations, current.locations, 'world-location');
  const organizations = parseNamedLines(
    form.organizations,
    current.organizations,
    'world-organization',
  );
  const rules = nonEmptyLines(form.rules).map((statement) => {
    const existing = current.rules.find((item) => item.statement === statement);
    return {
      ruleId: existing?.ruleId ?? `world-rule:${crypto.randomUUID()}`,
      statement,
      sourceRefIds: existing?.sourceRefIds ?? [],
    };
  });
  const initialFacts = nonEmptyLines(form.facts).map((line) => {
    const separator = line.indexOf('=');
    if (separator < 1) throw new Error(`Invalid fact line '${line}'. Expected key = JSON.`);
    const key = line.slice(0, separator).trim();
    const existing = current.initialFacts.find((item) => item.key === key);
    return {
      factId: existing?.factId ?? `world-fact:${crypto.randomUUID()}`,
      key,
      value: parseJson(line.slice(separator + 1).trim()),
      visibility: existing?.visibility ?? { kind: 'public' as const },
      knownByActorIds: existing?.knownByActorIds ?? [],
    };
  });
  return {
    background: form.background,
    worldBook: current.worldBook,
    locations,
    organizations,
    rules,
    initialFacts,
  };
}

function parseNamedLines(
  value: string,
  current: WorldDefinition['locations'],
  prefix: string,
): WorldDefinition['locations'] {
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
    return parseWorldJsonValue(JSON.parse(value));
  } catch {
    throw new Error(`Invalid JSON value '${value}'.`);
  }
}

function parseReviewStatus(value: string): WorldProject['reviewStatus'] {
  if (value === 'draft' || value === 'ready' || value === 'blocked') return value;
  throw new Error(`Unknown World review status '${value}'.`);
}

function Field({
  children,
  hint,
  label,
  wide,
}: {
  readonly children: ReactNode;
  readonly hint?: string;
  readonly label: string;
  readonly wide?: boolean;
}): JSX.Element {
  return (
    <label className={wide ? 'is-wide' : undefined}>
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function Status({ children, error }: { readonly children: ReactNode; readonly error?: boolean }) {
  return (
    <section className={`world-authoring world-authoring__loading${error ? ' is-error' : ''}`}>
      {children}
    </section>
  );
}

function Diagnostic({ children }: { readonly children: ReactNode }): JSX.Element {
  return (
    <div className="world-authoring__diagnostic" role="alert">
      <WarningIcon size={14} />
      {children}
    </div>
  );
}

function reviewLabel(locale: SupportedLocale, status: WorldProject['reviewStatus']): string {
  if (status === 'ready') return text(locale, '可发布', 'Ready');
  if (status === 'blocked') return text(locale, '阻塞', 'Blocked');
  return text(locale, '草稿', 'Draft');
}

function formatDate(value: string, locale: SupportedLocale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
}

function text(locale: SupportedLocale, zh: string, en: string): string {
  return locale.startsWith('zh') ? zh : en;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
