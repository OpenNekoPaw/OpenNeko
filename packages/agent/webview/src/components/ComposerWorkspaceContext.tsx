import { createContext, useContext, type ReactNode } from 'react';
import type { AgentAuthoringTargetRef, AgentBoundDomainBinding } from '@neko/agent-contracts';

export interface AgentComposerWorkspaceTarget {
  readonly label: string;
  readonly context: Extract<AgentBoundDomainBinding, { readonly kind: 'workspace' }>;
  readonly target?: AgentAuthoringTargetRef;
}

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
  readonly placement:
    | { readonly kind: 'content-project'; readonly contentProjectId: string }
    | { readonly kind: 'project-local'; readonly contentProjectId: string }
    | { readonly kind: 'standalone-library'; readonly library: 'character' | 'world' };
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
  readonly targetKind: 'content-project' | 'character-project' | 'world-project';
  readonly placement:
    | { readonly kind: 'new-content-project' }
    | { readonly kind: 'standalone-library'; readonly library: 'character' | 'world' }
    | { readonly kind: 'project-local'; readonly contentProjectId: string };
}

export type AgentComposerAuthoringCreationResult =
  | {
      readonly status: 'created';
      readonly target: AgentComposerWorkspaceTarget;
    }
  | {
      readonly status: 'incomplete';
      readonly retry: () => Promise<AgentComposerAuthoringCreationResult>;
    };

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
      readonly disabled?: boolean;
    }
  | {
      readonly kind: 'workspace';
      readonly label: string;
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
