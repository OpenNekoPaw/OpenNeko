import type { CanvasHostRuntimeIdentity } from './canvas-host-runtime-contract';
import type { CanvasGenerationProjectionSnapshot } from './canvas-generation-projection';
import type { CanvasMaterialActionTarget } from './canvas-material-action-catalog';
import type { CanvasMaterialMediaKind } from './types/canvas-material-contracts';

export interface CanvasGenerationWorkspace {
  readonly workspaceId: string;
  readonly workspacePath: string;
}

export interface CanvasGenerationApplicationPort {
  requestDraft?(input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly workspace: CanvasGenerationWorkspace;
    readonly mediaKind: CanvasMaterialMediaKind;
    readonly position?: { readonly x: number; readonly y: number };
    readonly inputNodeIds: readonly string[];
  }): Promise<CanvasGenerationProjectionSnapshot | undefined>;
  resolveResultActions?(input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly workspace: CanvasGenerationWorkspace;
    readonly target: CanvasMaterialActionTarget;
  }): Promise<{ readonly regenerate: boolean; readonly editAndGenerate: boolean }>;
  regenerateResult?(input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly workspace: CanvasGenerationWorkspace;
    readonly target: CanvasMaterialActionTarget;
  }): Promise<CanvasGenerationProjectionSnapshot>;
  editAndGenerateResult?(input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly workspace: CanvasGenerationWorkspace;
    readonly target: CanvasMaterialActionTarget;
  }): Promise<CanvasGenerationProjectionSnapshot | undefined>;
  detachWindow(windowId: string): void;
  dispose(): Promise<void>;
}
