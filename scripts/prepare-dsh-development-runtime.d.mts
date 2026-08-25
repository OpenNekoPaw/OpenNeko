export interface DshDevelopmentRuntimePaths {
  readonly repositoryRoot?: string;
  readonly inputRoot?: string;
}

export interface PrepareDshDevelopmentRuntimeOptions extends DshDevelopmentRuntimePaths {
  readonly appRoot?: string;
  readonly runtimeRoot?: string;
}

export function resolveDshDevelopmentRuntimeRoot(appRoot: string): string;

export function listDshDevelopmentInputFiles(
  options?: DshDevelopmentRuntimePaths,
): readonly string[];

export function prepareDshDevelopmentRuntime(options?: PrepareDshDevelopmentRuntimeOptions): string;
