/**
 * Skill Lifecycle Contracts
 *
 * Host-agnostic DTOs for representing active Skill records and projecting them
 * into Agent turn prompt/tool/model state. These contracts intentionally live
 * below the Agent runtime so Extension, Webview, CLI, and tests can share the
 * same lifecycle vocabulary without importing runtime internals.
 */

import type { AgentCapabilityActivationProvenance } from './agent-capability-activation';
import type { RelatedSkill, SkillInjection, SkillMediaWorkflowHint, SkillSource } from './skill';
import type { SkillProvenance } from './portable-skill';

export type SkillLifecycleSlot =
  'domainSkill' | 'referenceSkill' | 'ephemeralSkill' | 'promptChainSkill';

export type SkillLifecycleOwner = 'user' | 'agent' | 'runtime';

export type SkillLifecycleRecordStatus = 'active' | 'expiring' | 'expired' | 'blocked';

export type SkillLifecycleActivationSource = 'explicit-user' | 'explicit-agent' | 'runtime-expiry';

export type SkillLifecycleDeactivationActor = 'user' | 'agent' | 'runtime';

export type SkillLifecycleDeactivationReason =
  'explicit-clear' | 'turn-ended' | 'prompt-chain-ended' | 'inactive' | 'conflict-resolution';

export type SkillLifecycleConflictStrategy = 'replace' | 'merge' | 'reject' | 'ask';

export type SkillLifecycleToolPolicyMode =
  'unrestricted' | 'allowlist' | 'intersection' | 'conflict';

export type SkillLifecycleModelOverrideSource = 'domainSkill' | 'promptChainSkill' | 'runtime';

export type SkillLifecycleDiagnosticCode =
  | 'unknown-slot'
  | 'missing-skill-injection'
  | 'missing-skill-content'
  | 'unknown-record'
  | 'no-active-record'
  | 'ambiguous-deactivation'
  | 'locked-deactivation'
  | 'skill-activation-rejected'
  | 'skill-conflict'
  | 'tool-policy-conflict'
  | 'model-override-conflict'
  | 'single-injection-slot-blocked'
  | 'expired-record'
  | 'stale-record';

export interface SkillLifecycleTurnLifetime {
  readonly kind: 'turn';
  readonly turnId: string;
}

export interface SkillLifecycleConversationLifetime {
  readonly kind: 'conversation';
  readonly untilCleared: true;
}

export interface SkillLifecyclePromptChainLifetime {
  readonly kind: 'prompt-chain';
  readonly runId: string;
}

export interface SkillLifecycleInactivityLifetime {
  readonly kind: 'inactivity';
  readonly maxIdleTurns: number;
}

export type SkillLifecycleLifetime =
  | SkillLifecycleTurnLifetime
  | SkillLifecycleConversationLifetime
  | SkillLifecyclePromptChainLifetime
  | SkillLifecycleInactivityLifetime;

export interface SkillLifecycleDeactivationPolicy {
  readonly clearableByUser: boolean;
  readonly clearableByAgent: boolean;
  readonly clearableByRuntime: boolean;
  readonly lockedReason?: string;
}

export interface SkillLifecycleSkillSummary {
  readonly name: string;
  readonly description: string;
  readonly source: SkillSource;
  readonly domain?: string;
  readonly relatedSkills?: readonly RelatedSkill[];
  readonly mediaWorkflow?: SkillMediaWorkflowHint;
  readonly hostIdentity?: SkillLifecycleHostIdentityProjection;
}

/** Host-owned local development identity. Market release identity is intentionally absent. */
export interface SkillLifecycleHostIdentityProjection {
  readonly portableName: string;
  readonly source: import('./skill').SkillCatalogSource;
  readonly provenance: SkillProvenance;
  readonly rootId: string;
  readonly relativePath: string;
  readonly fingerprint: string;
}

export interface SkillLifecycleInjectedFragmentProjection {
  readonly id: string;
  readonly source: 'skill-lifecycle';
  readonly order: number;
  readonly version?: string;
  readonly hash: string;
}

export interface SkillLifecycleRecord {
  readonly id: string;
  readonly conversationId: string;
  readonly skillName: string;
  readonly slot: SkillLifecycleSlot;
  readonly owner: SkillLifecycleOwner;
  readonly lifetime: SkillLifecycleLifetime;
  readonly injection: SkillInjection;
  readonly skillSummary: SkillLifecycleSkillSummary;
  readonly status: SkillLifecycleRecordStatus;
  readonly deactivation: SkillLifecycleDeactivationPolicy;
  readonly createdAt: number;
  readonly lastUsedTurn: number;
  readonly source: SkillLifecycleActivationSource;
  readonly provenance?: AgentCapabilityActivationProvenance;
}

export interface SkillLifecycleActivationRequest {
  readonly conversationId: string;
  readonly skillName: string;
  readonly slot: SkillLifecycleSlot;
  readonly owner: SkillLifecycleOwner;
  readonly lifetime: SkillLifecycleLifetime;
  readonly source: SkillLifecycleActivationSource;
  readonly args?: string;
  readonly provenance?: AgentCapabilityActivationProvenance;
  readonly now?: number;
  readonly turnCount?: number;
}

export interface SkillLifecycleDeactivationRequest {
  readonly conversationId: string;
  readonly recordId?: string;
  readonly slot?: SkillLifecycleSlot;
  readonly skillName?: string;
  readonly actor: SkillLifecycleDeactivationActor;
  readonly reason: SkillLifecycleDeactivationReason;
}

export interface SkillLifecycleDiagnostic {
  readonly code: SkillLifecycleDiagnosticCode;
  readonly message: string;
  readonly conversationId?: string;
  readonly recordId?: string;
  readonly skillName?: string;
  readonly slot?: SkillLifecycleSlot;
  readonly details?: Record<string, unknown>;
}

export interface SkillLifecycleActivationResult {
  readonly ok: boolean;
  readonly record?: SkillLifecycleRecord;
  readonly replacedRecordIds?: readonly string[];
  readonly diagnostics: readonly SkillLifecycleDiagnostic[];
}

export interface SkillLifecycleDeactivationResult {
  readonly ok: boolean;
  readonly removedRecordIds: readonly string[];
  readonly diagnostics: readonly SkillLifecycleDiagnostic[];
}

export interface SkillLifecyclePromptSectionProjection {
  readonly id: string;
  readonly layer: 'skill';
  readonly content: string;
  readonly priority: number;
  readonly recordId: string;
  readonly slot: SkillLifecycleSlot;
  readonly skillName: string;
  readonly version?: string;
}

export interface SkillLifecycleToolPolicyProjection {
  readonly mode: SkillLifecycleToolPolicyMode;
  /**
   * Tools contributed by active lifecycle records for eager/lazy ToolSet activation.
   * This is intentionally separate from allowedTools: reference skills may expose
   * supplemental tools without tightening the effective ToolGuard allowlist.
   */
  readonly activationTools?: readonly string[];
  readonly allowedTools?: readonly string[];
  readonly contributingRecordIds: readonly string[];
  readonly diagnostics: readonly SkillLifecycleDiagnostic[];
}

export interface SkillLifecycleModelOverrideProjection {
  readonly model: string;
  readonly source: SkillLifecycleModelOverrideSource;
  readonly recordId: string;
  readonly skillName: string;
}

export interface ActiveSkillLifecycleRecordProjection {
  readonly id: string;
  readonly skillName: string;
  readonly slot: SkillLifecycleSlot;
  readonly owner: SkillLifecycleOwner;
  readonly clearable: boolean;
  readonly provenance?: AgentCapabilityActivationProvenance;
  readonly lockedReason?: string;
  readonly expires?: string;
  readonly status: SkillLifecycleRecordStatus;
  readonly triggerSource?: SkillLifecycleActivationSource;
  readonly hostIdentity?: SkillLifecycleHostIdentityProjection;
  readonly injectedFragments?: readonly SkillLifecycleInjectedFragmentProjection[];
  readonly toolPolicyIds?: readonly string[];
}

export interface ActiveSkillLifecycleProjection {
  readonly conversationId: string;
  readonly records: readonly ActiveSkillLifecycleRecordProjection[];
  readonly diagnostics: readonly SkillLifecycleDiagnostic[];
}

export interface SkillLifecycleProjection {
  readonly promptSections: readonly SkillLifecyclePromptSectionProjection[];
  readonly toolPolicy: SkillLifecycleToolPolicyProjection;
  readonly modelOverride?: SkillLifecycleModelOverrideProjection;
  readonly diagnostics: readonly SkillLifecycleDiagnostic[];
  readonly visibleIndicators: readonly ActiveSkillLifecycleRecordProjection[];
}

export interface SkillLifecycleConflict {
  readonly requestedSkillName: string;
  readonly requestedSlot: SkillLifecycleSlot;
  readonly conflictingRecordIds: readonly string[];
  readonly strategy: SkillLifecycleConflictStrategy;
  readonly diagnostic: SkillLifecycleDiagnostic;
}
