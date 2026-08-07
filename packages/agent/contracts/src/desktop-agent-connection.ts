export interface DesktopAgentViewIdentity {
  readonly projectId: string;
  readonly viewId: string;
}

export interface DesktopAssistantAgentViewIdentity {
  readonly assistantSpaceId: string;
  readonly viewId: string;
}

interface DesktopAgentConnectionOwnerIdentity {
  readonly applicationInstanceId: string;
  readonly windowId: string;
  readonly workbenchInstanceId: string;
  readonly agentSurfaceId: string;
  readonly workspaceId: string;
  readonly connectionId: string;
}

export type DesktopAgentConnectionIdentity = DesktopAgentConnectionOwnerIdentity &
  (DesktopAgentViewIdentity | DesktopAssistantAgentViewIdentity);

export function isDesktopAssistantAgentConnection(
  identity: DesktopAgentConnectionIdentity,
): identity is DesktopAgentConnectionOwnerIdentity & DesktopAssistantAgentViewIdentity {
  return 'assistantSpaceId' in identity;
}
