export interface DesktopAgentViewIdentity {
  readonly projectId: string;
  readonly viewId: string;
  readonly viewEpoch: number;
}

export interface DesktopAssistantAgentViewIdentity {
  readonly assistantSpaceId: string;
  readonly viewId: string;
  readonly viewEpoch: number;
}

interface DesktopAgentConnectionOwnerIdentity {
  readonly applicationInstanceId: string;
  readonly windowId: string;
  readonly workspaceId: string;
  readonly rendererEpoch: number;
  readonly connectionId: string;
}

export type DesktopAgentConnectionIdentity = DesktopAgentConnectionOwnerIdentity &
  (DesktopAgentViewIdentity | DesktopAssistantAgentViewIdentity);

export function isDesktopAssistantAgentConnection(
  identity: DesktopAgentConnectionIdentity,
): identity is DesktopAgentConnectionOwnerIdentity & DesktopAssistantAgentViewIdentity {
  return 'assistantSpaceId' in identity;
}
