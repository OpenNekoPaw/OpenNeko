import { createHash } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  AuthEvent,
  AuthPrompt,
  Credential,
  CredentialStore,
  Provider,
} from "@earendil-works/pi-ai";

export type CredentialProvenance =
  | "interactive"
  | "user-config-import"
  | "environment"
  | "account-gateway";

export interface PersistedUserCredential {
  readonly credential: Credential;
  readonly provenance: CredentialProvenance;
  readonly updatedAt: string;
}

export interface UserCredentialPersistence {
  read(providerId: string): Promise<PersistedUserCredential | undefined>;
  modify(
    providerId: string,
    fn: (
      current: PersistedUserCredential | undefined,
    ) => Promise<PersistedUserCredential | undefined>,
  ): Promise<PersistedUserCredential | undefined>;
  delete(providerId: string): Promise<void>;
  dispose?(): void;
}

export interface CredentialStatus {
  readonly providerId: string;
  readonly type: Credential["type"];
  readonly provenance: CredentialProvenance;
  readonly fingerprint: string;
  readonly updatedAt: string;
  readonly expiresAt?: number;
}

export interface AuthInteraction {
  prompt(prompt: AuthPrompt): Promise<string>;
  notify(event: AuthEvent): void;
}

export type ProviderLoginMethod = "api-key" | "oauth";

export type OpenNekoCredentialErrorCode =
  | "provider-mismatch"
  | "login-unsupported"
  | "credential-missing"
  | "credential-type-mismatch"
  | "persistence";

export class OpenNekoCredentialError extends Error {
  readonly code: OpenNekoCredentialErrorCode;

  constructor(code: OpenNekoCredentialErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "OpenNekoCredentialError";
    this.code = code;
  }
}

export class OpenNekoCredentialStore implements CredentialStore {
  constructor(
    private readonly persistence: UserCredentialPersistence,
    private readonly now: () => number = Date.now,
  ) {}

  async read(providerId: string): Promise<Credential | undefined> {
    return cloneCredential((await this.readEntry(providerId))?.credential);
  }

  async modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
  ): Promise<Credential | undefined> {
    try {
      const updated = await this.persistence.modify(providerId, async (current) => {
        const next = await fn(cloneCredential(current?.credential));
        if (next === undefined) return current;
        return Object.freeze({
          credential: cloneCredential(next),
          provenance: current?.provenance ?? "interactive",
          updatedAt: new Date(this.now()).toISOString(),
        });
      });
      return cloneCredential(updated?.credential);
    } catch (cause) {
      throw new OpenNekoCredentialError(
        "persistence",
        `Failed to persist credential for provider ${providerId}.`,
        cause,
      );
    }
  }

  async replace(
    providerId: string,
    credential: Credential,
    provenance: CredentialProvenance,
  ): Promise<CredentialStatus> {
    try {
      const updated = await this.persistence.modify(providerId, async () =>
        Object.freeze({
          credential: cloneCredential(credential),
          provenance,
          updatedAt: new Date(this.now()).toISOString(),
        }),
      );
      if (updated === undefined) {
        throw new Error("Credential persistence returned no durable entry.");
      }
      return toCredentialStatus(providerId, updated);
    } catch (cause) {
      if (cause instanceof OpenNekoCredentialError) throw cause;
      throw new OpenNekoCredentialError(
        "persistence",
        `Failed to persist credential for provider ${providerId}.`,
        cause,
      );
    }
  }

  async delete(providerId: string): Promise<void> {
    try {
      await this.persistence.delete(providerId);
    } catch (cause) {
      throw new OpenNekoCredentialError(
        "persistence",
        `Failed to delete credential for provider ${providerId}.`,
        cause,
      );
    }
  }

  async status(providerId: string): Promise<CredentialStatus | undefined> {
    const entry = await this.readEntry(providerId);
    return entry === undefined ? undefined : toCredentialStatus(providerId, entry);
  }

  dispose(): void {
    this.persistence.dispose?.();
  }

  private async readEntry(providerId: string): Promise<PersistedUserCredential | undefined> {
    try {
      return await this.persistence.read(providerId);
    } catch (cause) {
      throw new OpenNekoCredentialError(
        "persistence",
        `Failed to read credential for provider ${providerId}.`,
        cause,
      );
    }
  }
}

export class PiProviderAuthController {
  constructor(private readonly credentials: OpenNekoCredentialStore) {}

  async login(input: {
    readonly provider: Provider;
    readonly method: ProviderLoginMethod;
    readonly interaction: AuthInteraction;
    readonly signal?: AbortSignal;
    readonly provenance?: CredentialProvenance;
  }): Promise<CredentialStatus> {
    const callbacks = {
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      prompt: (prompt: AuthPrompt) => input.interaction.prompt(prompt),
      notify: (event: AuthEvent) => input.interaction.notify(event),
    };
    let credential: Credential;
    if (input.method === "oauth") {
      if (input.provider.auth.oauth === undefined) {
        throw new OpenNekoCredentialError(
          "login-unsupported",
          `Provider ${input.provider.id} does not expose Pi OAuth login.`,
        );
      }
      credential = await input.provider.auth.oauth.login(callbacks);
    } else {
      const login = input.provider.auth.apiKey?.login;
      if (login === undefined) {
        throw new OpenNekoCredentialError(
          "login-unsupported",
          `Provider ${input.provider.id} does not expose interactive Pi API-key login.`,
        );
      }
      credential = await login(callbacks);
    }
    return this.credentials.replace(
      input.provider.id,
      credential,
      input.provenance ?? "interactive",
    );
  }

  async refresh(provider: Provider): Promise<CredentialStatus> {
    const oauth = provider.auth.oauth;
    if (oauth === undefined) {
      throw new OpenNekoCredentialError(
        "login-unsupported",
        `Provider ${provider.id} does not expose Pi OAuth refresh.`,
      );
    }
    const updated = await this.credentials.modify(provider.id, async (current) => {
      if (current === undefined) {
        throw new OpenNekoCredentialError(
          "credential-missing",
          `Provider ${provider.id} has no stored OAuth credential.`,
        );
      }
      if (current.type !== "oauth") {
        throw new OpenNekoCredentialError(
          "credential-type-mismatch",
          `Provider ${provider.id} credential is not OAuth.`,
        );
      }
      return oauth.refresh(current);
    });
    if (updated === undefined) {
      throw new OpenNekoCredentialError(
        "credential-missing",
        `Provider ${provider.id} OAuth refresh produced no credential.`,
      );
    }
    const status = await this.credentials.status(provider.id);
    if (status === undefined) {
      throw new OpenNekoCredentialError(
        "credential-missing",
        `Provider ${provider.id} refreshed credential is not durable.`,
      );
    }
    return status;
  }

  logout(providerId: string): Promise<void> {
    return this.credentials.delete(providerId);
  }
}

export class InMemoryUserCredentialPersistence implements UserCredentialPersistence {
  private readonly entries = new Map<string, PersistedUserCredential>();
  private readonly chains = new Map<string, Promise<void>>();

  async read(providerId: string): Promise<PersistedUserCredential | undefined> {
    return cloneEntry(this.entries.get(providerId));
  }

  modify(
    providerId: string,
    fn: (
      current: PersistedUserCredential | undefined,
    ) => Promise<PersistedUserCredential | undefined>,
  ): Promise<PersistedUserCredential | undefined> {
    return this.enqueue(providerId, async () => {
      const next = await fn(cloneEntry(this.entries.get(providerId)));
      if (next !== undefined) this.entries.set(providerId, cloneEntry(next));
      return cloneEntry(this.entries.get(providerId));
    });
  }

  delete(providerId: string): Promise<void> {
    return this.enqueue(providerId, async () => {
      this.entries.delete(providerId);
    });
  }

  private async enqueue<TResult>(
    providerId: string,
    operation: () => Promise<TResult>,
  ): Promise<TResult> {
    const previous = this.chains.get(providerId) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chain = previous.then(() => next);
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

export interface OpenNodeSqliteUserCredentialPersistenceOptions {
  readonly userDataRoot: string;
}

export class NodeSqliteUserCredentialPersistence implements UserCredentialPersistence {
  private chain: Promise<void> = Promise.resolve();
  private disposed = false;

  private constructor(private readonly database: DatabaseSync) {}

  static open(
    options: OpenNodeSqliteUserCredentialPersistenceOptions,
  ): NodeSqliteUserCredentialPersistence {
    const root = join(options.userDataRoot, "agent", "pi");
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const databasePath = join(root, "credentials.sqlite");
    const database = new DatabaseSync(databasePath, {
      enableForeignKeyConstraints: true,
      timeout: 5_000,
    });
    chmodSync(databasePath, 0o600);
    database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS pi_credentials (
        provider_id TEXT PRIMARY KEY,
        credential_json TEXT NOT NULL,
        provenance TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    return new NodeSqliteUserCredentialPersistence(database);
  }

  read(providerId: string): Promise<PersistedUserCredential | undefined> {
    return this.enqueue(async () => this.readCurrent(providerId));
  }

  modify(
    providerId: string,
    fn: (
      current: PersistedUserCredential | undefined,
    ) => Promise<PersistedUserCredential | undefined>,
  ): Promise<PersistedUserCredential | undefined> {
    return this.enqueue(async () => {
      this.database.exec("BEGIN IMMEDIATE");
      try {
        const current = this.readCurrent(providerId);
        const next = await fn(current);
        if (next !== undefined) {
          this.database
            .prepare(
              `INSERT INTO pi_credentials
                (provider_id, credential_json, provenance, updated_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(provider_id) DO UPDATE SET
                 credential_json = excluded.credential_json,
                 provenance = excluded.provenance,
                 updated_at = excluded.updated_at`,
            )
            .run(
              providerId,
              JSON.stringify(next.credential),
              next.provenance,
              next.updatedAt,
            );
        }
        this.database.exec("COMMIT");
        return next === undefined ? current : cloneEntry(next);
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw error;
      }
    });
  }

  delete(providerId: string): Promise<void> {
    return this.enqueue(async () => {
      this.database.exec("BEGIN IMMEDIATE");
      try {
        this.database
          .prepare("DELETE FROM pi_credentials WHERE provider_id = ?")
          .run(providerId);
        this.database.exec("COMMIT");
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw error;
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.database.close();
  }

  private readCurrent(providerId: string): PersistedUserCredential | undefined {
    const value = this.database
      .prepare(
        "SELECT credential_json, provenance, updated_at FROM pi_credentials WHERE provider_id = ?",
      )
      .get(providerId);
    if (value === undefined) return undefined;
    if (!isRecord(value)) throw new TypeError("Credential SQLite row must be a record.");
    const credentialJson = value["credential_json"];
    const provenance = value["provenance"];
    const updatedAt = value["updated_at"];
    if (
      typeof credentialJson !== "string" ||
      !isCredentialProvenance(provenance) ||
      typeof updatedAt !== "string"
    ) {
      throw new TypeError("Credential SQLite row has an invalid schema.");
    }
    const credential: unknown = JSON.parse(credentialJson);
    if (!isCredential(credential)) {
      throw new TypeError("Credential SQLite row contains an invalid Pi credential.");
    }
    return Object.freeze({ credential: structuredClone(credential), provenance, updatedAt });
  }

  private async enqueue<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    if (this.disposed) throw new Error("Credential persistence is disposed.");
    const previous = this.chain;
    let release: (() => void) | undefined;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.chain = previous.then(() => next);
    await previous;
    if (this.disposed) {
      release?.();
      throw new Error("Credential persistence is disposed.");
    }
    try {
      return await operation();
    } finally {
      release?.();
    }
  }
}

function toCredentialStatus(
  providerId: string,
  entry: PersistedUserCredential,
): CredentialStatus {
  return Object.freeze({
    providerId,
    type: entry.credential.type,
    provenance: entry.provenance,
    fingerprint: credentialFingerprint(entry.credential),
    updatedAt: entry.updatedAt,
    ...(entry.credential.type === "oauth" ? { expiresAt: entry.credential.expires } : {}),
  });
}

function credentialFingerprint(credential: Credential): string {
  return createHash("sha256").update(JSON.stringify(credential)).digest("hex").slice(0, 16);
}

function cloneCredential(credential: Credential): Credential;
function cloneCredential(credential: undefined): undefined;
function cloneCredential(credential: Credential | undefined): Credential | undefined;
function cloneCredential(credential: Credential | undefined): Credential | undefined {
  return credential === undefined ? undefined : structuredClone(credential);
}

function cloneEntry(entry: PersistedUserCredential): PersistedUserCredential;
function cloneEntry(entry: undefined): undefined;
function cloneEntry(
  entry: PersistedUserCredential | undefined,
): PersistedUserCredential | undefined;
function cloneEntry(
  entry: PersistedUserCredential | undefined,
): PersistedUserCredential | undefined {
  return entry === undefined
    ? undefined
    : {
        credential: structuredClone(entry.credential),
        provenance: entry.provenance,
        updatedAt: entry.updatedAt,
      };
}

function isCredentialProvenance(value: unknown): value is CredentialProvenance {
  return (
    value === "interactive" ||
    value === "user-config-import" ||
    value === "environment" ||
    value === "account-gateway"
  );
}

function isCredential(value: unknown): value is Credential {
  if (!isRecord(value)) return false;
  if (value["type"] === "api_key") {
    const key = value["key"];
    const env = value["env"];
    return (
      (key === undefined || typeof key === "string") &&
      (env === undefined ||
        (isRecord(env) && Object.values(env).every((entry) => typeof entry === "string")))
    );
  }
  return (
    value["type"] === "oauth" &&
    typeof value["access"] === "string" &&
    typeof value["refresh"] === "string" &&
    typeof value["expires"] === "number" &&
    Number.isFinite(value["expires"])
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
