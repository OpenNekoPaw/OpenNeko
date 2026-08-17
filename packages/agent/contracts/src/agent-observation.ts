/**
 * Agent-first multimodal observation contracts.
 *
 * AgentObservation is the primary record of what the Agent perceived. Tool,
 * engine, user, memory, and subagent outputs are attached as evidence; they do
 * not replace the Agent's own observation or final rationale.
 */

export type AgentObservationModality = 'image' | 'video' | 'audio' | 'data' | 'text' | 'mixed';

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unknown';

export type EvidenceSource = 'agent' | 'tool' | 'user' | 'memory' | 'engine' | 'subagent';

export type AgentObservationStatus = 'active' | 'expired';

export type ProviderTrustLevel = 'core' | 'community' | 'untrusted' | 'unknown';

export interface ProviderExecutionContext {
  readonly providerId?: string;
  readonly trustLevel: ProviderTrustLevel;
}

export interface ModelExecutionContext {
  readonly modelId?: string;
  readonly providerId?: string;
}

export interface PerceptionEvidence {
  readonly id: string;
  readonly source: EvidenceSource;
  readonly summary: string;
  readonly confidence?: number;
  readonly toolName?: string;
  readonly observationId?: string;
  readonly providerContext?: ProviderExecutionContext;
  readonly modelContext?: ModelExecutionContext;
  readonly data?: unknown;
  readonly createdAt: number;
  readonly status?: AgentObservationStatus;
  readonly contextPacketId?: string;
}

export interface AgentObservation {
  readonly id: string;
  readonly modality: AgentObservationModality;
  readonly summary: string;
  readonly confidence: ConfidenceLevel;
  readonly evidenceIds: readonly string[];
  readonly detectedEntities?: readonly string[];
  readonly issues?: readonly string[];
  readonly providerContext?: ProviderExecutionContext;
  readonly createdAt: number;
  readonly status?: AgentObservationStatus;
  readonly contextPacketId?: string;
}
