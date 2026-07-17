import type {
  PluginTransferCommand,
  PluginTransferCommandPayload,
  PluginTransferCommandPlan,
} from '@neko-agent/types';

export type NekoSuitePluginTransferHostClient = 'vscode' | 'tui' | 'electron' | 'agent';

export interface NekoSuitePluginTransferHostAdapter {
  readonly client: NekoSuitePluginTransferHostClient;
  readonly executeCommand: <Command extends PluginTransferCommand>(
    command: Command,
    payload: PluginTransferCommandPayload<Command>,
  ) => Promise<unknown>;
  readonly revealFile?: (filePath: string) => Promise<unknown>;
}

export interface NekoSuitePluginTransferPlanExecutionResult {
  readonly success: boolean;
  readonly executed: number;
  readonly results: readonly unknown[];
  readonly unsupported: readonly { readonly target: string; readonly reason?: string }[];
}

export async function executeNekoSuitePluginTransferPlan(
  plan: PluginTransferCommandPlan,
  adapter: NekoSuitePluginTransferHostAdapter,
  context: { readonly target?: string } = {},
): Promise<NekoSuitePluginTransferPlanExecutionResult> {
  if (plan.status === 'unsupported') {
    return {
      success: false,
      executed: 0,
      results: [],
      unsupported: [{ target: plan.target, reason: plan.reason }],
    };
  }

  if (plan.status === 'reveal-file') {
    if (!adapter.revealFile) {
      return {
        success: false,
        executed: 0,
        results: [],
        unsupported: [
          {
            target: 'explorer',
            reason: `${adapter.client}-reveal-file-unavailable`,
          },
        ],
      };
    }
    return {
      success: true,
      executed: 1,
      results: [await adapter.revealFile(plan.filePath)],
      unsupported: [],
    };
  }

  const result = await adapter.executeCommand(plan.command, plan.payload);
  const failureReason = readAuthoringFailureReason(result);
  return {
    success: !failureReason,
    executed: 1,
    results: [result],
    unsupported: failureReason
      ? [{ target: context.target ?? plan.command, reason: failureReason }]
      : [],
  };
}

function readAuthoringFailureReason(value: unknown): string | undefined {
  if (!isRecord(value) || value.ok !== false) return undefined;
  const diagnostics = Array.isArray(value.diagnostics) ? value.diagnostics : [];
  const messages = diagnostics
    .map((diagnostic) => readDiagnosticMessage(diagnostic))
    .filter((message): message is string => Boolean(message));
  return messages[0] ?? 'authoring-command-failed';
}

function readDiagnosticMessage(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const code = typeof value.code === 'string' ? value.code : undefined;
  const message = typeof value.message === 'string' ? value.message : undefined;
  if (code && message) return `${code}: ${message}`;
  return message ?? code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
