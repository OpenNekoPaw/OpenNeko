import { createContext, useContext, type ReactNode } from 'react';
import type { AgentBoundDomainBinding } from '@neko/agent-contracts';

export interface AgentComposerWorkspaceTarget {
  readonly label: string;
  readonly context: Extract<AgentBoundDomainBinding, { readonly kind: 'workspace' }>;
}

export interface AgentComposerProjectOption {
  readonly projectId: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export type AgentComposerWorkspacePresentation =
  | {
      readonly kind: 'entry';
      readonly projects: readonly AgentComposerProjectOption[];
      readonly onChooseDirectory: () => Promise<AgentComposerWorkspaceTarget | undefined>;
      readonly onSelectProject: (
        projectId: string,
      ) => Promise<AgentComposerWorkspaceTarget | undefined>;
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
