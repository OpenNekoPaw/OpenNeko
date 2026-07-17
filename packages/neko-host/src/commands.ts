import type { HostMaybePromise, HostDiagnostic } from './ports';

export type NekoCommandId = `neko.${string}`;

export const NEKO_COMMANDS = {
  workspaceSearchFiles: 'neko.workspace.searchFiles',
  workspaceOpenFile: 'neko.workspace.openFile',
  workspaceRevealFile: 'neko.workspace.revealFile',
  configOpenUser: 'neko.config.openUser',
  configOpenWorkspace: 'neko.config.openWorkspace',
  externalOpenUrl: 'neko.external.openUrl',
  resourceReveal: 'neko.resource.reveal',
  resourceDownloadSvg: 'neko.resource.downloadSvg',
  dragStart: 'neko.drag.start',
} as const satisfies Record<string, NekoCommandId>;

export type NekoBuiltinCommandId = (typeof NEKO_COMMANDS)[keyof typeof NEKO_COMMANDS];

export type NekoCommandActor = 'webview' | 'agent' | 'workbench' | 'plugin' | 'tui' | 'test';

export interface NekoCommandContext {
  readonly actor: NekoCommandActor;
  readonly correlationId?: string;
}

export type NekoWorkspaceCommandMediaType =
  | 'video'
  | 'audio'
  | 'image'
  | 'sequence'
  | 'text'
  | 'document';

export interface NekoWorkspaceSearchFilesPayload {
  readonly filter: string;
  readonly limit?: number;
}

export interface NekoWorkspaceFileCandidate {
  readonly path: string;
  readonly name: string;
  readonly type: 'file' | 'folder';
  readonly source?: 'workspace';
  readonly icon?: string;
  readonly mediaType?: NekoWorkspaceCommandMediaType;
}

export interface NekoWorkspaceSearchFilesResult {
  readonly files: readonly NekoWorkspaceFileCandidate[];
}

export interface NekoWorkspacePathPayload {
  readonly path: string;
}

export interface NekoExternalOpenUrlPayload {
  readonly url: string;
}

export interface NekoResourceRevealPayload {
  readonly resourceId: string;
  readonly path?: string;
}

export interface NekoResourceDownloadSvgPayload {
  readonly svg: string;
  readonly filename?: string;
}

export interface NekoResourceDownloadResult {
  readonly saved: boolean;
  readonly filePath?: string;
}

export interface NekoDragStartPayload {
  readonly path: string;
  readonly name?: string;
  readonly mediaType?: string;
}

export type NekoBuiltinCommandPayloadMap = {
  [NEKO_COMMANDS.workspaceSearchFiles]: NekoWorkspaceSearchFilesPayload;
  [NEKO_COMMANDS.workspaceOpenFile]: NekoWorkspacePathPayload;
  [NEKO_COMMANDS.workspaceRevealFile]: NekoWorkspacePathPayload;
  [NEKO_COMMANDS.configOpenUser]: Record<string, never>;
  [NEKO_COMMANDS.configOpenWorkspace]: Record<string, never>;
  [NEKO_COMMANDS.externalOpenUrl]: NekoExternalOpenUrlPayload;
  [NEKO_COMMANDS.resourceReveal]: NekoResourceRevealPayload;
  [NEKO_COMMANDS.resourceDownloadSvg]: NekoResourceDownloadSvgPayload;
  [NEKO_COMMANDS.dragStart]: NekoDragStartPayload;
};

export type NekoBuiltinCommandResultMap = {
  [NEKO_COMMANDS.workspaceSearchFiles]: NekoWorkspaceSearchFilesResult;
  [NEKO_COMMANDS.workspaceOpenFile]: void;
  [NEKO_COMMANDS.workspaceRevealFile]: void;
  [NEKO_COMMANDS.configOpenUser]: void;
  [NEKO_COMMANDS.configOpenWorkspace]: void;
  [NEKO_COMMANDS.externalOpenUrl]: void;
  [NEKO_COMMANDS.resourceReveal]: void;
  [NEKO_COMMANDS.resourceDownloadSvg]: NekoResourceDownloadResult;
  [NEKO_COMMANDS.dragStart]: void;
};

export interface NekoCommandExecutor {
  execute<TCommand extends NekoBuiltinCommandId>(
    commandId: TCommand,
    payload: NekoBuiltinCommandPayloadMap[TCommand],
    context?: NekoCommandContext,
  ): Promise<NekoBuiltinCommandResultMap[TCommand]>;
  execute<TResult = unknown, TPayload = unknown>(
    commandId: NekoCommandId,
    payload: TPayload,
    context?: NekoCommandContext,
  ): Promise<TResult>;
}

export interface NekoCommandRegistry extends NekoCommandExecutor {
  register<TCommand extends NekoBuiltinCommandId>(
    commandId: TCommand,
    handler: NekoCommandHandler<
      NekoBuiltinCommandPayloadMap[TCommand],
      NekoBuiltinCommandResultMap[TCommand]
    >,
  ): void;
  register<TResult = unknown, TPayload = unknown>(
    commandId: NekoCommandId,
    handler: NekoCommandHandler<TPayload, TResult>,
  ): void;
}

export type NekoCommandHandler<TPayload, TResult> = (
  payload: TPayload,
  context: NekoCommandContext,
) => HostMaybePromise<TResult>;

export class NekoCommandExecutionError extends Error {
  readonly diagnostic: HostDiagnostic;

  constructor(diagnostic: HostDiagnostic) {
    super(diagnostic.message);
    this.name = 'NekoCommandExecutionError';
    this.diagnostic = diagnostic;
  }
}

export function createNekoCommandRegistry(): NekoCommandRegistry {
  return new DefaultNekoCommandRegistry();
}

class DefaultNekoCommandRegistry implements NekoCommandRegistry {
  private readonly handlers = new Map<NekoCommandId, NekoCommandHandler<unknown, unknown>>();

  register(commandId: NekoCommandId, handler: NekoCommandHandler<unknown, unknown>): void {
    if (!isNekoCommandId(commandId)) {
      throw new NekoCommandExecutionError({
        code: 'invalidNekoCommandId',
        severity: 'error',
        message: `Neko command id must start with 'neko.': ${commandId}`,
        metadata: { commandId },
      });
    }
    if (this.handlers.has(commandId)) {
      throw new NekoCommandExecutionError({
        code: 'duplicateNekoCommandHandler',
        severity: 'error',
        message: `Neko command handler is already registered: ${commandId}`,
        metadata: { commandId },
      });
    }
    this.handlers.set(commandId, handler);
  }

  async execute<TResult = unknown, TPayload = unknown>(
    commandId: NekoCommandId,
    payload: TPayload,
    context: NekoCommandContext = { actor: 'workbench' },
  ): Promise<TResult> {
    const handler = this.handlers.get(commandId);
    if (!handler) {
      throw new NekoCommandExecutionError({
        code: 'missingNekoCommandHandler',
        severity: 'error',
        message: `Neko command is not implemented by this host: ${commandId}`,
        metadata: { commandId, actor: context.actor },
      });
    }
    return (await handler(payload, context)) as TResult;
  }
}

function isNekoCommandId(value: string): value is NekoCommandId {
  return value.startsWith('neko.');
}
