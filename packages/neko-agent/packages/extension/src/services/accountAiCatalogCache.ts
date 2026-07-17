import type { AccountAiCatalogSnapshot, IAuthSession } from '@neko/shared';

export interface AccountAiCatalogAuthApi {
  getSession(): Promise<IAuthSession | null>;
  getAccountAiCatalog(options?: {
    forceRefresh?: boolean;
  }): Promise<AccountAiCatalogSnapshot | null>;
}

export interface AccountAiCatalogCacheOptions {
  readonly getAuth: () => Promise<AccountAiCatalogAuthApi | undefined>;
  readonly now?: () => number;
  readonly logger?: {
    warn?(message: string, details?: unknown): void;
  };
}

export interface AccountAiCatalogCacheResult {
  readonly snapshot: AccountAiCatalogSnapshot | null;
  readonly refreshed: boolean;
}

export class AccountAiCatalogAuthorizationError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AccountAiCatalogAuthorizationError';
  }
}

export class AccountAiCatalogCache {
  private snapshot: AccountAiCatalogSnapshot | null = null;
  private readonly now: () => number;

  constructor(private readonly options: AccountAiCatalogCacheOptions) {
    this.now = options.now ?? Date.now;
  }

  getCachedSnapshot(): AccountAiCatalogSnapshot | null {
    return this.isFresh(this.snapshot) ? this.snapshot : null;
  }

  peekSnapshot(): AccountAiCatalogSnapshot | null {
    return this.snapshot;
  }

  clear(): void {
    this.snapshot = null;
  }

  invalidateForAuthFailure(error: unknown): void {
    if (isAuthorizationFailure(error)) {
      this.clear();
    }
  }

  invalidateIfVersionMismatch(input: { version?: string; etag?: string }): boolean {
    if (!this.snapshot) return false;
    const versionMismatch =
      input.version !== undefined &&
      this.snapshot.version !== undefined &&
      input.version !== this.snapshot.version;
    const etagMismatch =
      input.etag !== undefined &&
      this.snapshot.etag !== undefined &&
      input.etag !== this.snapshot.etag;
    if (!versionMismatch && !etagMismatch) return false;
    this.clear();
    return true;
  }

  async getSnapshot(
    options: { forceRefresh?: boolean } = {},
  ): Promise<AccountAiCatalogCacheResult> {
    if (!options.forceRefresh && this.isFresh(this.snapshot)) {
      return { snapshot: this.snapshot, refreshed: false };
    }

    return this.refresh({
      ...(options.forceRefresh !== undefined ? { forceRefresh: options.forceRefresh } : {}),
    });
  }

  async refresh(options: { forceRefresh?: boolean } = {}): Promise<AccountAiCatalogCacheResult> {
    const auth = await this.options.getAuth();
    if (!auth) {
      this.clear();
      return { snapshot: null, refreshed: true };
    }

    const session = await auth.getSession();
    if (!session) {
      this.clear();
      return { snapshot: null, refreshed: true };
    }

    try {
      const snapshot = await auth.getAccountAiCatalog({
        ...(options.forceRefresh !== undefined ? { forceRefresh: options.forceRefresh } : {}),
      });
      this.snapshot = snapshot;
      return { snapshot, refreshed: true };
    } catch (error) {
      if (isAuthorizationFailure(error)) {
        this.clear();
      }
      throw error;
    }
  }

  async handleSessionChanged(session: IAuthSession | null): Promise<AccountAiCatalogCacheResult> {
    if (!session) {
      this.clear();
      return { snapshot: null, refreshed: true };
    }
    return this.refresh({ forceRefresh: true });
  }

  private isFresh(snapshot: AccountAiCatalogSnapshot | null): snapshot is AccountAiCatalogSnapshot {
    return !!snapshot && snapshot.status === 'available' && snapshot.expiresAt > this.now();
  }
}

export function isAuthorizationFailure(error: unknown): boolean {
  const maybe = error as { status?: unknown; isTokenInvalid?: unknown; code?: unknown } | null;
  return (
    !!maybe &&
    (maybe.isTokenInvalid === true ||
      maybe.status === 401 ||
      maybe.status === 403 ||
      maybe.code === 'AUTH_ENTITLEMENT_ERROR')
  );
}
