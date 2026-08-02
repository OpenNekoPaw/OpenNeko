export interface DesktopAgentViewIdentity {
  readonly projectId: string;
  readonly viewId: string;
  readonly viewEpoch: number;
}

export interface DesktopAgentConnectionIdentity extends DesktopAgentViewIdentity {
  readonly applicationInstanceId: string;
  readonly windowId: string;
  readonly workspaceId: string;
  readonly rendererEpoch: number;
  readonly connectionId: string;
}
