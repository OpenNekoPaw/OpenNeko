import { createContext, useContext, type ReactNode } from 'react';

export interface AgentComposerProjectOption {
  readonly projectId: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly diagnostic?: string;
}

export type AgentComposerWorkspacePresentation =
  | {
      readonly kind: 'assistant';
      readonly projects: readonly AgentComposerProjectOption[];
      readonly onSelectProject: (projectId: string) => void;
      readonly onChooseDirectory: () => void;
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
