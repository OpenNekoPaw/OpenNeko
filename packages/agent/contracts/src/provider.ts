/**
 * Provider Types — Superset of extension and webview ConfiguredProvider
 */

export interface ConfiguredProvider {
  id: string;
  type: string;
  name: string;
  connectionKind?: string;
  protocolProfile?: string;
  supportLevel?: string;
  requiresApiKey?: boolean;
  apiKey?: string;
  baseUrl?: string;
  /** Whether the provider is enabled (default true) */
  enabled?: boolean;
  /** Whether this is a built-in provider */
  builtin?: boolean;
  /** Additional auth fields (e.g., secretKey, accessKey) */
  authOptions?: Record<string, string>;
  /** Configured models for this provider */
  models?: Array<{
    id: string;
    name: string;
    enabled: boolean;
  }>;
}
