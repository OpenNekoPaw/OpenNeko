export class EventEmitter<T> {
  private readonly listeners = new Set<(event: T) => void>();
  readonly event = (listener: (event: T) => void) => {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  };

  fire(event: T): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  dispose(): void {
    this.listeners.clear();
  }
}

type CommandHandler = (...args: readonly unknown[]) => unknown;

const commandHandlers = new Map<string, CommandHandler>();

export const commands = {
  registerCommand: (command: string, handler: CommandHandler) => {
    commandHandlers.set(command, handler);
    return {
      dispose: () => {
        commandHandlers.delete(command);
      },
    };
  },
  executeCommand: async <T = unknown>(command: string, ...args: readonly unknown[]): Promise<T> => {
    const handler = commandHandlers.get(command);
    if (!handler) {
      throw new Error(`No command registered: ${command}`);
    }
    return (await handler(...args)) as T;
  },
};

export const window = {
  showInputBox: async () => undefined,
  showQuickPick: async () => undefined,
};

export const workspace = {
  workspaceFolders: [{ uri: { fsPath: '/workspace/neko-test' } }],
  getWorkspaceFolder: (uri: { readonly fsPath?: string }) =>
    uri.fsPath?.startsWith('/workspace/neko-test')
      ? { uri: { fsPath: '/workspace/neko-test' } }
      : undefined,
  createFileSystemWatcher: () => ({
    onDidDelete: () => ({ dispose() {} }),
    onDidCreate: () => ({ dispose() {} }),
    dispose() {},
  }),
};

export const l10n = {
  t: (message: string, ...args: readonly unknown[]) =>
    args.reduce<string>((text, arg, index) => text.replace(`{${index}}`, String(arg)), message),
};

export const Uri = {
  file: (value: string) => ({
    scheme: 'file',
    fsPath: value,
    toString: () => `file://${value}`,
  }),
  parse: (value: string) => {
    if (value.startsWith('file://')) {
      return Uri.file(value.slice('file://'.length));
    }
    return Uri.file(value);
  },
};

export class RelativePattern {
  constructor(
    readonly base: string,
    readonly pattern: string,
  ) {}
}

export function resetVSCodeTestDouble(): void {
  commandHandlers.clear();
  workspace.workspaceFolders = [{ uri: { fsPath: '/workspace/neko-test' } }];
}
