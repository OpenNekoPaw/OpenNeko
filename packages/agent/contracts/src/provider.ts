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
  baseUrl?: string;
  /** Whether the provider is enabled (default true) */
  enabled?: boolean;
  /** Whether this is a built-in provider */
  builtin?: boolean;
  /** Configured models for this provider */
  models?: Array<{
    id: string;
    name: string;
    enabled: boolean;
  }>;
}
