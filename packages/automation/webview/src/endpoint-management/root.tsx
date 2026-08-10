import { useTranslation } from '@neko/ui/i18n/react';
import { useEffect, useState } from 'react';
import type {
  AutomationEndpointAuthorizationInput,
  AutomationEndpointManagementProjection,
  AutomationEndpointManagementRuntime,
  AutomationEndpointProjection,
} from '@neko/automation-contracts/endpoint-management';

interface EndpointDraft {
  readonly url: string;
  readonly authorizationKind: AutomationEndpointAuthorizationInput['kind'];
  readonly headerName: string;
  readonly secret: string;
}

const EMPTY_DRAFT: EndpointDraft = {
  url: '',
  authorizationKind: 'none',
  headerName: 'X-API-Key',
  secret: '',
};

export function AutomationEndpointManagementRoot({
  confirmAction,
  interactive,
  runtime,
}: {
  readonly confirmAction: (message: string) => boolean | Promise<boolean>;
  readonly interactive: boolean;
  readonly runtime: AutomationEndpointManagementRuntime;
}): JSX.Element {
  const { t } = useTranslation();
  const [projection, setProjection] = useState<AutomationEndpointManagementProjection>();
  const [editing, setEditing] = useState<string>();
  const [draft, setDraft] = useState<EndpointDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!interactive) return;
    let active = true;
    void runtime.getSnapshot().then(
      (next) => {
        if (active) setProjection(next);
      },
      (reason: unknown) => {
        if (active) setError(describeError(reason));
      },
    );
    return () => {
      active = false;
    };
  }, [interactive, runtime]);

  const save = async (endpoint: AutomationEndpointProjection): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      setProjection(
        await runtime.configure({
          connectorId: endpoint.connectorId,
          endpointId: endpoint.endpointId || crypto.randomUUID(),
          url: draft.url,
          authorization: authorization(draft),
        }),
      );
      setEditing(undefined);
      setDraft(EMPTY_DRAFT);
    } catch (reason: unknown) {
      setError(describeError(reason));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (endpoint: AutomationEndpointProjection): Promise<void> => {
    if (!endpoint.configured || busy) return;
    if (!(await confirmAction(t('home.capabilities.endpoint.removeConfirm')))) return;
    setBusy(true);
    setError(undefined);
    try {
      setProjection(await runtime.remove(endpoint.connectorId, endpoint.endpointId));
    } catch (reason: unknown) {
      setError(describeError(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="automation-endpoint-management" data-automation-endpoint-management="true">
      <header className="management-surface-header">
        <div>
          <p className="section-label">{t('home.capabilities.endpoint.eyebrow')}</p>
          <h3>{t('home.capabilities.endpoint.title')}</h3>
          <p>{t('home.capabilities.endpoint.description')}</p>
        </div>
      </header>
      {error ? (
        <div className="management-surface-diagnostic" role="alert">
          {error}
        </div>
      ) : null}
      <div className="management-surface-list">
        {projection?.endpoints.map((endpoint) => (
          <article
            className="management-surface-row automation-endpoint-row"
            data-endpoint-qualification={endpoint.qualificationStatus}
            key={endpoint.connectorId}
          >
            <span className="management-surface-copy">
              <strong>{endpoint.displayName}</strong>
              <small>
                {t('home.capabilities.endpoint.userManaged')} ·{' '}
                {t(`home.capabilities.endpoint.health.${endpoint.healthStatus}`)} ·{' '}
                {t(`home.capabilities.endpoint.qualification.${endpoint.qualificationStatus}`)}
              </small>
              <small>
                {endpoint.configured
                  ? `${endpoint.endpointUrl} · ${t(
                      `home.capabilities.endpoint.authorization.${endpoint.authorizationState}`,
                    )}`
                  : t('home.capabilities.endpoint.notConfigured')}
              </small>
              {endpoint.diagnostics.length > 0 ? (
                <small role="status">
                  {endpoint.diagnostics
                    .map((code) => t(`home.capabilities.endpoint.diagnostic.${code}`))
                    .join(' · ')}
                </small>
              ) : null}
              {editing === endpoint.connectorId ? (
                <div className="automation-endpoint-form">
                  <label>
                    <span>{t('home.capabilities.endpoint.url')}</span>
                    <input
                      disabled={busy}
                      placeholder="http://127.0.0.1:8000/mcp"
                      value={draft.url}
                      onChange={(event) => {
                        const url = event.currentTarget.value;
                        setDraft((current) => ({ ...current, url }));
                      }}
                    />
                  </label>
                  <label>
                    <span>{t('home.capabilities.endpoint.authorization')}</span>
                    <select
                      disabled={busy}
                      value={draft.authorizationKind}
                      onChange={(event) => {
                        const authorizationKind = event.currentTarget
                          .value as EndpointDraft['authorizationKind'];
                        setDraft((current) => ({
                          ...current,
                          authorizationKind,
                        }));
                      }}
                    >
                      <option value="none">{t('home.capabilities.endpoint.auth.none')}</option>
                      <option value="bearer">{t('home.capabilities.endpoint.auth.bearer')}</option>
                      <option value="header">{t('home.capabilities.endpoint.auth.header')}</option>
                    </select>
                  </label>
                  {draft.authorizationKind === 'header' ? (
                    <label>
                      <span>{t('home.capabilities.endpoint.headerName')}</span>
                      <input
                        disabled={busy}
                        value={draft.headerName}
                        onChange={(event) => {
                          const headerName = event.currentTarget.value;
                          setDraft((current) => ({
                            ...current,
                            headerName,
                          }));
                        }}
                      />
                    </label>
                  ) : null}
                  {draft.authorizationKind !== 'none' ? (
                    <label>
                      <span>{t('home.capabilities.endpoint.secret')}</span>
                      <input
                        autoComplete="off"
                        disabled={busy}
                        type="password"
                        value={draft.secret}
                        onChange={(event) => {
                          const secret = event.currentTarget.value;
                          setDraft((current) => ({
                            ...current,
                            secret,
                          }));
                        }}
                      />
                    </label>
                  ) : null}
                  <div className="management-surface-actions">
                    <button disabled={busy} type="button" onClick={() => void save(endpoint)}>
                      {t('home.capabilities.endpoint.saveAndCheck')}
                    </button>
                    <button
                      disabled={busy}
                      type="button"
                      onClick={() => {
                        setEditing(undefined);
                        setDraft(EMPTY_DRAFT);
                      }}
                    >
                      {t('home.capabilities.endpoint.cancel')}
                    </button>
                  </div>
                </div>
              ) : null}
            </span>
            <span className="management-surface-row-actions">
              <button
                disabled={!interactive || busy}
                type="button"
                onClick={() => {
                  setEditing(endpoint.connectorId);
                  setDraft({ ...EMPTY_DRAFT, url: endpoint.endpointUrl });
                }}
              >
                {endpoint.configured
                  ? t('home.capabilities.endpoint.reconfigure')
                  : t('home.capabilities.endpoint.configure')}
              </button>
              {endpoint.configured ? (
                <button
                  disabled={!interactive || busy}
                  type="button"
                  onClick={() => void remove(endpoint)}
                >
                  {t('home.capabilities.endpoint.remove')}
                </button>
              ) : null}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

function authorization(draft: EndpointDraft): AutomationEndpointAuthorizationInput {
  switch (draft.authorizationKind) {
    case 'none':
      return { kind: 'none' };
    case 'bearer':
      return { kind: 'bearer', secret: draft.secret };
    case 'header':
      return { kind: 'header', name: draft.headerName, secret: draft.secret };
  }
}

function describeError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
