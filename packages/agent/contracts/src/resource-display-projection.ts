export interface AgentResourceDisplayProjectionFact {
  readonly conversationId: string;
  readonly toolCallId: string;
  readonly projectionKind: 'tool-result';
  readonly status: 'authorized' | 'denied';
  readonly locatorKind: 'workspace-file' | 'generated-output';
  readonly transport: 'openneko-resource' | 'none';
  readonly renderTarget: 'agent-webview';
  readonly diagnosticCodes: readonly string[];
}
