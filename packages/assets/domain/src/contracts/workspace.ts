export type MediaLibraryLocationKind = 'local' | 'nas' | 'cloud';

export interface AssetWorkspaceResolution {
  readonly workspaceId: string;
  readonly workspacePath: string;
  readonly displayName: string;
  readonly locator: {
    readonly kind: 'relative' | 'variable';
    readonly value: string;
  };
}
