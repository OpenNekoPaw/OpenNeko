import {
  OpenNekoCredentialStore,
  PiProviderAuthController,
  parsePersistedUserCredential,
  type AuthInteraction,
  type AuthEvent,
  type AuthPrompt,
  type PersistedUserCredential,
  type UserCredentialPersistence,
} from '@neko/agent-runtime/pi';
import type { HostSecretPort } from '@neko/host/ports';

const CREDENTIAL_SECRET_KEY_PREFIX = 'openneko.agent.pi.credential.v1:';

export interface DesktopProtectedAuthPromptPort {
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

export interface DesktopAgentCredentialRuntime {
  readonly credentials: OpenNekoCredentialStore;
  readonly auth: PiProviderAuthController;
  readonly interaction: AuthInteraction;
  dispose(): void;
}

export function createDesktopAgentCredentialRuntime(input: {
  readonly secrets: HostSecretPort;
  readonly prompt: DesktopProtectedAuthPromptPort;
}): DesktopAgentCredentialRuntime {
  const credentials = new OpenNekoCredentialStore(
    new HostSecretUserCredentialPersistence(input.secrets),
  );
  return Object.freeze({
    credentials,
    auth: new PiProviderAuthController(credentials),
    interaction: new DesktopPiAuthInteraction(input.prompt),
    dispose: () => credentials.dispose(),
  });
}

class HostSecretUserCredentialPersistence implements UserCredentialPersistence {
  private readonly chains = new Map<string, Promise<void>>();

  constructor(private readonly secrets: HostSecretPort) {}

  async read(providerId: string): Promise<PersistedUserCredential | undefined> {
    const stored = await this.secrets.get(credentialSecretKey(providerId));
    if (stored === undefined) return undefined;
    const parsed: unknown = JSON.parse(stored);
    return parsePersistedUserCredential(parsed);
  }

  modify(
    providerId: string,
    operation: (
      current: PersistedUserCredential | undefined,
    ) => Promise<PersistedUserCredential | undefined>,
  ): Promise<PersistedUserCredential | undefined> {
    return this.enqueue(providerId, async () => {
      const current = await this.read(providerId);
      const updated = await operation(current);
      if (updated === undefined) return current;
      const validated = parsePersistedUserCredential(updated);
      await this.secrets.set(credentialSecretKey(providerId), JSON.stringify(validated));
      return validated;
    });
  }

  delete(providerId: string): Promise<void> {
    return this.enqueue(providerId, () => this.secrets.delete(credentialSecretKey(providerId)));
  }

  private async enqueue<TResult>(
    providerId: string,
    operation: () => Promise<TResult>,
  ): Promise<TResult> {
    const previous = this.chains.get(providerId) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chain = previous.then(() => current);
    this.chains.set(providerId, chain);
    await previous;
    try {
      return await operation();
    } finally {
      release?.();
      if (this.chains.get(providerId) === chain) this.chains.delete(providerId);
    }
  }
}

class DesktopPiAuthInteraction implements AuthInteraction {
  constructor(private readonly port: DesktopProtectedAuthPromptPort) {}

  async prompt(prompt: AuthPrompt): Promise<string> {
    assertNotAborted(prompt.signal);
    const result =
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
    if (result === null) throw authAbortError('Desktop provider login was cancelled.');
    return result;
  }

  notify(event: AuthEvent): void {
    this.port.notify(event);
  }
}

function credentialSecretKey(providerId: string): string {
  const normalized = providerId.trim();
  if (
    normalized.length === 0 ||
    normalized !== providerId ||
    !/^[a-z0-9][a-z0-9._-]*$/iu.test(providerId)
  ) {
    throw new Error(`Invalid provider credential identity '${providerId}'.`);
  }
  return `${CREDENTIAL_SECRET_KEY_PREFIX}${providerId}`;
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw authAbortError('Desktop provider login was cancelled.');
}

function authAbortError(message: string): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}
