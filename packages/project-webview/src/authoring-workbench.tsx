import type {
  ProjectAuthoringNavigationItem,
  ProjectAuthoringPresentationSnapshotRef,
} from '@neko/project/contracts';
import { WarningIcon } from '@neko/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export type ProjectWritableNavigationItem = Extract<
  ProjectAuthoringNavigationItem,
  { readonly kind: 'authoring-target' }
>;

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

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
