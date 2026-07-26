import { getDefaultPersonalPath } from './system-prompt-builder';
import type { AgentsLoadResult } from './system-prompt-builder-types';

export interface SystemPromptAgentsFileRuntimeInput {
  workspacePath?: string | null;
  personalPath?: string | null;
}

export interface SystemPromptAgentsFileRuntimeDeps {
  builder: {
    loadAgentsFile(projectPath?: string, personalPath?: string): Promise<AgentsLoadResult | null>;
  };
}

export async function runSystemPromptAgentsFileLoadRuntime(
  input: SystemPromptAgentsFileRuntimeInput,
  deps: SystemPromptAgentsFileRuntimeDeps,
): Promise<AgentsLoadResult | null> {
  return deps.builder.loadAgentsFile(
    input.workspacePath ?? undefined,
    input.personalPath ?? getDefaultPersonalPath(),
  );
}
