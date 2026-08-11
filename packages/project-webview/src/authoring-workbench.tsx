import type {
  ProjectAuthoringNavigationItem,
  ProjectAuthoringPresentationSnapshotRef,
} from '@neko/project/contracts';
import { FileIcon, GridIcon, LockIcon, OpenIcon, UserIcon, WarningIcon } from '@neko/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export type ProjectWritableNavigationItem = Extract<
  ProjectAuthoringNavigationItem,
  { readonly kind: 'authoring-target' }
>;

export interface ProjectAuthoringNavigationRootProps {
  readonly activeIdentity?: string;
  readonly items: readonly ProjectAuthoringNavigationItem[];
  readonly labels: {
    readonly authoring: string;
    readonly dependencies: string;
    readonly openSource: string;
    readonly readOnly: string;
  };
  readonly onActivate: (item: ProjectWritableNavigationItem) => void;
  readonly onOpenSource: (
    item: Extract<ProjectAuthoringNavigationItem, { readonly kind: 'external-dependency' }>,
  ) => void;
}

export function ProjectAuthoringNavigationRoot({
  activeIdentity,
  items,
  labels,
  onActivate,
  onOpenSource,
}: ProjectAuthoringNavigationRootProps): JSX.Element {
  const authoring = items.filter(isWritableItem);
  const dependencies = items.filter(
    (
      item,
    ): item is Extract<ProjectAuthoringNavigationItem, { readonly kind: 'external-dependency' }> =>
      item.kind === 'external-dependency',
  );
  return (
    <nav aria-label={labels.authoring} className="project-authoring-navigation">
      <ProjectNavigationSection label={labels.authoring}>
        {authoring.map((item) => (
          <button
            aria-current={activeIdentity === item.identity ? 'page' : undefined}
            className="project-authoring-navigation__row"
            data-authoring-target={item.target.kind}
            disabled={item.diagnostic !== undefined}
            key={item.identity}
            title={item.diagnostic}
            type="button"
            onClick={() => onActivate(item)}
          >
            {authoringIcon(item)}
            <span>{item.label}</span>
            {item.diagnostic ? <WarningIcon aria-label={item.diagnostic} size={14} /> : null}
          </button>
        ))}
      </ProjectNavigationSection>
      {dependencies.length > 0 ? (
        <ProjectNavigationSection label={labels.dependencies}>
          {dependencies.map((item) => (
            <div
              className="project-authoring-navigation__row is-read-only"
              data-external-dependency={item.dependency.kind}
              key={item.identity}
            >
              <LockIcon aria-label={labels.readOnly} size={14} />
              <span>{item.label ?? item.identity}</span>
              {item.diagnostic ? (
                <WarningIcon aria-label={item.diagnostic} size={14} />
              ) : item.sourceStudioTarget ? (
                <button
                  aria-label={`${labels.openSource}: ${item.label ?? item.identity}`}
                  title={labels.openSource}
                  type="button"
                  onClick={() => onOpenSource(item)}
                >
                  <OpenIcon size={14} />
                </button>
              ) : null}
            </div>
          ))}
        </ProjectNavigationSection>
      ) : null}
    </nav>
  );
}

export interface ProjectAuthoringTargetSwitchRootProps {
  readonly requested?: ProjectWritableNavigationItem;
  readonly commitOutgoingSnapshot: (
    item: ProjectWritableNavigationItem,
  ) => Promise<ProjectAuthoringPresentationSnapshotRef | undefined>;
  readonly validateIncomingAuthority: (item: ProjectWritableNavigationItem) => Promise<void>;
  readonly onSnapshotCommitted?: (snapshot: ProjectAuthoringPresentationSnapshotRef) => void;
  readonly renderTarget: (item: ProjectWritableNavigationItem) => ReactNode;
}

type SwitchState =
  | { readonly phase: 'empty'; readonly mounted?: undefined }
  | { readonly phase: 'ready'; readonly mounted: ProjectWritableNavigationItem }
  | {
      readonly phase: 'committing';
      readonly mounted: ProjectWritableNavigationItem;
      readonly incoming: ProjectWritableNavigationItem;
    }
  | {
      readonly phase: 'validating';
      readonly mounted?: undefined;
      readonly incoming: ProjectWritableNavigationItem;
    }
  | {
      readonly phase: 'failed';
      readonly mounted?: undefined;
      readonly incoming: ProjectWritableNavigationItem;
      readonly diagnostic: string;
    };

export function ProjectAuthoringTargetSwitchRoot({
  commitOutgoingSnapshot,
  onSnapshotCommitted,
  renderTarget,
  requested,
  validateIncomingAuthority,
}: ProjectAuthoringTargetSwitchRootProps): JSX.Element {
  const [state, setState] = useState<SwitchState>(() =>
    requested ? { phase: 'validating', incoming: requested } : { phase: 'empty' },
  );
  const latestRequest = useRef(requested);
  latestRequest.current = requested;

  useEffect(() => {
    if (!requested) {
      setState({ phase: 'empty' });
      return;
    }
    const currentIdentity =
      state.phase === 'ready' || state.phase === 'committing'
        ? state.mounted.identity
        : state.phase === 'validating' || state.phase === 'failed'
          ? state.incoming.identity
          : undefined;
    if (currentIdentity === requested.identity) return;
    setState((current) =>
      current.phase === 'ready'
        ? { phase: 'committing', mounted: current.mounted, incoming: requested }
        : { phase: 'validating', incoming: requested },
    );
  }, [requested, state]);

  useEffect(() => {
    if (state.phase !== 'committing') return;
    let cancelled = false;
    void commitOutgoingSnapshot(state.mounted)
      .then((snapshot) => {
        if (cancelled) return;
        if (snapshot) onSnapshotCommitted?.(snapshot);
        setState({ phase: 'validating', incoming: state.incoming });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          phase: 'failed',
          incoming: state.incoming,
          diagnostic: describeError(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [commitOutgoingSnapshot, onSnapshotCommitted, state]);

  useEffect(() => {
    if (state.phase !== 'validating') return;
    let cancelled = false;
    const incoming = state.incoming;
    void validateIncomingAuthority(incoming)
      .then(() => {
        if (cancelled || latestRequest.current?.identity !== incoming.identity) return;
        setState({ phase: 'ready', mounted: incoming });
      })
      .catch((error: unknown) => {
        if (cancelled || latestRequest.current?.identity !== incoming.identity) return;
        setState({ phase: 'failed', incoming, diagnostic: describeError(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [state, validateIncomingAuthority]);

  const mounted =
    state.phase === 'ready' || state.phase === 'committing' ? state.mounted : undefined;
  return (
    <section className="project-authoring-target-switch" data-authoring-switch-phase={state.phase}>
      {mounted ? <div key={mounted.identity}>{renderTarget(mounted)}</div> : null}
      {state.phase === 'failed' ? (
        <div className="project-authoring-target-switch__diagnostic" role="alert">
          <WarningIcon size={14} />
          <span>{state.diagnostic}</span>
        </div>
      ) : null}
    </section>
  );
}

function ProjectNavigationSection({
  children,
  label,
}: {
  readonly children: ReactNode;
  readonly label: string;
}): JSX.Element {
  return (
    <section className="project-authoring-navigation__section">
      <h3>{label}</h3>
      {children}
    </section>
  );
}

function isWritableItem(
  item: ProjectAuthoringNavigationItem,
): item is ProjectWritableNavigationItem {
  return item.kind === 'authoring-target';
}

function authoringIcon(item: ProjectWritableNavigationItem): JSX.Element {
  if (item.target.kind === 'content-project') return <FileIcon size={14} />;
  if (item.target.kind === 'character-project') return <UserIcon size={14} />;
  return <GridIcon size={14} />;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
