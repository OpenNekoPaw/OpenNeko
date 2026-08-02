import type { InputProcessor } from '../../input';

export interface WorkspaceInputProcessorRuntimeOptions {
  readonly createProcessor: (workspaceRoot: string) => InputProcessor;
}

export interface WorkspaceInputProcessorRuntime {
  resolve(workspaceRoot: string | null | undefined): InputProcessor | null;
}

export function createWorkspaceInputProcessorRuntime(
  options: WorkspaceInputProcessorRuntimeOptions,
): WorkspaceInputProcessorRuntime {
  return new DefaultWorkspaceInputProcessorRuntime(options);
}

class DefaultWorkspaceInputProcessorRuntime implements WorkspaceInputProcessorRuntime {
  private processor: InputProcessor | null = null;
  private workspaceRoot: string | null = null;

  constructor(private readonly options: WorkspaceInputProcessorRuntimeOptions) {}

  resolve(workspaceRoot: string | null | undefined): InputProcessor | null {
    if (!workspaceRoot) {
      return null;
    }

    if (!this.processor || this.workspaceRoot !== workspaceRoot) {
      this.processor = this.options.createProcessor(workspaceRoot);
      this.workspaceRoot = workspaceRoot;
    }

    return this.processor;
  }
}
