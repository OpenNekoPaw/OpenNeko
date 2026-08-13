export interface AgentResourceDisplayProjectionFact {
  readonly conversationId: string;
  readonly toolCallId: string;
  readonly projectionKind: 'tool-result';
  readonly status: 'authorized' | 'denied';
  readonly locatorKind:
    | 'workspace-file'
    | 'media-library'
    | 'document-entry'
    | 'generated-output'
    | 'package-resource'
    | 'content-representation';
  readonly transport: 'openneko-resource' | 'none';
  readonly renderTarget: 'agent-webview';
  readonly diagnosticCodes: readonly string[];
}
