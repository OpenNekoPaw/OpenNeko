import type { DomainActivityCommand, DomainActivityItem } from '@neko/shared/domain-activity';
import { CloseIcon, LoadingIcon, RefreshIcon, SuccessIcon, WarningIcon } from '@neko/shared/icons';
import type { DomainActivityReplicaState } from '@/hooks/useDomainActivity';

export function DomainActivityView({
  state,
  onCommand,
}: {
  readonly state: DomainActivityReplicaState;
  readonly onCommand: (item: DomainActivityItem, command: DomainActivityCommand) => void;
}) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-label="Domain Activity">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-semibold">Activity</h1>
          <span className="text-[11px] text-[var(--vscode-descriptionForeground)]">
            v{state.snapshot.projectionVersion}
          </span>
        </div>
        {state.diagnostic ? (
          <div
            role="alert"
            className="border border-[var(--vscode-inputValidation-errorBorder)] px-2 py-1.5 text-xs"
          >
            {state.diagnostic}
          </div>
        ) : null}
        {state.phase === 'attaching' && state.snapshot.items.length === 0 ? (
          <div className="flex items-center gap-2 py-6 text-xs text-[var(--vscode-descriptionForeground)]">
            <LoadingIcon className="h-4 w-4 animate-spin" />
            <span>Loading activity</span>
          </div>
        ) : null}
        {state.phase === 'live' && state.snapshot.items.length === 0 ? (
          <div className="py-6 text-xs text-[var(--vscode-descriptionForeground)]">
            No independent jobs
          </div>
        ) : null}
        {state.snapshot.items.map((item) => (
          <DomainActivityCard
            key={`${item.jobKind}:${item.jobId}`}
            item={item}
            pending={state.pendingJobKeys.includes(`${item.jobKind}:${item.jobId}`)}
            onCommand={onCommand}
          />
        ))}
      </div>
    </main>
  );
}

function DomainActivityCard({
  item,
  pending,
  onCommand,
}: {
  readonly item: DomainActivityItem;
  readonly pending: boolean;
  readonly onCommand: (item: DomainActivityItem, command: DomainActivityCommand) => void;
}) {
  return (
    <article className="rounded-md border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <PhaseIcon item={item} />
            <h2 className="truncate text-xs font-medium">{item.label}</h2>
          </div>
          <div className="mt-0.5 truncate font-mono text-[10px] text-[var(--vscode-descriptionForeground)]">
            {item.jobKind}:{item.jobId} · r{item.jobRevision}
          </div>
        </div>
        <div className="flex h-7 items-center gap-0.5">
          {item.supportedCommands.map((command) => (
            <CommandButton
              key={command}
              command={command}
              disabled={pending}
              onClick={() => onCommand(item, command)}
            />
          ))}
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-[var(--vscode-progressBar-background)] opacity-40">
        <div
          className="h-full bg-[var(--vscode-progressBar-background)] opacity-100"
          style={{ width: `${item.progress.percent}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--vscode-descriptionForeground)]">
        <span>{item.progress.stage}</span>
        <span>{Math.round(item.progress.percent)}%</span>
      </div>
      {item.failure ? (
        <div className="mt-2 text-xs text-[var(--vscode-errorForeground)]">
          {item.failure.message}
        </div>
      ) : null}
    </article>
  );
}

function PhaseIcon({ item }: { readonly item: DomainActivityItem }) {
  if (item.phase === 'succeeded') return <SuccessIcon className="h-3.5 w-3.5" />;
  if (item.phase === 'failed' || item.phase === 'outcome-unknown') {
    return <WarningIcon className="h-3.5 w-3.5" />;
  }
  if (item.phase === 'cancelled') return <CloseIcon className="h-3.5 w-3.5" />;
  return <LoadingIcon className="h-3.5 w-3.5 animate-spin" />;
}

function CommandButton({
  command,
  disabled,
  onClick,
}: {
  readonly command: DomainActivityCommand;
  readonly disabled: boolean;
  readonly onClick: () => void;
}) {
  const label =
    command === 'cancel' ? 'Cancel job' : command === 'retry' ? 'Retry job' : 'Reconcile job';
  return (
    <button
      type="button"
      className="agent-header-action"
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {command === 'cancel' ? (
        <CloseIcon className="h-3.5 w-3.5" />
      ) : (
        <RefreshIcon className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
