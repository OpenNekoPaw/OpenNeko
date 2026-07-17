import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LogLevel } from '../../../logger';
import { createVSCodeLogger, inspectLogLevelSetting, resolveLogLevelSetting } from '../logger';

const configInspection = vi.hoisted(() => ({
  globalValue: undefined as string | undefined,
  workspaceValue: undefined as string | undefined,
  workspaceFolderValue: undefined as string | undefined,
}));

const vscodeMocks = vi.hoisted(() => ({
  createOutputChannel: vi.fn(),
  registerCommand: vi.fn(),
}));

vi.mock('vscode', () => ({
  ExtensionMode: {
    Production: 1,
    Development: 2,
    Test: 3,
  },
  commands: {
    registerCommand: vscodeMocks.registerCommand,
  },
  window: {
    createOutputChannel: vscodeMocks.createOutputChannel,
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      inspect: vi.fn(() => ({
        globalValue: configInspection.globalValue,
        workspaceValue: configInspection.workspaceValue,
        workspaceFolderValue: configInspection.workspaceFolderValue,
      })),
    })),
  },
}));

describe('resolveLogLevelSetting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configInspection.globalValue = undefined;
    configInspection.workspaceValue = undefined;
    configInspection.workspaceFolderValue = undefined;
  });

  it('lets workspace settings override global settings', () => {
    configInspection.globalValue = 'warn';
    configInspection.workspaceValue = 'debug';

    expect(resolveLogLevelSetting(1)).toBe(LogLevel.Debug);
  });

  it('reports the explicit configuration source and value', () => {
    configInspection.globalValue = 'warn';
    configInspection.workspaceValue = 'debug';

    expect(inspectLogLevelSetting(1)).toMatchObject({
      level: LogLevel.Debug,
      source: 'workspace',
      value: 'debug',
      valid: true,
      globalValue: 'warn',
      workspaceValue: 'debug',
    });
  });

  it('lets workspace folder settings override workspace settings', () => {
    configInspection.globalValue = 'error';
    configInspection.workspaceValue = 'warn';
    configInspection.workspaceFolderValue = 'debug';

    expect(resolveLogLevelSetting(1)).toBe(LogLevel.Debug);
  });

  it('normalizes explicit log level casing', () => {
    configInspection.workspaceValue = 'Debug';

    expect(resolveLogLevelSetting(1)).toBe(LogLevel.Debug);
  });

  it('defaults development extension hosts to debug when unset', () => {
    expect(resolveLogLevelSetting(2)).toBe(LogLevel.Debug);
  });
});

describe('createVSCodeLogger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configInspection.globalValue = undefined;
    configInspection.workspaceValue = undefined;
    configInspection.workspaceFolderValue = undefined;
  });

  it('registers an optional command that reveals the output channel', () => {
    const channel = {
      appendLine: vi.fn(),
      dispose: vi.fn(),
      show: vi.fn(),
    };
    const commandDisposable = { dispose: vi.fn() };
    const context = { subscriptions: [] as Array<{ dispose(): void }> };
    vscodeMocks.createOutputChannel.mockReturnValue(channel);
    vscodeMocks.registerCommand.mockReturnValue(commandDisposable);

    createVSCodeLogger('Neko Agent', 'NekoAgent', context as never, LogLevel.Debug, {
      showOutputCommand: 'neko.agent.showLogs',
    });

    expect(vscodeMocks.registerCommand).toHaveBeenCalledWith(
      'neko.agent.showLogs',
      expect.any(Function),
    );

    const callback = vscodeMocks.registerCommand.mock.calls[0]?.[1];
    callback?.();

    expect(channel.show).toHaveBeenCalledWith(true);
    expect(context.subscriptions).toEqual([channel, commandDisposable]);
  });
});
