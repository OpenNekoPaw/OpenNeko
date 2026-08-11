import { Button } from '@neko/ui';
import { useTranslation } from '@neko/ui/i18n/react';
import { useEffect, useState } from 'react';
import type {
  AutomationTargetSelectionCandidate,
  AutomationTargetSelectionProjection,
  AutomationTargetSelectionRuntime,
} from '@neko/automation-contracts/target-selection';

export function AutomationTargetSelectionRoot({
  runtime,
}: {
  readonly runtime: AutomationTargetSelectionRuntime;
}): JSX.Element | null {
  const { t } = useTranslation();
  const [pending, setPending] = useState<readonly AutomationTargetSelectionProjection[]>([]);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    let refreshSequence = 0;
    const refresh = (): void => {
      refreshSequence += 1;
      const sequence = refreshSequence;
      void runtime.listPending().then(
        (next) => {
          if (!active || sequence !== refreshSequence) return;
          setPending(next);
          setError(undefined);
        },
        (reason: unknown) => {
          if (!active || sequence !== refreshSequence) return;
          setError(describeError(reason));
        },
      );
    };
    const unsubscribe = runtime.subscribe(refresh);
    refresh();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [runtime]);

  const resolve = async (authorizationId: string, targetKey?: string): Promise<void> => {
    if (busy !== undefined) return;
    setBusy(authorizationId);
    setError(undefined);
    try {
      await runtime.resolve(
        targetKey === undefined
          ? { authorizationId, decision: 'cancel' }
          : { authorizationId, decision: 'select', targetKey },
      );
      setPending((current) =>
        current.filter((projection) => projection.authorizationId !== authorizationId),
      );
    } catch (reason: unknown) {
      setError(describeError(reason));
    } finally {
      setBusy(undefined);
    }
  };

  if (pending.length === 0 && error === undefined) return null;

  return (
    <aside
      aria-label={t('automation.targetSelection.title')}
      className="automation-target-selection"
      data-automation-target-selection="true"
    >
      {error ? (
        <div className="automation-target-selection__diagnostic" role="alert">
          {error}
        </div>
      ) : null}
      {pending.map((projection) => (
        <section
          className="automation-target-selection__request"
          data-authorization-id={projection.authorizationId}
          key={projection.authorizationId}
        >
          <header className="automation-target-selection__header">
            <div>
              <p className="automation-target-selection__eyebrow">
                {t('automation.targetSelection.eyebrow')}
              </p>
              <h3>{t('automation.targetSelection.title')}</h3>
            </div>
            <span className="automation-target-selection__provider">
              {projection.provider.providerId}
            </span>
          </header>
          <p className="automation-target-selection__description">
            {t('automation.targetSelection.description')}
          </p>
          <dl className="automation-target-selection__policy">
            <div>
              <dt>{t('automation.targetSelection.mode')}</dt>
              <dd>{t(`automation.targetSelection.mode.${projection.mode}`)}</dd>
            </div>
            <div>
              <dt>{t('automation.targetSelection.budget')}</dt>
              <dd>
                {t('automation.targetSelection.budgetValue', {
                  steps: projection.stepBudget,
                  seconds: Math.ceil(projection.timeoutMs / 1_000),
                })}
              </dd>
            </div>
          </dl>
          <div className="automation-target-selection__candidates">
            {projection.candidates.map((candidate) => (
              <Button
                className="automation-target-selection__candidate"
                disabled={busy !== undefined}
                key={candidate.targetKey}
                onClick={() => void resolve(projection.authorizationId, candidate.targetKey)}
                size="sm"
                variant="secondary"
              >
                <CandidateLabel candidate={candidate} />
              </Button>
            ))}
          </div>
          <div className="automation-target-selection__actions">
            <Button
              disabled={busy !== undefined}
              onClick={() => void resolve(projection.authorizationId)}
              size="xs"
              variant="ghost"
            >
              {busy === projection.authorizationId
                ? t('automation.targetSelection.resolving')
                : t('automation.targetSelection.cancel')}
            </Button>
          </div>
        </section>
      ))}
    </aside>
  );
}

function CandidateLabel({
  candidate,
}: {
  readonly candidate: AutomationTargetSelectionCandidate;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <span className="automation-target-selection__candidate-copy">
      <strong>{candidate.label}</strong>
      <small>
        {candidate.kind === 'browser'
          ? `${candidate.origin} · ${candidate.allowedDomains.join(', ')}`
          : t('automation.targetSelection.region', {
              x: candidate.region.x,
              y: candidate.region.y,
              width: candidate.region.width,
              height: candidate.region.height,
            })}
      </small>
    </span>
  );
}

function describeError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
