import type { AgentCapabilityAvailabilityDiagnostic } from './agent-capability-diagnostics';

export type AgentReferenceCandidateKind =
  'file' | 'asset' | 'entity' | 'story-scene' | 'canvas' | 'document' | 'media' | 'artifact';

export type AgentReferenceMetadataPrimitive = string | number | boolean | null;

export type AgentReferenceMetadataValue =
  | AgentReferenceMetadataPrimitive
  | readonly AgentReferenceMetadataValue[]
  | { readonly [key: string]: AgentReferenceMetadataValue };

export interface AgentReferenceCandidate {
  readonly id: string;
  readonly label: string;
  readonly source: string;
  readonly kind: AgentReferenceCandidateKind;
  readonly insertText: string;
  readonly description?: string;
  readonly path?: string;
  readonly metadata?: { readonly [key: string]: AgentReferenceMetadataValue };
}

export interface AgentReferenceSearchRequest {
  readonly query: string;
  readonly limit: number;
  readonly workspaceRoot?: string;
}

export interface AgentReferenceSearchResult {
  readonly candidates: readonly AgentReferenceCandidate[];
  readonly diagnostics: readonly AgentCapabilityAvailabilityDiagnostic[];
}

export interface AgentReferenceContributor {
  readonly id: string;
  readonly displayName: string;
  search(request: AgentReferenceSearchRequest): Promise<AgentReferenceSearchResult>;
}
