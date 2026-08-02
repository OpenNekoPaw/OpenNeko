import type { AgentProfileKind, AgentProfileRelationship } from './agent-profile';
import type { SkillCatalogAction, SkillCatalogSource } from './skill';

/** Canonical author-owned Agent Skill definition serialized to SKILL.md. */
export interface PortableSkillDefinition {
  readonly name: string;
  readonly description: string;
  readonly body: string;
  readonly license?: string;
  readonly compatibility?: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly allowedTools?: readonly string[];
}

/** Extra file bundled in a portable Skill directory. */
export type SkillResourceInput =
  | {
      readonly path: string;
      readonly encoding: 'utf8';
      readonly content: string;
    }
  | {
      readonly path: string;
      readonly encoding: 'base64';
      readonly content: string;
    };

export type NekoSkillDependencyRequirement = 'required' | 'optional';

export interface NekoSkillInterfaceMetadata {
  readonly displayName?: string;
  readonly shortDescription?: string;
  readonly iconSmall?: string;
  readonly defaultPrompt?: string;
}

export interface NekoSkillCapabilityDependency {
  readonly id: string;
  readonly requirement: NekoSkillDependencyRequirement;
}

export interface NekoSkillProfileDependency {
  readonly id: string;
  readonly kind: AgentProfileKind;
  readonly relationship: AgentProfileRelationship;
  readonly versionRange?: string;
}

export interface NekoSkillDependencies {
  readonly capabilities?: readonly NekoSkillCapabilityDependency[];
  readonly profiles?: readonly NekoSkillProfileDependency[];
}

/** Discovery/composition relationship only; it never activates another Skill. */
export interface NekoSkillRelationship {
  readonly name: string;
  readonly relationship: string;
}

export interface NekoSkillRelationships {
  readonly skills?: readonly NekoSkillRelationship[];
}

/** Optional Neko Host overlay serialized to agents/neko.yaml. */
export interface NekoSkillOverlay {
  readonly schemaVersion: 1;
  readonly interface?: NekoSkillInterfaceMetadata;
  readonly dependencies?: NekoSkillDependencies;
  readonly relationships?: NekoSkillRelationships;
}

export type SkillValidationArea =
  'portable' | 'overlay' | 'compatibility' | 'quality' | 'creation' | 'migration';

export type SkillDiagnosticSeverity = 'error' | 'warning' | 'info';

/** Stable machine-readable diagnostic shared by validation, creation, and migration. */
export interface SkillDiagnostic {
  readonly area: SkillValidationArea;
  readonly code: string;
  readonly severity: SkillDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

export interface SkillValidationDimension {
  readonly valid: boolean;
  readonly diagnostics: readonly SkillDiagnostic[];
}

export type SkillCompatibilityState = 'compatible' | 'incompatible' | 'unknown';

export interface SkillCompatibilityStatus {
  readonly state: SkillCompatibilityState;
  readonly diagnostics: readonly SkillDiagnostic[];
}

/** Validation dimensions stay independent so format, Host fit, and policy are not conflated. */
export interface PortableSkillValidationResult {
  readonly portable: SkillValidationDimension;
  readonly overlay: SkillValidationDimension;
  readonly compatibility: SkillCompatibilityStatus;
  readonly quality: SkillValidationDimension;
}

export type CreateSkillTarget = 'project' | 'personal';

/** Complete native creation request. Creation is not update, activation, or authorization. */
export interface CreateSkillInput {
  readonly target: CreateSkillTarget;
  readonly skill: PortableSkillDefinition;
  readonly resources?: readonly SkillResourceInput[];
  readonly neko?: NekoSkillOverlay;
}

export interface CreateSkillResult {
  readonly source: CreateSkillTarget;
  readonly rootId: string;
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly fingerprint: string;
  readonly diagnostics: readonly SkillDiagnostic[];
}

export type CreateSkillFailureCode =
  | 'invalid-skill'
  | 'invalid-overlay'
  | 'invalid-resource-path'
  | 'reserved-resource-path'
  | 'skill-already-exists'
  | 'atomic-commit-conflict'
  | 'filesystem-error';

export interface CreateSkillFailure {
  readonly code: CreateSkillFailureCode;
  readonly diagnostics: readonly SkillDiagnostic[];
  /** Raw external failure detail, preserved without localization. */
  readonly detail?: string;
}

export type SkillProvenance = 'builtin' | 'workspace' | 'user' | 'marketplace' | 'plugin';

/** Host-owned facts. These values are never accepted from SKILL.md or agents/neko.yaml. */
export interface NekoSkillHostProjection {
  readonly source: SkillCatalogSource;
  readonly location: {
    readonly rootId: string;
    readonly relativePath: string;
  };
  readonly provenance: SkillProvenance;
  readonly enabled: boolean;
  readonly editable: boolean;
  readonly trusted: boolean;
  readonly compatibility: SkillCompatibilityStatus;
  readonly fingerprint: string;
  readonly catalogActions: readonly SkillCatalogAction[];
}

export type LegacySkillMigrationFailureCode =
  | 'migration-source-not-found'
  | 'migration-source-invalid'
  | 'migration-data-unmappable'
  | 'migration-target-conflict'
  | 'migration-filesystem-error';

/** Explicit-only migration request for importing a legacy .neko/skills package. */
export interface LegacySkillMigrationInput {
  readonly source: CreateSkillTarget;
  readonly target: CreateSkillTarget;
  readonly name: string;
}

export interface LegacySkillMigrationPlan {
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly createInput: CreateSkillInput;
  readonly diagnostics: readonly SkillDiagnostic[];
}

export interface LegacySkillMigrationResult {
  readonly sourcePath: string;
  readonly created: CreateSkillResult;
  readonly diagnostics: readonly SkillDiagnostic[];
}

export interface LegacySkillMigrationFailure {
  readonly code: LegacySkillMigrationFailureCode;
  readonly diagnostics: readonly SkillDiagnostic[];
}
