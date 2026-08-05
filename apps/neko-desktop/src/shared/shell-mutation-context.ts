import type { DesktopShellProjection } from '@neko/host/desktop-shell-contract';

export interface DesktopShellMutationContext {
  readonly rendererSessionId: string;
  readonly windowRevision: number;
}

export function projectDesktopShellMutationContext(
  current: DesktopShellMutationContext | undefined,
  projection: Pick<DesktopShellProjection, 'rendererSessionId'> & {
    readonly window: Pick<DesktopShellProjection['window'], 'revision'>;
  },
): DesktopShellMutationContext {
  if (current?.rendererSessionId !== undefined && current.rendererSessionId !== projection.rendererSessionId) {
    throw new Error('Desktop Shell endpoint changed within one renderer context.');
  }
  return {
    rendererSessionId: projection.rendererSessionId,
    windowRevision: projection.window.revision,
  };
}
