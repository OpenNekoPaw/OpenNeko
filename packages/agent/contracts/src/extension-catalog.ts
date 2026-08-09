export type AgentExtensionStatus =
  'not-installed' | 'disabled' | 'ready' | 'partial' | 'unsupported' | 'error';

export interface AgentExtensionCatalogItem {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly version: string;
  readonly developer: string;
  readonly marketplace: string;
  readonly category: string;
  readonly installed: boolean;
  readonly enabled: boolean;
  readonly canInstall: boolean;
  readonly canEnable: boolean;
  readonly canDisable: boolean;
  readonly canRemove: boolean;
  readonly declaredPermissions: readonly string[];
  readonly acceptedPermissions: readonly string[];
  readonly agentStatus: AgentExtensionStatus;
  readonly runtimeDiagnosticCode: string;
  readonly iconDataUrl: string;
  readonly mcpServerIds: readonly string[];
  readonly hasSkills: boolean;
  readonly appIds: readonly string[];
}

export type AgentExtensionDiagnosticCode =
  | 'repository_unavailable'
  | 'repository_failed'
  | 'repository_invalid'
  | 'state_invalid'
  | 'manifest_invalid'
  | 'contribution_invalid'
  | 'runtime_unsupported'
  | 'runtime_failed'
  | 'skill_invalid';

export interface AgentExtensionRuntimeDescriptor {
  readonly pluginId: string;
  readonly pluginRoot: string;
  readonly skillRoot?: string;
  readonly mcpDocumentPath?: string;
  readonly mcpServerIds: readonly string[];
  readonly mcpToolExposure?: 'adapter-only';
  readonly appIds: readonly string[];
}

export interface AgentExtensionRuntimeReadiness {
  readonly status: Exclude<AgentExtensionStatus, 'not-installed'>;
  readonly diagnosticCode: string;
}

export interface AgentExtensionCatalogSnapshot {
  readonly records: readonly AgentExtensionCatalogItem[];
  readonly runtimeDescriptors: readonly AgentExtensionRuntimeDescriptor[];
  readonly diagnostics: readonly {
    readonly code: AgentExtensionDiagnosticCode;
    readonly count: number;
  }[];
}
