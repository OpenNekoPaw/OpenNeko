import type { AuthEvent, AuthInteraction, AuthPrompt } from '@neko/agent/pi';

export interface TuiPiAuthPromptPort {
  text(input: {
    readonly message: string;
    readonly placeholder?: string;
    readonly secret: boolean;
    readonly signal?: AbortSignal;
  }): Promise<string | null>;
  select(input: {
    readonly message: string;
    readonly options: readonly {
      readonly id: string;
      readonly label: string;
      readonly description?: string;
    }[];
    readonly signal?: AbortSignal;
  }): Promise<string | null>;
  notify(event: AuthEvent): void;
}

export class TuiPiAuthInteraction implements AuthInteraction {
  public constructor(private readonly port: TuiPiAuthPromptPort) {}

  public async prompt(prompt: AuthPrompt): Promise<string> {
    assertNotAborted(prompt.signal);
    const value =
      prompt.type === 'select'
        ? await this.port.select({
            message: prompt.message,
            options: prompt.options,
            ...(prompt.signal === undefined ? {} : { signal: prompt.signal }),
          })
        : await this.port.text({
            message: prompt.message,
            ...(prompt.placeholder === undefined ? {} : { placeholder: prompt.placeholder }),
            secret: prompt.type === 'secret',
            ...(prompt.signal === undefined ? {} : { signal: prompt.signal }),
          });
    assertNotAborted(prompt.signal);
    if (value === null) throw createAbortError('Provider login was cancelled in the terminal.');
    return value;
  }

  public notify(event: AuthEvent): void {
    this.port.notify(event);
  }
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw createAbortError('Provider login was cancelled.');
}

function createAbortError(message: string): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}
