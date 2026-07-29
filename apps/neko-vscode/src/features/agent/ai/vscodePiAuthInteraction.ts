import * as vscode from 'vscode';

import type { AuthEvent, AuthInteraction, AuthPrompt } from '@neko/agent/pi';

import { getLogger } from '../base';

export interface VSCodePiAuthInteractionLogger {
  info(message: string, metadata?: Readonly<Record<string, unknown>>): void;
  error(message: string, metadata?: Readonly<Record<string, unknown>>): void;
}

export class VSCodePiAuthInteraction implements AuthInteraction {
  public constructor(
    private readonly logger: VSCodePiAuthInteractionLogger = getLogger('PiAuthInteraction'),
  ) {}

  public async prompt(prompt: AuthPrompt): Promise<string> {
    assertNotAborted(prompt.signal);
    if (prompt.type === 'select') {
      const selected = await showCancellableQuickPick(prompt);
      if (!selected)
        throw createAuthInteractionAbortError('Provider login selection was cancelled.');
      return selected.id;
    }

    const value = await showCancellableInput(prompt);
    if (value === undefined)
      throw createAuthInteractionAbortError('Provider login input was cancelled.');
    return value;
  }

  public notify(event: AuthEvent): void {
    switch (event.type) {
      case 'auth_url':
        void this.openAuthenticationUrl(event.url, event.instructions);
        return;
      case 'device_code':
        void this.openDeviceCodeUrl(event.verificationUri, event.userCode);
        return;
      case 'progress':
        this.logger.info('Pi provider authentication progress');
        return;
    }
  }

  private async openAuthenticationUrl(url: string, instructions?: string): Promise<void> {
    try {
      await vscode.env.openExternal(vscode.Uri.parse(url));
      if (instructions) await vscode.window.showInformationMessage(instructions);
    } catch (error) {
      this.logger.error('Failed to open Pi provider authentication URL', { error });
    }
  }

  private async openDeviceCodeUrl(verificationUri: string, userCode: string): Promise<void> {
    try {
      await vscode.env.openExternal(vscode.Uri.parse(verificationUri));
      await vscode.window.showInformationMessage(`Enter device code: ${userCode}`);
    } catch (error) {
      this.logger.error('Failed to open Pi provider device-code URL', { error });
    }
  }
}

async function showCancellableInput(
  prompt: Exclude<AuthPrompt, { readonly type: 'select' }>,
): Promise<string | undefined> {
  return withCancellation(prompt.signal, (token) =>
    vscode.window.showInputBox(
      {
        prompt: prompt.message,
        ...(prompt.placeholder === undefined ? {} : { placeHolder: prompt.placeholder }),
        password: prompt.type === 'secret',
        ignoreFocusOut: true,
      },
      token,
    ),
  );
}

async function showCancellableQuickPick(
  prompt: Extract<AuthPrompt, { readonly type: 'select' }>,
): Promise<(vscode.QuickPickItem & { readonly id: string }) | undefined> {
  const items = prompt.options.map((option) => ({
    id: option.id,
    label: option.label,
    ...(option.description === undefined ? {} : { description: option.description }),
  }));
  return withCancellation(prompt.signal, (token) =>
    vscode.window.showQuickPick<(typeof items)[number]>(
      items,
      { title: prompt.message, ignoreFocusOut: true },
      token,
    ),
  );
}

async function withCancellation<TResult>(
  signal: AbortSignal | undefined,
  operation: (token: vscode.CancellationToken | undefined) => Thenable<TResult>,
): Promise<TResult> {
  assertNotAborted(signal);
  if (signal === undefined) return operation(undefined);
  const source = new vscode.CancellationTokenSource();
  const abort = (): void => source.cancel();
  signal.addEventListener('abort', abort, { once: true });
  try {
    const result = await operation(source.token);
    assertNotAborted(signal);
    return result;
  } finally {
    signal.removeEventListener('abort', abort);
    source.dispose();
  }
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw createAuthInteractionAbortError('Provider login was cancelled.');
}

function createAuthInteractionAbortError(message: string): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}
