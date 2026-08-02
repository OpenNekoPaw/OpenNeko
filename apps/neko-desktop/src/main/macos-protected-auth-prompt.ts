import { execFile } from 'node:child_process';

import type { ProtectedAuthPromptPort } from '@neko/agent-runtime/pi';

const TEXT_PROMPT_SCRIPT = `
on run argv
  set promptMessage to item 1 of argv
  set promptPlaceholder to item 2 of argv
  set hidesAnswer to item 3 of argv is "true"
  if hidesAnswer then
    set resultDialog to display dialog promptMessage default answer promptPlaceholder with hidden answer buttons {"Cancel", "OK"} default button "OK" cancel button "Cancel"
  else
    set resultDialog to display dialog promptMessage default answer promptPlaceholder buttons {"Cancel", "OK"} default button "OK" cancel button "Cancel"
  end if
  return text returned of resultDialog
end run
`;

const SELECT_PROMPT_SCRIPT = `
on run argv
  set promptMessage to item 1 of argv
  set promptOptions to items 2 thru -1 of argv
  set selection to choose from list promptOptions with prompt promptMessage
  if selection is false then error number -128
  return item 1 of selection
end run
`;

const MESSAGE_SCRIPT = `
on run argv
  display dialog (item 1 of argv) buttons {"OK"} default button "OK"
end run
`;

export interface CreateMacOSProtectedAuthPromptOptions {
  readonly openExternal: (url: string) => Promise<void>;
  readonly reportFailure: (message: string) => void;
}

export function createMacOSProtectedAuthPrompt(
  options: CreateMacOSProtectedAuthPromptOptions,
): ProtectedAuthPromptPort {
  if (process.platform !== 'darwin') {
    throw new Error('Desktop protected provider authentication currently requires macOS.');
  }
  return {
    async text(input): Promise<string | null> {
      assertNotAborted(input.signal);
      const result = await runAppleScript(
        TEXT_PROMPT_SCRIPT,
        [input.message, input.placeholder ?? '', String(input.secret)],
        input.signal,
      );
      assertNotAborted(input.signal);
      return result;
    },
    async select(input): Promise<string | null> {
      assertNotAborted(input.signal);
      if (input.options.length === 0) {
        throw new Error('Desktop provider authentication selection requires at least one option.');
      }
      const displayed = input.options.map((option) =>
        option.description
          ? `${option.label} - ${option.description} [${option.id}]`
          : `${option.label} [${option.id}]`,
      );
      const selected = await runAppleScript(
        SELECT_PROMPT_SCRIPT,
        [input.message, ...displayed],
        input.signal,
      );
      assertNotAborted(input.signal);
      if (selected === null) return null;
      const index = displayed.indexOf(selected);
      const option = input.options[index];
      if (index < 0 || option === undefined) {
        throw new Error('Desktop provider authentication returned an unknown selection.');
      }
      return option.id;
    },
    notify(event): void {
      void notify(event, options).catch(() => {
        options.reportFailure('Desktop provider authentication notification failed.');
      });
    },
  };
}

async function notify(
  event: Parameters<ProtectedAuthPromptPort['notify']>[0],
  options: CreateMacOSProtectedAuthPromptOptions,
): Promise<void> {
  switch (event.type) {
    case 'auth_url':
      await options.openExternal(event.url);
      if (event.instructions) {
        await runRequiredAppleScript(MESSAGE_SCRIPT, [event.instructions]);
      }
      return;
    case 'device_code':
      await options.openExternal(event.verificationUri);
      await runRequiredAppleScript(MESSAGE_SCRIPT, [
        `Enter this device code in the provider window:\n\n${event.userCode}`,
      ]);
      return;
    case 'progress':
      return;
  }
}

function runAppleScript(
  script: string,
  args: readonly string[],
  signal?: AbortSignal,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    execFile(
      '/usr/bin/osascript',
      ['-e', script, '--', ...args],
      {
        encoding: 'utf8',
        ...(signal === undefined ? {} : { signal }),
      },
      (error, stdout, stderr) => {
        if (error) {
          if (signal?.aborted) {
            reject(authAbortError('Desktop provider login was cancelled.'));
            return;
          }
          if (isAppleScriptCancellation(error, stderr)) {
            resolve(null);
            return;
          }
          reject(new Error('Desktop protected authentication prompt failed.', { cause: error }));
          return;
        }
        resolve(stripProcessLineEnding(stdout));
      },
    );
  });
}

async function runRequiredAppleScript(script: string, args: readonly string[]): Promise<void> {
  const result = await runAppleScript(script, args);
  if (result === null) {
    throw new Error('Desktop provider authentication notification was dismissed.');
  }
}

function isAppleScriptCancellation(error: Error, stderr: string): boolean {
  return (
    ('code' in error && (error.code === 1 || error.code === -128)) ||
    stderr.includes('User canceled') ||
    stderr.includes('(-128)')
  );
}

function stripProcessLineEnding(value: string): string {
  return value.replace(/\r?\n$/u, '');
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw authAbortError('Desktop provider login was cancelled.');
}

function authAbortError(message: string): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}
