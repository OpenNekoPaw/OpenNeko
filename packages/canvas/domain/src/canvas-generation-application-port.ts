import type { CanvasData } from './types/canvas';
import type {
  CanvasGenerationDiagnostic,
  CanvasGenerationRunBinding,
} from './types/canvas-generation-node';
import type { CanvasHostRuntimeIdentity } from './canvas-host-runtime-contract';
import type { WorkspaceFileContentLocator } from '@neko/content';
import type { GenerationJobRef, GenerationJobSnapshot } from '@neko/generation';

export interface CanvasGenerationWorkspace {
  readonly workspaceId: string;
  readonly workspacePath: string;
}

export interface CanvasGenerationRuntimeProjection {
  readonly nodeId: string;
  readonly submissionId: string;
  readonly recipeInputFingerprint: string;
  readonly jobRef?: GenerationJobRef;
  readonly phase: GenerationJobSnapshot['phase'] | 'binding';
  readonly createdAt?: number;
  readonly updatedAt?: number;
  readonly progress?: GenerationJobSnapshot['progress'];
  readonly resultLocators?: readonly WorkspaceFileContentLocator[];
  readonly text?: string;
  readonly recipeStale?: boolean;
  readonly diagnostic?: CanvasGenerationDiagnostic;
}

export interface CanvasGenerationStartResult {
  /** The latest durably persisted Canvas state, including the run and optional Job binding. */
  readonly canvas: CanvasData;
  readonly projection: CanvasGenerationRuntimeProjection;
}

export interface CanvasGenerationApplicationPort {
  startNode(input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly workspace: CanvasGenerationWorkspace;
    readonly canvas: CanvasData;
    readonly nodeId: string;
    readonly persistCanvas: (canvas: CanvasData) => Promise<void>;
  }): Promise<CanvasGenerationStartResult>;
  resumeNode(input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly workspace: CanvasGenerationWorkspace;
    readonly canvas: CanvasData;
    readonly nodeId: string;
    readonly run: CanvasGenerationRunBinding;
    readonly persistCanvas: (canvas: CanvasData) => Promise<void>;
  }): Promise<CanvasGenerationStartResult>;
  observeNode(input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly workspace: CanvasGenerationWorkspace;
    readonly nodeId: string;
    readonly run: CanvasGenerationRunBinding & { readonly jobRef: GenerationJobRef };
  }): AsyncIterable<CanvasGenerationRuntimeProjection>;
  cancelNode(input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly workspace: CanvasGenerationWorkspace;
    readonly nodeId: string;
    readonly run: CanvasGenerationRunBinding & { readonly jobRef: GenerationJobRef };
  }): Promise<CanvasGenerationRuntimeProjection>;
  detachWindow(windowId: string): void;
  dispose(): Promise<void>;
}
