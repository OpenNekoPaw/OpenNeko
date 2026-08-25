import { isHostProjectedRuntimeValue } from '@neko/content-domain';

export type CanvasAuthoringDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface CanvasAuthoringSuggestedAction {
  readonly id: string;
  readonly label?: string;
  readonly toolName?: string;
  readonly requiresApproval?: boolean;
  readonly arguments?: Readonly<Record<string, unknown>>;
}

export interface CanvasAuthoringDiagnostic {
  readonly severity: CanvasAuthoringDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly target?: string;
  readonly expected?: unknown;
  readonly received?: unknown;
  readonly retryable?: boolean;
  readonly requiredQuery?: string;
  readonly suggestedActions?: readonly CanvasAuthoringSuggestedAction[];
}

export type CanvasAuthoringResultStatus = 'success' | 'partial' | 'blocked' | 'noop';

const RUNTIME_RESOURCE_IDENTITY_PATTERNS: readonly RegExp[] = [
  /^blob:/i,
  /^file:/i,
  /^data:/i,
  /^https?:\/\/127\.0\.0\.1(?::|\/)/i,
  /^https?:\/\/localhost(?::|\/)/i,
  /(?:^|\/)\.[^/]+(?:\/|$)/,
  /^\/tmp(?:\/|$)/i,
  /^\/var\/folders(?:\/|$)/i,
];

export function isRuntimeOnlyCanvasAuthoringResourceIdentityValue(value: string): boolean {
  const trimmed = value.trim();
  return (
    isHostProjectedRuntimeValue(trimmed) ||
    RUNTIME_RESOURCE_IDENTITY_PATTERNS.some((pattern) => pattern.test(trimmed))
  );
}
