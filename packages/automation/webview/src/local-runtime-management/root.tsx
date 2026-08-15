import { useTranslation } from '@neko/ui/i18n/react';
import { useEffect, useState } from 'react';
import type {
  AutomationLocalRuntimeManagementProjection,
  AutomationLocalRuntimeManagementRuntime,
  AutomationLocalRuntimeProjection,
} from '@neko/automation-contracts/local-runtime-management';

export function AutomationLocalRuntimeManagementRoot({
  confirmAction,
  interactive,
  runtime,
  sourceId,
}: {
  readonly confirmAction: (message: string) => boolean | Promise<boolean>;
  readonly interactive: boolean;
  readonly runtime: AutomationLocalRuntimeManagementRuntime;
  readonly sourceId: string;
}): JSX.Element {
  const { t } = useTranslation();
  const [projection, setProjection] = useState<AutomationLocalRuntimeManagementProjection>();
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

  const run = async (
    operation: () => Promise<AutomationLocalRuntimeManagementProjection>,
  ): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      setProjection(await operation());
    } catch (reason: unknown) {
      setError(describeError(reason));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async (source: AutomationLocalRuntimeProjection): Promise<void> => {
    if (!source.authorized || busy) return;
    if (!(await confirmAction(t('home.capabilities.localRuntime.disconnectConfirm')))) return;
    await run(() => runtime.disconnect(source.sourceId, source.runtimeId));
  };

  return (
    <section
      className="automation-local-runtime-management"
      data-automation-local-runtime-management="true"
    >
      <header className="management-surface-header">
        <div>
          <p className="section-label">{t('home.capabilities.localRuntime.eyebrow')}</p>
          <h3>{t('home.capabilities.localRuntime.title')}</h3>
          <p>{t('home.capabilities.localRuntime.description')}</p>
        </div>
      </header>
      {error ? (
        <div className="management-surface-diagnostic" role="alert">
          {error}
        </div>
      ) : null}
      <div className="management-surface-list">
        {projection?.runtimes
          .filter((source) => source.sourceId === sourceId)
          .map((source) => (
            <article
              className="management-surface-row automation-local-runtime-row"
              data-local-runtime-state={source.state}
              key={source.sourceId}
            >
              <span className="management-surface-copy">
                <strong>{source.displayName}</strong>
                <small>{t('home.capabilities.localRuntime.userManaged')}</small>
                <code>{source.installationCommand}</code>
                {source.assets.map((asset) => (
                  <small key={asset.key}>
                    {asset.label}:{' '}
                    {asset.authorized
                      ? `${asset.displayName} · ${t(
                          `home.capabilities.localRuntime.asset.${asset.status}`,
                        )}`
                      : t('home.capabilities.localRuntime.asset.missing')}
                  </small>
                ))}
                {source.diagnostics.length > 0 ? (
                  <small role="status">
                    {source.diagnostics
                      .map((code) => t(`home.capabilities.localRuntime.diagnostic.${code}`))
                      .join(' · ')}
                  </small>
                ) : null}
              </span>
              <span className="management-surface-row-actions">
                <button
                  disabled={!interactive || busy}
                  type="button"
                  onClick={() => void run(() => runtime.openInstallationGuide(source.sourceId))}
                >
                  {t('home.capabilities.localRuntime.openGuide')}
                </button>
                <button
                  disabled={!interactive || busy}
                  type="button"
                  onClick={() => void run(() => runtime.copyInstallationCommand(source.sourceId))}
                >
                  {t('home.capabilities.localRuntime.copyCommand')}
                </button>
                {source.assets.map((asset) => (
                  <button
                    disabled={!interactive || busy}
                    key={asset.key}
                    type="button"
                    onClick={() =>
                      void run(() => runtime.authorizeAsset(source.sourceId, asset.key))
                    }
                  >
                    {asset.authorized
                      ? t('home.capabilities.localRuntime.reauthorizeAsset', {
                          asset: asset.label,
                        })
                      : t('home.capabilities.localRuntime.authorizeAsset', { asset: asset.label })}
                  </button>
                ))}
                {source.authorized ? (
                  <>
                    <button
                      disabled={!interactive || busy}
                      type="button"
                      onClick={() =>
                        void run(() => runtime.recheck(source.sourceId, source.runtimeId))
                      }
                    >
                      {t('home.capabilities.localRuntime.recheck')}
                    </button>
                    <button
                      disabled={!interactive || busy}
                      type="button"
                      onClick={() => void disconnect(source)}
                    >
                      {t('home.capabilities.localRuntime.disconnect')}
                    </button>
                  </>
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
