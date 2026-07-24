import { isWebviewLikeRuntimeValue } from './content-access';
import type { ArtifactResourceRef } from './composite-artifact';
import type { NarrativeAssetRef } from './narrative-asset';

export const NARRATIVE_PRODUCTION_BINDING_KINDS = [
  'storyboard-scene',
  'storyboard-shot',
  'canvas-node',
  'cut-clip',
  'generated-video',
  'asset',
] as const;

export const NARRATIVE_PRODUCTION_BINDING_ROLES = [
  'primary',
  'fallback',
  'preview',
  'source',
] as const;

export type NarrativeProductionBindingKind = (typeof NARRATIVE_PRODUCTION_BINDING_KINDS)[number];
export type NarrativeProductionBindingRole = (typeof NARRATIVE_PRODUCTION_BINDING_ROLES)[number];

export type NarrativeProductionBindingTarget =
  | {
      readonly kind: 'storyboard-scene';
      readonly storyboardRef?: string;
      readonly sceneId: string;
    }
  | {
      readonly kind: 'storyboard-shot';
      readonly storyboardRef?: string;
      readonly sceneId?: string;
      readonly shotId: string;
    }
  | {
      readonly kind: 'canvas-node';
      readonly canvasRef?: string;
      readonly nodeId: string;
    }
  | {
      readonly kind: 'cut-clip';
      readonly projectRef?: string;
      readonly clipId: string;
      readonly timelineId?: string;
    }
  | {
      readonly kind: 'generated-video';
      readonly ref: ArtifactResourceRef;
    }
  | {
      readonly kind: 'asset';
      readonly ref: ArtifactResourceRef | NarrativeAssetRef;
    };

export interface NarrativeProductionBinding {
  readonly bindingId: string;
  readonly role: NarrativeProductionBindingRole;
  readonly target: NarrativeProductionBindingTarget;
  readonly label?: string;
  readonly startMs?: number;
  readonly endMs?: number;
  readonly metadata?: Record<string, unknown>;
}

export type NarrativeProductionBindingDiagnosticCode =
  'invalid-production-binding' | 'missing-target-narrative-node' | 'non-durable-production-binding';

export interface NarrativeProductionBindingDiagnostic {
  readonly code: NarrativeProductionBindingDiagnosticCode;
  readonly severity: 'warning' | 'error';
  readonly message: string;
  readonly bindingId?: string;
  readonly nodeId?: string;
}

export function isNarrativeProductionBinding(value: unknown): value is NarrativeProductionBinding {
  if (!isRecord(value)) return false;
  return (
    typeof value['bindingId'] === 'string' &&
    isProductionBindingRole(value['role']) &&
    isProductionBindingTarget(value['target'])
  );
}

export function validateNarrativeProductionBinding(
  binding: NarrativeProductionBinding,
): readonly NarrativeProductionBindingDiagnostic[] {
  return containsUnsafeRuntimeValue(binding)
    ? [
        {
          code: 'non-durable-production-binding',
          severity: 'error',
          message:
            'Narrative production bindings must use durable refs and must not persist runtime URLs or absolute local paths.',
          bindingId: binding.bindingId,
        },
      ]
    : [];
}

function isProductionBindingTarget(value: unknown): value is NarrativeProductionBindingTarget {
  if (!isRecord(value) || !isProductionBindingKind(value['kind'])) return false;
  switch (value['kind']) {
    case 'storyboard-scene':
      return typeof value['sceneId'] === 'string';
    case 'storyboard-shot':
      return typeof value['shotId'] === 'string';
    case 'canvas-node':
      return typeof value['nodeId'] === 'string';
    case 'cut-clip':
      return typeof value['clipId'] === 'string';
    case 'generated-video':
    case 'asset':
      return isRecord(value['ref']);
  }
}

function isProductionBindingKind(value: unknown): value is NarrativeProductionBindingKind {
  return (
    typeof value === 'string' &&
    (NARRATIVE_PRODUCTION_BINDING_KINDS as readonly string[]).includes(value)
  );
}

function isProductionBindingRole(value: unknown): value is NarrativeProductionBindingRole {
  return (
    typeof value === 'string' &&
    (NARRATIVE_PRODUCTION_BINDING_ROLES as readonly string[]).includes(value)
  );
}

function containsUnsafeRuntimeValue(
  value: unknown,
  seen: ReadonlySet<object> = new Set(),
): boolean {
  if (typeof value === 'string') {
    return isUnsafePersistentString(value);
  }
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  const nextSeen = new Set(seen).add(value);
  if (Array.isArray(value)) return value.some((item) => containsUnsafeRuntimeValue(item, nextSeen));
  return Object.values(value).some((item) => containsUnsafeRuntimeValue(item, nextSeen));
}

function isUnsafePersistentString(value: string): boolean {
  const trimmed = value.trim();
  return (
    isWebviewLikeRuntimeValue(trimmed) ||
    /^vscode-webview:\/\//i.test(trimmed) ||
    /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(trimmed) ||
    /^file:\/\//i.test(trimmed) ||
    /^[A-Za-z]:[\\/]/.test(trimmed) ||
    trimmed.startsWith('/') ||
    trimmed.includes('/.neko/.cache/')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
