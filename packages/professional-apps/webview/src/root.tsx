import {
  ChevronRightIcon,
  PackageIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  WarningIcon,
} from '@neko/ui';
import { useTranslation } from '@neko/ui/i18n/react';
import { Button, Dialog, EmptyState } from '@neko/ui/primitives';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  ProfessionalApplicationBinding,
  ProfessionalApplicationItemProjection,
  ProfessionalApplicationManagementProjection,
  ProfessionalApplicationManagementRuntime,
} from '@neko/professional-apps-contracts';

export function ProfessionalApplicationManagementRoot({
  compactHeading = false,
  interactive,
  runtime,
  toolbarControls,
}: {
  readonly compactHeading?: boolean;
  readonly interactive: boolean;
  readonly runtime: ProfessionalApplicationManagementRuntime;
  readonly toolbarControls?: ReactNode;
}): JSX.Element {
  const { t } = useTranslation();
  const [projection, setProjection] = useState<ProfessionalApplicationManagementProjection>();
  const [query, setQuery] = useState('');
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'added'>('all');
  const [loading, setLoading] = useState(false);
  const [pendingId, setPendingId] = useState<string>();
  const [error, setError] = useState<string>();
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string>();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [removeConfirmationId, setRemoveConfirmationId] = useState<string>();
  const [endpointDrafts, setEndpointDrafts] = useState<Readonly<Record<string, string>>>({});
  const [workflowDrafts, setWorkflowDrafts] = useState<Readonly<Record<string, string>>>({});
  const [launchPreferenceDrafts, setLaunchPreferenceDrafts] = useState<
    Readonly<Record<string, ProfessionalApplicationBinding['launchPreference']>>
  >({});

  const refresh = (): void => {
    if (!interactive || loading) return;
    setLoading(true);
    setError(undefined);
    void runtime
      .getSnapshot()
      .then((next) => {
        setProjection(next);
        setEndpointDrafts(
          Object.fromEntries(
            next.items.map((item) => [item.profile.id, item.binding?.endpoint ?? '']),
          ),
        );
        setWorkflowDrafts(
          Object.fromEntries(
            next.items.map((item) => [item.profile.id, item.binding?.defaultWorkflowId ?? '']),
          ),
        );
        setLaunchPreferenceDrafts(
          Object.fromEntries(
            next.items.map((item) => [
              item.profile.id,
              item.binding?.launchPreference ?? 'reuse-qualified',
            ]),
          ),
        );
      })
      .catch((reason: unknown) => setError(toMessage(reason)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    // The runtime identity owns this Root's lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, runtime]);

  const items = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return (projection?.items ?? []).filter(
      (item) =>
        (catalogFilter === 'all' || item.binding !== undefined) &&
        `${item.profile.name} ${item.profile.description} ${item.profile.category}`
          .toLocaleLowerCase()
          .includes(normalized),
    );
  }, [catalogFilter, projection, query]);
  const selectedItem = projection?.items.find((item) => item.profile.id === selectedIntegrationId);
  const removableItem = projection?.items.find((item) => item.profile.id === removeConfirmationId);
  const availableToAdd = projection?.items.filter((item) => !item.binding) ?? [];

  const runMutation = (
    integrationId: string,
    mutation: () => Promise<ProfessionalApplicationManagementProjection>,
    after?: () => void,
  ): void => {
    setPendingId(integrationId);
    setError(undefined);
    void mutation()
      .then((next) => {
        setProjection(next);
        after?.();
      })
      .catch((reason: unknown) => setError(toMessage(reason)))
      .finally(() => setPendingId(undefined));
  };

  const add = (integrationId: string): void => {
    runMutation(
      integrationId,
      () => runtime.addBinding(integrationId),
      () => {
        setAddDialogOpen(false);
        setSelectedIntegrationId(integrationId);
      },
    );
  };

  const setEnabled = (item: ProfessionalApplicationItemProjection, enabled: boolean): void => {
    runMutation(item.profile.id, () => runtime.setEnabled(item.profile.id, enabled));
  };

  const remove = (integrationId: string): void => {
    runMutation(
      integrationId,
      () => runtime.removeBinding(integrationId),
      () => {
        setRemoveConfirmationId(undefined);
        setSelectedIntegrationId(undefined);
      },
    );
  };

  const save = (item: ProfessionalApplicationItemProjection): void => {
    const endpoint = endpointDrafts[item.profile.id]?.trim();
    const defaultWorkflowId = workflowDrafts[item.profile.id]?.trim();
    const binding: ProfessionalApplicationBinding = {
      integrationId: item.profile.id,
      ...(item.binding?.applicationLocator
        ? { applicationLocator: item.binding.applicationLocator }
        : {}),
      ...(endpoint ? { endpoint } : {}),
      launchPreference: launchPreferenceDrafts[item.profile.id] ?? 'reuse-qualified',
      ...(defaultWorkflowId ? { defaultWorkflowId } : {}),
    };
    setPendingId(item.profile.id);
    setError(undefined);
    void runtime
      .updateBinding(binding)
      .then(setProjection)
      .catch((reason: unknown) => setError(toMessage(reason)))
      .finally(() => setPendingId(undefined));
  };

  const launch = (integrationId: string): void => {
    setPendingId(integrationId);
    setError(undefined);
    void runtime
      .launch(integrationId)
      .catch((reason: unknown) => setError(toMessage(reason)))
      .finally(() => setPendingId(undefined));
  };

  const selectApplication = (integrationId: string): void => {
    setPendingId(integrationId);
    setError(undefined);
    void runtime
      .selectApplication(integrationId)
      .then(setProjection)
      .catch((reason: unknown) => setError(toMessage(reason)))
      .finally(() => setPendingId(undefined));
  };

  return (
    <section className="professional-application-management-root">
      {compactHeading ? null : (
        <header className="management-surface-header">
          <div>
            <p className="section-label">{t('professionalApps.eyebrow')}</p>
            <h2>{t('professionalApps.title')}</h2>
            <p>{t('professionalApps.description')}</p>
          </div>
        </header>
      )}

      <div className="management-surface-toolbar">
        <label className="management-search-field">
          <SearchIcon size={16} />
          <input
            aria-label={t('professionalApps.search')}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <div className="management-segmented-control" role="group">
          <button
            aria-pressed={catalogFilter === 'all'}
            onClick={() => setCatalogFilter('all')}
            type="button"
          >
            {t('professionalApps.all')} {projection?.items.length ?? 0}
          </button>
          <button
            aria-pressed={catalogFilter === 'added'}
            onClick={() => setCatalogFilter('added')}
            type="button"
          >
            {t('professionalApps.added')}{' '}
            {projection?.items.filter((item) => item.binding).length ?? 0}
          </button>
        </div>
        <Button
          data-professional-application-action="add"
          disabled={!interactive || loading || availableToAdd.length === 0}
          onClick={() => setAddDialogOpen(true)}
          size="sm"
        >
          <PlusIcon size={14} />
          {t('professionalApps.add')}
        </Button>
        {toolbarControls}
      </div>

      {error && !selectedItem ? (
        <div className="management-surface-diagnostic" role="alert">
          <WarningIcon size={17} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="management-surface-list is-grid" data-empty={items.length === 0} role="list">
        {items.length === 0 ? (
          <EmptyState
            fill
            icon={<PackageIcon size={24} />}
            title={loading ? t('professionalApps.loading') : t('professionalApps.empty')}
          />
        ) : null}
        {items.map((item) => (
          <article
            aria-label={item.profile.name}
            className="management-surface-row professional-application-row"
            data-lifecycle-state={
              item.binding ? (item.enabled ? 'enabled' : 'disabled') : 'not-added'
            }
            data-selected={selectedIntegrationId === item.profile.id}
            key={item.profile.id}
            role="listitem"
          >
            <button
              aria-haspopup="dialog"
              aria-pressed={selectedIntegrationId === item.profile.id}
              className="professional-application-row__open"
              type="button"
              onClick={() => setSelectedIntegrationId(item.profile.id)}
            >
              <span className="professional-application-row__heading">
                <span className="management-surface-icon">
                  <PackageIcon size={18} />
                </span>
                <span className="professional-application-row__title">
                  <strong>{item.profile.name}</strong>
                </span>
                <span className="professional-application-row__affordance" aria-hidden="true">
                  <ChevronRightIcon size={14} />
                </span>
              </span>
              <small className="professional-application-row__summary">
                {item.profile.description}
              </small>
              <small
                className="professional-application-row__readiness"
                data-professional-application-readiness={item.readiness.state}
              >
                {item.binding
                  ? item.enabled
                    ? t('professionalApps.enabled')
                    : t('professionalApps.disabled')
                  : t('professionalApps.notAdded')}{' '}
                · {item.readiness.state} ·{' '}
                {t('professionalApps.availableOperations', {
                  count: item.readiness.availableOperationIds.length,
                })}
              </small>
              {item.readiness.diagnostics.map((diagnostic) => (
                <small
                  className="professional-application-row__diagnostic"
                  key={diagnostic.code}
                  role="alert"
                >
                  {diagnostic.message}
                </small>
              ))}
            </button>
          </article>
        ))}
      </div>
      {selectedItem ? (
        <ProfessionalApplicationDetailOverlay
          endpoint={endpointDrafts[selectedItem.profile.id] ?? ''}
          error={error}
          interactive={interactive}
          item={selectedItem}
          launchPreference={launchPreferenceDrafts[selectedItem.profile.id] ?? 'reuse-qualified'}
          onClose={() => setSelectedIntegrationId(undefined)}
          onEndpointChange={(endpoint) =>
            setEndpointDrafts((current) => ({
              ...current,
              [selectedItem.profile.id]: endpoint,
            }))
          }
          onLaunch={() => launch(selectedItem.profile.id)}
          onLaunchPreferenceChange={(launchPreference) =>
            setLaunchPreferenceDrafts((current) => ({
              ...current,
              [selectedItem.profile.id]: launchPreference,
            }))
          }
          onSave={() => save(selectedItem)}
          onSetEnabled={(enabled) => setEnabled(selectedItem, enabled)}
          onRemove={() => setRemoveConfirmationId(selectedItem.profile.id)}
          onSelectApplication={() => selectApplication(selectedItem.profile.id)}
          onWorkflowChange={(defaultWorkflowId) =>
            setWorkflowDrafts((current) => ({
              ...current,
              [selectedItem.profile.id]: defaultWorkflowId,
            }))
          }
          pending={pendingId === selectedItem.profile.id}
          workflow={workflowDrafts[selectedItem.profile.id] ?? ''}
        />
      ) : null}
      <Dialog
        closeLabel={t('professionalApps.closeAdd')}
        description={t('professionalApps.addDescription')}
        onOpenChange={setAddDialogOpen}
        open={addDialogOpen}
        title={t('professionalApps.add')}
      >
        <div className="professional-application-add-list">
          {availableToAdd.map((item) => (
            <Button
              disabled={!interactive || pendingId === item.profile.id}
              key={item.profile.id}
              onClick={() => add(item.profile.id)}
              variant="secondary"
            >
              <PackageIcon size={16} />
              <span>{item.profile.name}</span>
            </Button>
          ))}
        </div>
      </Dialog>
      <Dialog
        closeLabel={t('professionalApps.cancelRemove')}
        description={t('professionalApps.removeDescription')}
        onOpenChange={(open) => {
          if (!open) setRemoveConfirmationId(undefined);
        }}
        open={removableItem !== undefined}
        title={t('professionalApps.removeTitle')}
      >
        <div className="professional-application-remove-actions">
          <Button onClick={() => setRemoveConfirmationId(undefined)} variant="secondary">
            {t('professionalApps.cancel')}
          </Button>
          <Button
            disabled={!removableItem || pendingId === removableItem.profile.id}
            onClick={() => removableItem && remove(removableItem.profile.id)}
          >
            <TrashIcon size={14} />
            {t('professionalApps.remove')}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}

function ProfessionalApplicationDetailOverlay({
  endpoint,
  error,
  interactive,
  item,
  launchPreference,
  onClose,
  onEndpointChange,
  onLaunch,
  onLaunchPreferenceChange,
  onSave,
  onSetEnabled,
  onRemove,
  onSelectApplication,
  onWorkflowChange,
  pending,
  workflow,
}: {
  readonly endpoint: string;
  readonly error?: string;
  readonly interactive: boolean;
  readonly item: ProfessionalApplicationItemProjection;
  readonly launchPreference: ProfessionalApplicationBinding['launchPreference'];
  readonly onClose: () => void;
  readonly onEndpointChange: (value: string) => void;
  readonly onLaunch: () => void;
  readonly onLaunchPreferenceChange: (
    value: ProfessionalApplicationBinding['launchPreference'],
  ) => void;
  readonly onSave: () => void;
  readonly onSetEnabled: (enabled: boolean) => void;
  readonly onRemove: () => void;
  readonly onSelectApplication: () => void;
  readonly onWorkflowChange: (value: string) => void;
  readonly pending: boolean;
  readonly workflow: string;
}): JSX.Element {
  const { t } = useTranslation();
  const canLaunch =
    item.readiness.availableOperationIds.some((operationId) =>
      item.profile.operations.some(
        (operation) => operation.id === operationId && operation.kind === 'launch',
      ),
    ) && item.enabled;
  return (
    <Dialog
      className="extension-detail-overlay professional-application-detail-overlay"
      closeLabel={t('professionalApps.closeDetails')}
      description={item.profile.description}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
      title={item.profile.name}
    >
      <div className="extension-detail-overlay__content" data-professional-application-detail>
        <header className="extension-detail-overlay__identity">
          <span className="extension-detail-overlay__avatar">
            <PackageIcon size={24} />
          </span>
          <div>
            <div className="extension-detail-overlay__tags">
              <span>{item.profile.category}</span>
              <span data-professional-application-readiness={item.readiness.state}>
                {item.readiness.state} ·{' '}
                {t('professionalApps.availableOperations', {
                  count: item.readiness.availableOperationIds.length,
                })}
              </span>
            </div>
          </div>
        </header>

        <p className="professional-application-install-policy">
          {t('professionalApps.noAutomaticInstall')}
        </p>

        {error ? (
          <div className="management-surface-diagnostic" role="alert">
            <WarningIcon size={17} />
            <span>{error}</span>
          </div>
        ) : null}
        {item.readiness.diagnostics.map((diagnostic) => (
          <div className="management-surface-diagnostic" key={diagnostic.code} role="alert">
            <WarningIcon size={17} />
            <span>{diagnostic.message}</span>
          </div>
        ))}

        <section className="professional-application-detail__section">
          <h3>{t('professionalApps.configuration')}</h3>
          <div className="professional-application-detail__form">
            {item.profile.configurable.endpoint ? (
              <label>
                <span>{t('professionalApps.endpoint')}</span>
                <input
                  aria-label={`${item.profile.name} ${t('professionalApps.endpoint')}`}
                  disabled={!interactive || pending || !item.binding}
                  value={endpoint}
                  onChange={(event) => onEndpointChange(event.currentTarget.value)}
                />
              </label>
            ) : null}
            {item.profile.configurable.defaultWorkflow ? (
              <label>
                <span>{t('professionalApps.defaultWorkflow')}</span>
                <input
                  aria-label={`${item.profile.name} ${t('professionalApps.defaultWorkflow')}`}
                  disabled={!interactive || pending || !item.binding}
                  value={workflow}
                  onChange={(event) => onWorkflowChange(event.currentTarget.value)}
                />
              </label>
            ) : null}
            <label>
              <span>{t('professionalApps.launchPreference')}</span>
              <select
                aria-label={`${item.profile.name} ${t('professionalApps.launchPreference')}`}
                disabled={!interactive || pending || !item.binding}
                value={launchPreference}
                onChange={(event) =>
                  onLaunchPreferenceChange(
                    event.currentTarget.value as ProfessionalApplicationBinding['launchPreference'],
                  )
                }
              >
                <option value="reuse-qualified">{t('professionalApps.reuseQualified')}</option>
                <option value="launch-new">{t('professionalApps.launchNew')}</option>
              </select>
            </label>
          </div>
        </section>

        <section className="professional-application-detail__section">
          <h3>{t('professionalApps.actions')}</h3>
          <div className="professional-application-detail__actions">
            {item.binding ? (
              <Button
                aria-pressed={item.enabled}
                disabled={!interactive || pending || !item.binding}
                onClick={() => onSetEnabled(!item.enabled)}
                size="sm"
                variant="secondary"
              >
                {item.enabled ? t('professionalApps.disable') : t('professionalApps.enable')}
              </Button>
            ) : null}
            {item.profile.officialDownloadUrl && item.readiness.state === 'not-installed' ? (
              <a href={item.profile.officialDownloadUrl} rel="noreferrer" target="_blank">
                {t('professionalApps.officialDownload')}
              </a>
            ) : null}
            {item.profile.configurable.applicationLocator ? (
              <Button
                disabled={!interactive || pending || !item.binding}
                onClick={onSelectApplication}
                size="sm"
                variant="secondary"
              >
                {item.binding?.applicationLocator
                  ? t('professionalApps.reselectApplication')
                  : t('professionalApps.selectApplication')}
              </Button>
            ) : null}
            {item.profile.configurable.endpoint ? (
              <Button
                disabled={!interactive || pending}
                onClick={onSave}
                size="sm"
                variant="secondary"
              >
                {t('professionalApps.save')}
              </Button>
            ) : null}
            <Button disabled={!interactive || pending || !canLaunch} onClick={onLaunch} size="sm">
              {t('professionalApps.open')}
            </Button>
            {item.binding ? (
              <Button
                disabled={!interactive || pending}
                onClick={onRemove}
                size="sm"
                variant="secondary"
              >
                <TrashIcon size={14} />
                {t('professionalApps.remove')}
              </Button>
            ) : null}
          </div>
        </section>
      </div>
    </Dialog>
  );
}

function toMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
