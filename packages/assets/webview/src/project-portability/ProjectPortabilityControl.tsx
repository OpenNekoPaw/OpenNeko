import { IconButton, PackageIcon, Popover } from '@neko/ui';
import { useTranslation } from '@neko/ui/i18n/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createDesktopProjectPortabilityExecuteRequest,
  createDesktopProjectPortabilityRequest,
  createDesktopProjectPortabilityResumeRequest,
  isSameDesktopProjectPortabilityIdentity,
  type DesktopProjectPortabilityInspectResult,
  type DesktopProjectPortabilityPlanResult,
  type OpenNekoDesktopProjectPortabilityBridge,
} from '@neko/assets-domain/contracts';
import type {
  PortableMediaLibrarySnapshotPlan,
  PortableMediaLibrarySnapshotProgress,
} from '@neko/assets-domain/contracts';

export function ProjectPortabilityControl({
  disabled,
  endpointEpoch,
  project,
  port,
  windowId,
}: {
  readonly disabled: boolean;
  readonly endpointEpoch: string;
  readonly project: {
    readonly projectId: string;
    readonly workspaceId: string;
    readonly displayName: string;
  };
  readonly port: OpenNekoDesktopProjectPortabilityBridge['projectPortability'];
  readonly windowId: string;
}): JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [inspection, setInspection] = useState<DesktopProjectPortabilityInspectResult>();
  const [plan, setPlan] = useState<PortableMediaLibrarySnapshotPlan>();
  const [progress, setProgress] = useState<PortableMediaLibrarySnapshotProgress>();
  const [pending, setPending] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string>();
  const requestSequence = useRef(0);
  const cancellationRequested = useRef(false);
  const identity = useMemo(
    () => ({
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      windowId,
      endpointEpoch,
    }),
    [endpointEpoch, project.projectId, project.workspaceId, windowId],
  );

  const nextRequestId = (operation: string): string => {
    requestSequence.current += 1;
    return `project-portability:${operation}:${requestSequence.current}`;
  };

  const refresh = async (): Promise<void> => {
    const result = await port.inspect(
      createDesktopProjectPortabilityRequest({
        requestId: nextRequestId('inspect'),
        identity,
      }),
    );
    setInspection(result);
  };

  useEffect(() => {
    return port.subscribe((event) => {
      if (!isSameDesktopProjectPortabilityIdentity(event.identity, identity)) return;
      setProgress(event.progress);
    });
  }, [identity, port]);

  useEffect(() => {
    setInspection(undefined);
    setPlan(undefined);
    setProgress(undefined);
    setError(undefined);
    if (!open) return;
    setPending(true);
    void refresh()
      .catch((cause: unknown) => setError(describeError(cause)))
      .finally(() => setPending(false));
  }, [identity, open]);

  const requestPlan = async (resumeSnapshotId?: string): Promise<void> => {
    setPending(true);
    setError(undefined);
    try {
      const result: DesktopProjectPortabilityPlanResult = resumeSnapshotId
        ? await port.resume(
            createDesktopProjectPortabilityResumeRequest({
              requestId: nextRequestId('resume'),
              identity,
              snapshotId: resumeSnapshotId,
            }),
          )
        : await port.plan(
            createDesktopProjectPortabilityRequest({
              requestId: nextRequestId('plan'),
              identity,
            }),
          );
      if (result.status === 'planned') {
        setPlan(result.plan);
        setProgress(undefined);
      }
    } catch (cause: unknown) {
      setError(describeError(cause));
    } finally {
      setPending(false);
    }
  };

  const executePlan = async (): Promise<void> => {
    if (!plan) return;
    cancellationRequested.current = false;
    setExecuting(true);
    setError(undefined);
    try {
      await port.execute(
        createDesktopProjectPortabilityExecuteRequest({
          requestId: nextRequestId('execute'),
          identity,
          snapshotId: plan.snapshotId,
          expectedOperationRevision: plan.operationRevision,
        }),
      );
      setPlan(undefined);
      await refresh();
    } catch (cause: unknown) {
      if (!cancellationRequested.current) setError(describeError(cause));
    } finally {
      setExecuting(false);
    }
  };

  const cancelPlan = async (): Promise<void> => {
    if (!plan) return;
    cancellationRequested.current = true;
    setPending(true);
    setError(undefined);
    try {
      await port.cancel(
        createDesktopProjectPortabilityResumeRequest({
          requestId: nextRequestId('cancel'),
          identity,
          snapshotId: plan.snapshotId,
        }),
      );
      setPlan(undefined);
      setProgress(undefined);
      await refresh();
    } catch (cause: unknown) {
      setError(describeError(cause));
    } finally {
      setPending(false);
    }
  };

  return (
    <Popover
      align="end"
      open={open}
      onOpenChange={setOpen}
      side="right"
      trigger={
        <IconButton
          disabled={disabled}
          icon={<PackageIcon size={16} />}
          label={t('workspace.portability')}
          title={t('workspace.portability')}
          aria-expanded={open}
        />
      }
    >
      <section
        className="project-portability-panel"
        aria-label={t('workspace.portability')}
        data-project-portability-state={inspection?.portability.state ?? 'loading'}
      >
        <header>
          <strong>{t('workspace.portability')}</strong>
          <span>{project.displayName}</span>
        </header>
        {inspection ? (
          <>
            <p>{t(`workspace.portabilityState.${inspection.portability.state}`)}</p>
            {inspection.portability.libraries.length > 0 ? (
              <ul>
                {inspection.portability.libraries.map((library) => (
                  <li key={library.libraryName}>
                    <span>{library.libraryName}</span>
                    <small>
                      {library.referenceCount} {t('workspace.portabilityReferences')}
                      {library.missingCount > 0
                        ? ` · ${library.missingCount} ${t('workspace.portabilityMissing')}`
                        : ''}
                    </small>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p>{t('workspace.portabilityLoading')}</p>
        )}
        {plan ? (
          <div className="project-portability-panel__operation">
            <strong>{t('workspace.portabilityPlanReady')}</strong>
            <span>
              {plan.entryCount} {t('workspace.portabilityFiles')} ·{' '}
              {formatByteLength(plan.totalByteLength)}
            </span>
            {progress ? (
              <progress
                max={Math.max(progress.totalByteLength, 1)}
                value={progress.completedByteLength}
                aria-label={t('workspace.portabilityProgress')}
              />
            ) : null}
            <div>
              <button
                type="button"
                disabled={pending || executing}
                onClick={() => void executePlan()}
              >
                {executing ? t('workspace.portabilityCreating') : t('workspace.portabilityConfirm')}
              </button>
              <button type="button" disabled={pending} onClick={() => void cancelPlan()}>
                {t('workspace.portabilityCancel')}
              </button>
            </div>
          </div>
        ) : (
          <div className="project-portability-panel__actions">
            {inspection?.resumableSnapshot &&
            inspection.resumableSnapshot.requirementRevision ===
              inspection.portability.requirementRevision ? (
              <button
                type="button"
                disabled={pending || executing}
                onClick={() => void requestPlan(inspection.resumableSnapshot?.snapshotId)}
              >
                {t('workspace.portabilityResume')}
              </button>
            ) : null}
            <button
              type="button"
              disabled={
                pending || executing || inspection?.portability.state === 'coverage-incomplete'
              }
              onClick={() => void requestPlan()}
            >
              {t('workspace.portabilityCreate')}
            </button>
          </div>
        )}
        {error ? <p className="project-portability-panel__error">{error}</p> : null}
      </section>
    </Popover>
  );
}

function formatByteLength(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
