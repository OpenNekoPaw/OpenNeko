export interface AgentResourceDisplayProjectionFact {
  readonly conversationId: string;
  readonly toolCallId: string;
  readonly projectionKind: 'tool-result';
  readonly status: 'authorized' | 'denied';
  readonly sourceKind:
    'workspace-file' | 'media-library' | 'package-file' | 'representation-handle';
  readonly transport: 'openneko-resource' | 'none';
  readonly renderTarget: 'agent-webview';
  readonly diagnosticCodes: readonly string[];
}
