/**
 * Mock vscode module for unit testing handlers.
 *
 * Provides minimal stubs for vscode APIs used by chat handlers.
 * Only the APIs actually called in handler code are mocked.
 */

import { vi } from 'vitest';

interface MockFn {
  (...args: unknown[]): unknown;
  mockResolvedValue(value: unknown): MockFn;
  mockReturnValue(value: unknown): MockFn;
  mockImplementation(fn: (...args: unknown[]) => unknown): MockFn;
  mockReset(): MockFn;
  mockClear(): MockFn;
}

type MockUri = {
  readonly scheme: string;
  readonly fsPath: string;
  readonly path: string;
  toString(): string;
};
type WorkspaceFolder = {
  readonly uri: { readonly fsPath: string };
  readonly name: string;
  readonly index: number;
};

function mockFn(fn?: (...args: unknown[]) => unknown): MockFn {
  return (fn ? vi.fn(fn) : vi.fn()) as unknown as MockFn;
}

// Uri mock
export const Uri: {
  file(path: string): MockUri;
  parse(value: string): { readonly scheme: string; readonly path: string; toString(): string };
  joinPath(
    base: { readonly fsPath?: string; readonly path?: string },
    ...segments: string[]
  ): MockUri;
} = {
  file: (path: string) => ({
    scheme: 'file',
    fsPath: path,
    path,
    toString: () => `file://${path}`,
  }),
  parse: (value: string) => ({ scheme: 'https', path: value, toString: () => value }),
  joinPath: (base, ...segments) => {
    const joined = [base.fsPath || base.path, ...segments].join('/');
    return { scheme: 'file', fsPath: joined, path: joined, toString: () => `file://${joined}` };
  },
};

// commands mock
export const commands: {
  readonly registerCommand: MockFn;
  readonly executeCommand: MockFn;
} = {
  registerCommand: mockFn((_command: unknown, _callback: unknown) => ({
    dispose: mockFn(),
  })),
  executeCommand: mockFn().mockResolvedValue(undefined),
};

// extensions mock
export const extensions: {
  readonly getExtension: MockFn;
} = {
  getExtension: mockFn(),
};

// env mock
export const env: {
  readonly openExternal: MockFn;
} = {
  openExternal: mockFn().mockResolvedValue(true),
};

// window mock
export const window: {
  activeTextEditor: unknown;
  readonly showInputBox: MockFn;
  readonly showInformationMessage: MockFn;
  readonly showWarningMessage: MockFn;
  readonly showErrorMessage: MockFn;
  readonly showQuickPick: MockFn;
  readonly showSaveDialog: MockFn;
} = {
  activeTextEditor: undefined,
  showInputBox: mockFn().mockResolvedValue(undefined),
  showInformationMessage: mockFn().mockResolvedValue(undefined),
  showWarningMessage: mockFn().mockResolvedValue(undefined),
  showErrorMessage: mockFn().mockResolvedValue(undefined),
  showQuickPick: mockFn().mockResolvedValue(undefined),
  showSaveDialog: mockFn().mockResolvedValue(undefined),
};

// workspace mock
export const workspace: {
  readonly getConfiguration: MockFn;
  workspaceFolders: WorkspaceFolder[];
  readonly fs: {
    readonly writeFile: MockFn;
    readonly readFile: MockFn;
    readonly stat: MockFn;
  };
  readonly onDidChangeTextDocument: MockFn;
  readonly createFileSystemWatcher: MockFn;
  readonly findFiles: MockFn;
  readonly getWorkspaceFolder: MockFn;
  readonly asRelativePath: MockFn;
} = {
  getConfiguration: mockFn().mockImplementation(() => ({
    get: mockFn(),
    inspect: mockFn().mockReturnValue({}),
    update: mockFn().mockResolvedValue(undefined),
  })),
  workspaceFolders: [{ uri: { fsPath: '/mock/workspace' }, name: 'mock', index: 0 }],
  fs: {
    writeFile: mockFn().mockResolvedValue(undefined),
    readFile: mockFn().mockResolvedValue(new Uint8Array()),
    stat: mockFn().mockResolvedValue({ type: 1 }),
  },
  onDidChangeTextDocument: mockFn((_listener: unknown) => ({
    dispose: mockFn(),
  })),
  createFileSystemWatcher: mockFn(() => ({
    onDidCreate: mockFn((_listener: unknown) => ({ dispose: mockFn() })),
    onDidChange: mockFn((_listener: unknown) => ({ dispose: mockFn() })),
    onDidDelete: mockFn((_listener: unknown) => ({ dispose: mockFn() })),
    dispose: mockFn(),
  })),
  findFiles: mockFn().mockResolvedValue([]),
  getWorkspaceFolder: mockFn((uri: unknown) => {
    const filePath = isUriLike(uri) ? (uri.fsPath ?? '') : '';
    return workspace.workspaceFolders.find((folder) => filePath.startsWith(folder.uri.fsPath));
  }),
  asRelativePath: mockFn((uri: unknown) =>
    typeof uri === 'string' ? uri : isUriLike(uri) ? (uri.fsPath ?? '') : '',
  ),
};

// FileType enum
export const FileType = { File: 1, Directory: 2, SymbolicLink: 64, Unknown: 0 };

// RelativePattern mock
export const RelativePattern: MockFn = mockFn();

// LogLevel enum
export enum LogLevel {
  Off = 0,
  Trace = 1,
  Debug = 2,
  Info = 3,
  Warning = 4,
  Error = 5,
}

// Disposable mock
export class Disposable {
  constructor(private callOnDispose: () => void) {}
  dispose() {
    this.callOnDispose();
  }
}

// EventEmitter mock
export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];
  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return new Disposable(() => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    });
  };
  fire(data: T) {
    for (const listener of this.listeners) listener(data);
  }
  dispose() {
    this.listeners = [];
  }
}

/**
 * Create a mock vscode.Webview for testing handlers
 */
export function createMockWebview(): {
  readonly postMessage: MockFn;
  html: string;
  options: Record<string, never>;
  cspSource: string;
  readonly asWebviewUri: MockFn;
  readonly onDidReceiveMessage: MockFn;
} {
  return {
    postMessage: mockFn().mockResolvedValue(true),
    html: '',
    options: {},
    cspSource: 'mock-csp',
    asWebviewUri: mockFn((uri: unknown) => uri),
    onDidReceiveMessage: mockFn(),
  };
}

function isUriLike(value: unknown): value is { readonly fsPath?: string } {
  return typeof value === 'object' && value !== null && 'fsPath' in value;
}
