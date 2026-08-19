export interface DshRuntimeFileDescriptor {
  readonly file: string;
  readonly sha256: string;
}

export interface DshRuntimeDescriptor {
  readonly target: string;
  readonly node: {
    readonly release: string;
    readonly executable: DshRuntimeFileDescriptor;
  };
  readonly dsh: {
    readonly release: string;
    readonly entrypoint: DshRuntimeFileDescriptor;
  };
  readonly profile: {
    readonly name: string;
    readonly manifest: DshRuntimeFileDescriptor;
    readonly patch: DshRuntimeFileDescriptor;
  };
  readonly closure: {
    readonly directory: string;
    readonly files: number;
    readonly bytes: number;
    readonly sha256: string;
  };
  readonly licenses: DshRuntimeFileDescriptor;
}

export interface VerifiedDshRuntimeDirectory {
  readonly descriptor: DshRuntimeDescriptor;
  readonly node: string;
  readonly dshEntrypoint: string;
  readonly profileManifest: string;
  readonly profilePatch: string;
}

export function assertDshRuntimeDirectory(
  runtimeRoot: string,
  target: string,
  options?: { readonly qualify?: boolean; readonly verifyTree?: boolean },
): VerifiedDshRuntimeDirectory;

export function stagePackagedDshRuntime(
  stageRoot: string,
  target: string,
  runtimeSourceRoot: string | undefined,
): { readonly runtimeRoot: string };

export function fingerprintDirectory(directory: string): {
  readonly files: number;
  readonly bytes: number;
  readonly sha256: string;
};
