export type AgentTurnProjectType = 'video' | 'storyboard' | 'image' | 'unknown';

export interface AgentTurnActiveEditorLike {
  type?: string;
}

export interface AgentTurnContextInput<TActiveEditor extends AgentTurnActiveEditorLike> {
  activeEditor?: TActiveEditor;
  workspaceRoot?: string;
}

export interface AgentTurnContext<TActiveEditor = unknown> {
  activeEditor?: TActiveEditor;
  selection?: {
    content: unknown;
    range?: {
      start: number;
      end: number;
    };
  };
  workspaceRoot?: string;
  openFiles: string[];
  projectType: AgentTurnProjectType;
  userPreferences: {
    language?: string;
    preferredProvider?: string;
    preferredModel?: string;
  };
  custom: Record<string, unknown>;
}

const AGENT_TURN_PROJECT_TYPES = new Set<string>(['video', 'storyboard', 'image']);

export function inferAgentTurnProjectType(
  activeEditor: AgentTurnActiveEditorLike | undefined,
): AgentTurnProjectType {
  const type = activeEditor?.type;
  return type && AGENT_TURN_PROJECT_TYPES.has(type) ? (type as AgentTurnProjectType) : 'unknown';
}

export function createAgentTurnContext<TActiveEditor extends AgentTurnActiveEditorLike>(
  input: AgentTurnContextInput<TActiveEditor> = {},
): AgentTurnContext<TActiveEditor> {
  return {
    ...(input.activeEditor ? { activeEditor: input.activeEditor } : {}),
    ...(input.workspaceRoot ? { workspaceRoot: input.workspaceRoot } : {}),
    selection: undefined,
    openFiles: [],
    projectType: inferAgentTurnProjectType(input.activeEditor),
    userPreferences: {},
    custom: {},
  };
}
