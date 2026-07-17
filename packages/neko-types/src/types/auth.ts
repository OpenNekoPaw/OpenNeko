/**
 * Auth Types — shared interfaces for the Neko authentication system.
 *
 * Consumed by:
 *   @neko/auth-core   — OAuth + token management logic (Layer 0)
 *   neko-auth         — VSCode extension (VscodeTokenStorage)
 *   neko-agent cli    — runtime environment or Host system-keychain adapter
 */

// ---------------------------------------------------------------------------
// Cloud provider enum
// ---------------------------------------------------------------------------

export type CloudProvider = 'github' | 'gitlab' | 's3';

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/**
 * Authenticated Neko user session.
 * Replaces the webview-local SsoSession once backend is live.
 */
export interface IAuthSession {
  /** Display name or email */
  user: string;
  /** Plan tier, e.g. 'Free' | 'Pro' | 'Team' */
  plan?: string;
  /** Token usage this billing period */
  usage?: number;
  /** Bearer token for Neko API calls */
  accessToken: string;
  /** Opaque refresh token (absent for short-lived sessions) */
  refreshToken?: string;
  /** Expiry timestamp in Unix milliseconds */
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/**
 * Environment-agnostic token storage.
 *
 * Implementations:
 *   VscodeTokenStorage — backed by vscode.SecretStorage
 *   Host keychain storage — supplied by a CLI Host when persistent login exists
 */
export interface ITokenStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Auth provider
// ---------------------------------------------------------------------------

/**
 * High-level auth operations.
 * Implemented by NekoAuthService in @neko/auth-core.
 */
export interface IAuthProvider {
  getSession(): Promise<IAuthSession | null>;
  login(options?: { force?: boolean }): Promise<IAuthSession>;
  logout(): Promise<void>;
  refresh(): Promise<IAuthSession | null>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * OAuth 2.0 + PKCE configuration.
 * Set authUrl / tokenUrl to '' when the backend is not yet deployed;
 * login() will throw AuthNotConfiguredError in that case.
 */
export interface AuthConfig {
  clientId: string;
  /** Authorization endpoint. Empty string = not configured. */
  authUrl: string;
  /** Token endpoint. */
  tokenUrl: string;
  /** Neko official account AI catalog endpoint. Empty string = account AI unavailable. */
  aiCatalogUrl?: string;
  scopes: string[];
  /** Localhost redirect port for OAuth callback. Default: 6419 */
  redirectPort?: number;
}

// ---------------------------------------------------------------------------
// Cloud token request (Phase 2)
// ---------------------------------------------------------------------------

export interface CloudTokenRequest {
  provider: CloudProvider;
}
