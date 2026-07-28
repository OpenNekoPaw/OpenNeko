import type { DesktopShellProjection } from './shell-contract';

export interface DesktopShellProjectionCursor {
  readonly endpointEpoch: string;
  readonly projectionRevision: number;
  readonly windowRevision: number;
}

export function advanceDesktopShellProjectionCursor(
  current: DesktopShellProjectionCursor | undefined,
  projection: Pick<DesktopShellProjection, 'endpointEpoch' | 'projectionRevision'> & {
    readonly window: Pick<DesktopShellProjection['window'], 'revision'>;
  },
): DesktopShellProjectionCursor {
  if (current?.endpointEpoch !== undefined && current.endpointEpoch !== projection.endpointEpoch) {
    throw new Error('Desktop Shell endpoint changed within one renderer context.');
  }
  if (current && projection.projectionRevision < current.projectionRevision) {
    return current;
  }
  return {
    endpointEpoch: projection.endpointEpoch,
    projectionRevision: projection.projectionRevision,
    windowRevision: projection.window.revision,
  };
}
