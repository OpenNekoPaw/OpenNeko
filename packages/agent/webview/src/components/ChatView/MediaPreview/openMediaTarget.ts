import type { AgentHostMessageSender } from '../../../messages';

export function openMediaTarget(hostMessages: AgentHostMessageSender, target: string): void {
  if (isHostFileOpenTarget(target)) {
    throw new Error('Host file open requires a ContentLocator.');
  }

  hostMessages.openUrl(target);
}

function isHostFileOpenTarget(target: string): boolean {
  return (
    target.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(target) ||
    target.startsWith('file://') ||
    target.startsWith('generated-assets/')
  );
}
