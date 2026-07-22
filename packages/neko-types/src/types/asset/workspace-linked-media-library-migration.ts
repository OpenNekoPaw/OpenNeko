import type { WorkspaceLinkedMediaLibraryDiagnostic } from './workspace-linked-media-library';

export interface LegacyMediaLibraryEntry {
  readonly name: string;
  readonly path: string;
  readonly variable: string;
  readonly enabled?: boolean;
}

export interface LegacyMediaLibrarySettings {
  readonly mediaLibraries?: readonly LegacyMediaLibraryEntry[];
}

export interface LegacyMediaLibraryLocalSettings {
  readonly mediaLibraryOverrides?: Readonly<Record<string, string>>;
}

export type LegacyMediaLibrarySourceKind = 'variable' | 'absolute-local';

export interface LegacyMediaLibrarySourceReference {
  readonly sourceId: string;
  readonly fieldPath: readonly (string | number)[];
  readonly value: string;
  readonly kind: LegacyMediaLibrarySourceKind;
  readonly variable?: string;
}

export interface LegacyMediaLibraryInspection {
  readonly settings: LegacyMediaLibrarySettings;
  readonly localSettings: LegacyMediaLibraryLocalSettings;
  readonly sources: readonly LegacyMediaLibrarySourceReference[];
  readonly diagnostics: readonly WorkspaceLinkedMediaLibraryDiagnostic[];
}

export interface LegacyMediaLibrarySourceRewrite {
  readonly sourceId: string;
  readonly fieldPath: readonly (string | number)[];
  readonly previousValue: string;
  readonly workspacePath: string;
}

export interface LegacyMediaLibraryMigrationFingerprint {
  readonly sourceWorkspacePath: string;
  readonly sizeBytes: number;
  readonly contentHash: string;
}

export interface LegacyMediaLibraryMigrationTarget {
  readonly legacyVariable: string;
  readonly libraryName: string;
  readonly targetDirectory: string;
  readonly linkWorkspacePath: string;
}

export interface LegacyMediaLibraryMigrationPlan {
  readonly originalProjectContentHash: string;
  readonly targets: readonly LegacyMediaLibraryMigrationTarget[];
  readonly rewrites: readonly LegacyMediaLibrarySourceRewrite[];
  readonly fingerprints: readonly LegacyMediaLibraryMigrationFingerprint[];
  readonly removeSharedSettings: boolean;
  readonly removeLocalSettings: boolean;
}
