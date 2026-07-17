import type { AgentHostRuntimeAdapter } from '@neko-agent/types';
import type {
  WebviewKeyboardEditableMessage,
  WebviewKeyboardEditableReporter,
  WebviewKeyboardFocusMessage,
  WebviewKeyboardFocusReporter,
} from '@neko/ui/keyboard';

export {
  useReportWebviewKeyboardEditable as useWebviewKeyboardEditableReporting,
  useReportWebviewKeyboardFocus as useWebviewKeyboardFocusReporting,
} from '@neko/ui/keyboard';

export function createAgentWebviewKeyboardReporter(
  host: Pick<AgentHostRuntimeAdapter, 'send'>,
): WebviewKeyboardFocusReporter & WebviewKeyboardEditableReporter {
  return {
    postMessage(message: WebviewKeyboardFocusMessage | WebviewKeyboardEditableMessage): void {
      host.send(message);
    },
  };
}
export type {
  WebviewKeyboardEditableReporter as WebviewKeyboardReporter,
  WebviewKeyboardFocusReporter,
} from '@neko/ui/keyboard';
