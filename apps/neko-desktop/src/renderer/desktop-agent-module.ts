export type DesktopAgentWebviewRootModule = typeof import('@neko/agent-webview/root');

let agentWebviewRootModulePromise: Promise<DesktopAgentWebviewRootModule> | undefined;

export function loadDesktopAgentWebviewRootModule(): Promise<DesktopAgentWebviewRootModule> {
  agentWebviewRootModulePromise ??= import('@neko/agent-webview/root');
  return agentWebviewRootModulePromise;
}
