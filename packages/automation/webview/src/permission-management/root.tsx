import { useTranslation } from '@neko/ui/i18n/react';
import { useEffect, useState } from 'react';
import type { AutomationPermission } from '@neko/automation-contracts';
import type {
  AutomationPermissionManagementProjection,
  AutomationPermissionManagementRuntime,
} from '@neko/automation-contracts/permission-management';

export function AutomationPermissionManagementRoot({
  interactive,
  runtime,
}: {
  readonly interactive: boolean;
  readonly runtime: AutomationPermissionManagementRuntime;
}): JSX.Element {
  const { t } = useTranslation();
  const [projection, setProjection] = useState<AutomationPermissionManagementProjection>();
  const [busy, setBusy] = useState<AutomationPermission>();
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

  const request = async (permission: AutomationPermission): Promise<void> => {
    if (busy !== undefined) return;
    setBusy(permission);
    setError(undefined);
    try {
      setProjection(await runtime.request(permission));
    } catch (reason: unknown) {
      setError(describeError(reason));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <section
      className="automation-permission-management"
      data-automation-permission-management="true"
    >
      <header className="management-surface-header">
        <div>
          <p className="section-label">{t('home.capabilities.osPermission.eyebrow')}</p>
          <h3>{t('home.capabilities.osPermission.title')}</h3>
          <p>{t('home.capabilities.osPermission.description')}</p>
        </div>
      </header>
      {error ? (
        <div className="management-surface-diagnostic" role="alert">
          {error}
        </div>
      ) : null}
      <div className="management-surface-list">
        {projection?.permissions.map((permission) => (
          <article
            className="management-surface-row automation-permission-row"
            data-permission-status={permission.status}
            key={permission.permission}
          >
            <span className="management-surface-copy">
              <strong>
                {t(`home.capabilities.osPermission.permission.${permission.permission}`)}
              </strong>
              <small>{t(`home.capabilities.osPermission.status.${permission.status}`)}</small>
              {permission.diagnostics.map((diagnostic) => (
                <small key={diagnostic} role="status">
                  {t(`home.capabilities.osPermission.diagnostic.${diagnostic}`)}
                </small>
              ))}
            </span>
            <span className="management-surface-row-actions">
              {permission.requestAction !== 'unsupported' && permission.status !== 'granted' ? (
                <button
                  disabled={!interactive || busy !== undefined}
                  type="button"
                  onClick={() => void request(permission.permission)}
                >
                  {busy === permission.permission
                    ? t('home.capabilities.osPermission.requesting')
                    : t(`home.capabilities.osPermission.action.${permission.requestAction}`)}
                </button>
              ) : null}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

function describeError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
