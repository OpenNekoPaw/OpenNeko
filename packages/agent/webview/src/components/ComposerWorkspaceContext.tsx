import { createContext, useContext, type ReactNode } from 'react';
import type {
  AgentAuthoringAuthority,
  AgentAuthoringTargetRef,
  AgentBoundDomainBinding,
} from '@neko/agent-contracts';
import type {
  CanvasWorkspaceContextCatalog,
  CanvasWorkspaceTurnSummary,
  CanvasWorkspaceTurnTarget,
} from '@neko/canvas-domain';

export type AgentComposerWorkspaceTarget =
  | {
      readonly label: string;
      readonly context: Extract<AgentBoundDomainBinding, { readonly kind: 'workspace' }>;
      readonly target?: undefined;
      readonly authority?: undefined;
    }
  | {
      readonly label: string;
      readonly context: Extract<AgentBoundDomainBinding, { readonly kind: 'workspace' }>;
      readonly target?: undefined;
      readonly authority: AgentAuthoringAuthority;
    }
  | {
      readonly label: string;
      readonly context: Extract<AgentBoundDomainBinding, { readonly kind: 'workspace' }>;
      readonly target: AgentAuthoringTargetRef;
      readonly authority: AgentAuthoringAuthority;
    };

export interface AgentComposerProjectOption {
  readonly projectId: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export type AgentComposerAuthoringTargetOption = {
  readonly optionId: string;
  readonly label: string;
  readonly workspaceLabel: string;
  readonly target: AgentAuthoringTargetRef;
  readonly placement: { readonly kind: 'project'; readonly projectId: string };
  readonly disabled?: boolean;
};

export interface AgentComposerAuthoringCatalog {
  readonly targets: readonly AgentComposerAuthoringTargetOption[];
  readonly creationContexts: readonly AgentComposerAuthoringCreationContext[];
  readonly diagnostics: readonly string[];
}

export interface AgentComposerAuthoringCreationContext {
  readonly creationId: string;
  readonly label: string;
  readonly targetKind: 'character-project' | 'world-project';
  readonly placement: { readonly kind: 'project'; readonly projectId: string };
}

export interface AgentComposerAuthoringCreationResult {
  readonly status: 'created';
  readonly target: AgentComposerWorkspaceTarget;
}

export interface AgentComposerCanvasOption {
  readonly id: string;
  readonly label: string;
  readonly target: CanvasWorkspaceTurnTarget;
  readonly summary?: CanvasWorkspaceTurnSummary;
  readonly disabled?: boolean;
  readonly diagnostic?: string;
}

export interface AgentComposerCanvasPresentation {
  readonly workspaceId: string;
  readonly defaultTarget: Extract<CanvasWorkspaceTurnTarget, { readonly kind: 'workspace-board' }>;
  readonly options: readonly AgentComposerCanvasOption[];
  readonly selectedId: string;
  readonly loading: boolean;
  readonly diagnostic?: string;
  readonly onSelect: (optionId: string) => Promise<void>;
  readonly onOpen?: (optionId: string) => Promise<void>;
}

export type AgentComposerWorkspacePresentation =
  | {
      readonly kind: 'entry';
      readonly projects: readonly AgentComposerProjectOption[];
      readonly onChooseDirectory: () => Promise<AgentComposerWorkspaceTarget | undefined>;
      readonly onSelectProject: (
        projectId: string,
      ) => Promise<AgentComposerWorkspaceTarget | undefined>;
      readonly loadAuthoringCatalog?: () => Promise<AgentComposerAuthoringCatalog>;
      readonly onSelectAuthoringTarget?: (
        option: AgentComposerAuthoringTargetOption,
      ) => Promise<AgentComposerWorkspaceTarget | undefined>;
      readonly onCreateAuthoringTarget?: (
        context: AgentComposerAuthoringCreationContext,
        name: string,
      ) => Promise<AgentComposerAuthoringCreationResult | undefined>;
      readonly loadCanvasCatalog?: (
        target: AgentComposerWorkspaceTarget,
      ) => Promise<CanvasWorkspaceContextCatalog>;
      readonly openCanvasDocument?: (
        target: AgentComposerWorkspaceTarget,
        canvasId: string,
      ) => Promise<void>;
      readonly disabled?: boolean;
    }
  | {
      readonly kind: 'workspace';
      readonly label: string;
      readonly workspaceId: string;
      readonly loadCanvasCatalog: () => Promise<CanvasWorkspaceContextCatalog>;
      readonly openCanvasDocument?: (canvasId: string) => Promise<void>;
    };

const ComposerWorkspaceContext = createContext<AgentComposerWorkspacePresentation | undefined>(
  undefined,
);

export function ComposerWorkspaceProvider({
  children,
  value,
}: {
  readonly children: ReactNode;
  readonly value?: AgentComposerWorkspacePresentation;
}): JSX.Element {
  return (
    <ComposerWorkspaceContext.Provider value={value}>{children}</ComposerWorkspaceContext.Provider>
  );
}

export function useComposerWorkspacePresentation(): AgentComposerWorkspacePresentation | undefined {
  return useContext(ComposerWorkspaceContext);
}
