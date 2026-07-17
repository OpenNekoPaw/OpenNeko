import type { ScriptScene } from '@neko/shared';

function asFiniteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function normalizeScriptScenes(value: unknown): ScriptScene[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((scene, index) => {
    const raw = typeof scene === 'object' && scene !== null ? scene : {};
    const rawId = (raw as { id?: unknown }).id;
    const rawTitle = (raw as { title?: unknown }).title;

    return {
      id: typeof rawId === 'string' && rawId.length > 0 ? rawId : `script-scene-${index}`,
      title: typeof rawTitle === 'string' ? rawTitle : '',
      lineStart: asFiniteNumber((raw as { lineStart?: unknown }).lineStart),
      lineEnd: asFiniteNumber((raw as { lineEnd?: unknown }).lineEnd),
    };
  });
}
