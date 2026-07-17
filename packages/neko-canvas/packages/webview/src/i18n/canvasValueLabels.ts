import type { JsonPointerPath } from '@neko/shared';
import { t } from './index';

type FieldLabelKeyPrefix =
  | 'panel.cameraAngle'
  | 'panel.cameraMovement'
  | 'panel.galleryPreset'
  | 'panel.generationStatus'
  | 'panel.shotScale'
  | 'panel.timeOfDay';

const FIELD_LABEL_KEY_PREFIXES: Partial<Record<string, FieldLabelKeyPrefix>> = {
  '/cameraAngle': 'panel.cameraAngle',
  '/cameraMovement': 'panel.cameraMovement',
  '/generationStatus': 'panel.generationStatus',
  '/preset': 'panel.galleryPreset',
  '/shotScale': 'panel.shotScale',
  '/timeOfDay': 'panel.timeOfDay',
};

export function resolveCanvasOptionLabel(
  path: JsonPointerPath | string | undefined,
  value: string,
): string {
  const key = resolveCanvasValueLabelKey(path, value);
  if (!key) {
    return value;
  }

  const translated = t(key);
  return translated === key ? value : translated;
}

export function resolveCanvasStatusLabel(value: string): string {
  return resolveCanvasOptionLabel('/generationStatus', value);
}

function resolveCanvasValueLabelKey(
  path: JsonPointerPath | string | undefined,
  value: string,
): string | undefined {
  const prefix = path ? FIELD_LABEL_KEY_PREFIXES[path] : undefined;
  if (!prefix) {
    return undefined;
  }

  return `${prefix}.${toLabelKeySegment(value)}`;
}

function toLabelKeySegment(value: string): string {
  if (isUppercaseCode(value)) {
    return value.toLowerCase();
  }

  return value
    .replace(/-([0-9])/g, (_, next: string) => next)
    .replace(/([0-9])([a-z])/g, (_, digit: string, next: string) => `${digit}${next.toUpperCase()}`)
    .replace(/-([a-z])/g, (_, next: string) => next.toUpperCase());
}

function isUppercaseCode(value: string): boolean {
  return /^[A-Z0-9]+$/.test(value);
}
