import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  commands: {
    registerCommand: vi.fn((_command: string, _handler: (payload: unknown) => void) => ({
      dispose: vi.fn(),
    })),
    executeCommand: vi.fn(async () => undefined),
  },
}));

import * as vscode from 'vscode';
import {
  NEKO_WEBVIEW_KEYBOARD_EDITABLE_CONTEXT,
  NEKO_WEBVIEW_KEYBOARD_EDITABLE_QUERY_COMMAND,
  NEKO_WEBVIEW_KEYBOARD_EDITABLE_UPDATE_COMMAND,
} from '@neko/shared/vscode/extension';
import { WebviewKeyboardContextService } from './WebviewKeyboardContextService';

describe('WebviewKeyboardContextService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the global editable context true until every owner releases it', async () => {
    const service = new WebviewKeyboardContextService(createLogger());

    await service.updateEditableOwner('agent', true);
    await service.updateEditableOwner('canvas:file-a', true);
    await service.updateEditableOwner('agent', false);
    expect(vscode.commands.executeCommand).toHaveBeenLastCalledWith(
      'setContext',
      NEKO_WEBVIEW_KEYBOARD_EDITABLE_CONTEXT,
      true,
    );

    await service.updateEditableOwner('canvas:file-a', false);
    expect(vscode.commands.executeCommand).toHaveBeenLastCalledWith(
      'setContext',
      NEKO_WEBVIEW_KEYBOARD_EDITABLE_CONTEXT,
      false,
    );

    service.dispose();
  });

  it('registers the public update command and ignores invalid payloads', () => {
    const service = new WebviewKeyboardContextService(createLogger());
    const handler = getRegisteredCommandHandler<(payload: unknown) => void>(
      NEKO_WEBVIEW_KEYBOARD_EDITABLE_UPDATE_COMMAND,
    );
    expect(handler).toBeDefined();

    handler?.({ ownerId: 'agent' });

    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
      'setContext',
      NEKO_WEBVIEW_KEYBOARD_EDITABLE_CONTEXT,
      true,
    );

    service.dispose();
  });

  it('exposes a read-only query command for runtime command guards', async () => {
    const service = new WebviewKeyboardContextService(createLogger());
    const query = getRegisteredCommandHandler<() => boolean>(
      NEKO_WEBVIEW_KEYBOARD_EDITABLE_QUERY_COMMAND,
    );

    expect(query?.()).toBe(false);
    await service.updateEditableOwner('agent', true);
    expect(query?.()).toBe(true);

    service.dispose();
  });

  it('is no longer required for Canvas or Model webview-owned editing keybindings', () => {
    const canvasManifest = readPackageManifest('packages/neko-canvas/package.json');
    const modelManifest = readPackageManifest('packages/neko-model/package.json');

    expect(canvasManifest.contributes?.keybindings ?? []).toEqual([]);
    expect(modelManifest.contributes?.keybindings ?? []).toEqual([]);
    for (const commandId of [
      'neko.canvas.deleteSelected',
      'neko.canvas.escape',
      'neko.canvas.selectAll',
      'neko.canvas.undo',
      'neko.canvas.redo',
      'neko.canvas.generateSelected',
      'neko.model.deleteSelected',
      'neko.model.escape',
      'neko.model.selectAll',
      'neko.model.undo',
      'neko.model.redo',
      'neko.model.resetView',
    ]) {
      expect(hasCommand(canvasManifest, commandId) || hasCommand(modelManifest, commandId)).toBe(
        true,
      );
    }
  });
});

function getRegisteredCommandHandler<THandler extends (...args: never[]) => unknown>(
  command: string,
): THandler | undefined {
  return vi
    .mocked(vscode.commands.registerCommand)
    .mock.calls.find(([registeredCommand]) => registeredCommand === command)?.[1] as
    | THandler
    | undefined;
}

function createLogger() {
  return {
    source: 'test',
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => createLogger()),
    setLevel: vi.fn(),
  };
}

function readPackageManifest(relativePath: string): {
  readonly contributes?: {
    readonly commands?: readonly { readonly command?: string }[];
    readonly keybindings?: readonly { readonly command?: string }[];
  };
} {
  return JSON.parse(
    readFileSync(resolve(__dirname, '../../../../../..', relativePath), 'utf8'),
  ) as {
    readonly contributes?: {
      readonly commands?: readonly { readonly command?: string }[];
      readonly keybindings?: readonly { readonly command?: string }[];
    };
  };
}

function hasCommand(
  manifest: {
    readonly contributes?: { readonly commands?: readonly { readonly command?: string }[] };
  },
  commandId: string,
): boolean {
  return Boolean(manifest.contributes?.commands?.some((command) => command.command === commandId));
}
