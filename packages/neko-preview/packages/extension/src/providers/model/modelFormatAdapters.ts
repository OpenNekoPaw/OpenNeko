import type { ModelPreviewFormat } from '@neko/shared';

export interface ModelFormatAdapter {
  readonly format: ModelPreviewFormat;
  readonly extensions: readonly string[];
  readonly mimeTypes: readonly string[];
  readonly dependencyMode: 'primary-only' | 'gltf-json' | 'obj-materials';
  readonly loader: 'gltf' | 'obj' | 'stl' | 'ply';
}

export const MODEL_FORMAT_ADAPTERS: readonly ModelFormatAdapter[] = Object.freeze([
  Object.freeze({
    format: 'glb',
    extensions: Object.freeze(['.glb']),
    mimeTypes: Object.freeze(['model/gltf-binary', 'application/octet-stream']),
    dependencyMode: 'primary-only',
    loader: 'gltf',
  }),
  Object.freeze({
    format: 'gltf',
    extensions: Object.freeze(['.gltf']),
    mimeTypes: Object.freeze(['model/gltf+json', 'application/json']),
    dependencyMode: 'gltf-json',
    loader: 'gltf',
  }),
  Object.freeze({
    format: 'obj',
    extensions: Object.freeze(['.obj']),
    mimeTypes: Object.freeze(['model/obj', 'text/plain']),
    dependencyMode: 'obj-materials',
    loader: 'obj',
  }),
  Object.freeze({
    format: 'stl',
    extensions: Object.freeze(['.stl']),
    mimeTypes: Object.freeze(['model/stl', 'application/sla', 'application/octet-stream']),
    dependencyMode: 'primary-only',
    loader: 'stl',
  }),
  Object.freeze({
    format: 'ply',
    extensions: Object.freeze(['.ply']),
    mimeTypes: Object.freeze(['model/ply', 'application/octet-stream', 'text/plain']),
    dependencyMode: 'primary-only',
    loader: 'ply',
  }),
]);

export function findModelFormatAdapter(
  fileName: string,
  mimeType?: string,
): ModelFormatAdapter | undefined {
  const normalizedName = fileName.toLowerCase();
  const adapter = MODEL_FORMAT_ADAPTERS.find((candidate) =>
    candidate.extensions.some((extension) => normalizedName.endsWith(extension)),
  );
  if (!adapter) return undefined;
  if (mimeType && !adapter.mimeTypes.includes(normalizeMimeType(mimeType))) return undefined;
  return adapter;
}

export function requireModelFormatAdapter(fileName: string, mimeType?: string): ModelFormatAdapter {
  const adapter = findModelFormatAdapter(fileName, mimeType);
  if (!adapter) {
    throw new Error(`Unsupported or mismatched model format: ${fileName}`);
  }
  return adapter;
}

function normalizeMimeType(mimeType: string): string {
  return mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}
