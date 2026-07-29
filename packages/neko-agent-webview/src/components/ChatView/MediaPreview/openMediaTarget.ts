import { AgentHostMessages } from '@/messages';

export function openMediaTarget(target: string): void {
  if (isHostFileOpenTarget(target)) {
    AgentHostMessages.openFile(target);
    return;
  }

  AgentHostMessages.openUrl(target);
}

function isHostFileOpenTarget(target: string): boolean {
  return (
    target.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(target) ||
    target.startsWith('file://') ||
    target.startsWith('generated-assets/')
  );
}
