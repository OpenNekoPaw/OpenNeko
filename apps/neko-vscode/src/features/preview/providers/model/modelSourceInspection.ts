import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  createResourceFingerprint,
  createResourceRef,
  type ModelPreviewDiagnostic,
  type ModelPreviewFormat,
  type PathResolver,
  type ResourceRef,
} from '@neko/shared';
import { requireModelFormatAdapter } from './modelFormatAdapters';

const DEFAULT_MODEL_SOURCE_LIMITS = Object.freeze({
  maxSourceBytes: 128 * 1024 * 1024,
  maxTextBytes: 8 * 1024 * 1024,
  maxDependencyCount: 64,
  maxDependencyBytes: 64 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024,
});

const SUPPORTED_OBJ_DECLARATIONS: ReadonlySet<string> = new Set([
  'v',
  'o',
  'g',
  'mtllib',
  'usemtl',
]);

export interface ModelSourceLimits {
  readonly maxSourceBytes: number;
  readonly maxTextBytes: number;
  readonly maxDependencyCount: number;
  readonly maxDependencyBytes: number;
  readonly maxTotalBytes: number;
}

export interface ModelSourceFileStat {
  readonly size: number;
  readonly mtimeMs: number;
  readonly isFile: boolean;
}

export interface ModelSourceFileSystem {
  stat(filePath: string, signal?: AbortSignal): Promise<ModelSourceFileStat>;
  readFile(filePath: string, signal?: AbortSignal): Promise<Uint8Array>;
}

export interface ModelSourceDependency {
  readonly reference: string;
  readonly filePath: string;
  readonly sizeBytes: number;
  readonly mtimeMs: number;
  readonly role: 'primary' | 'buffer' | 'image' | 'material' | 'texture';
}

export interface InspectedModelSource {
  readonly format: ModelPreviewFormat;
  readonly sourcePath: string;
  readonly sourceRef: ResourceRef;
  readonly sourceFingerprint: string;
  readonly dependencies: readonly ModelSourceDependency[];
  readonly totalSizeBytes: number;
}

export interface InspectModelSourceInput {
  readonly sourcePath: string;
  readonly authorizedRoots: readonly string[];
  readonly workspaceRoot?: string;
  readonly pathResolver?: PathResolver;
  readonly declaredMimeType?: string;
  readonly limits?: Partial<ModelSourceLimits>;
  readonly fileSystem?: ModelSourceFileSystem;
  readonly signal?: AbortSignal;
}

export class ModelSourceInspectionError extends Error {
  readonly diagnostic: ModelPreviewDiagnostic;

  constructor(diagnostic: ModelPreviewDiagnostic) {
    super(diagnostic.message);
    this.name = 'ModelSourceInspectionError';
    this.diagnostic = diagnostic;
  }
}

export async function inspectModelSource(
  input: InspectModelSourceInput,
): Promise<InspectedModelSource> {
  const fileSystem = input.fileSystem ?? NODE_MODEL_SOURCE_FILE_SYSTEM;
  const limits = { ...DEFAULT_MODEL_SOURCE_LIMITS, ...input.limits };
  const sourcePath = path.resolve(input.sourcePath);
  throwIfAborted(input.signal);
  if (!isInsideAnyRoot(sourcePath, input.authorizedRoots)) {
    throw sourceError('source-unauthorized', 'Model source is outside authorized roots.');
  }

  const adapter = requireAdapter(sourcePath, input.declaredMimeType);
  const sourceStat = await readStat(fileSystem, sourcePath, input.signal);
  requireSizeWithin(sourceStat.size, limits.maxSourceBytes, 'Model source exceeds the size limit.');
  if (
    (adapter.dependencyMode === 'gltf-json' || adapter.dependencyMode === 'obj-materials') &&
    sourceStat.size > limits.maxTextBytes
  ) {
    throw sourceError('source-too-large', 'Text model source exceeds the inspection limit.');
  }

  const sourceBytes = await fileSystem.readFile(sourcePath, input.signal);
  throwIfAborted(input.signal);
  validatePrimarySource(adapter.format, sourceBytes, sourceStat.size);

  const declarations =
    adapter.dependencyMode === 'gltf-json'
      ? enumerateGltfDependencies(sourcePath, decodeText(sourceBytes, sourcePath))
      : adapter.dependencyMode === 'obj-materials'
        ? await enumerateObjDependencies({
            sourcePath,
            sourceText: decodeText(sourceBytes, sourcePath),
            authorizedRoots: input.authorizedRoots,
            fileSystem,
            limits,
            signal: input.signal,
          })
        : [];

  if (declarations.length > limits.maxDependencyCount) {
    throw sourceError(
      'dependency-limit-exceeded',
      `Model declares ${declarations.length} dependencies; maximum is ${limits.maxDependencyCount}.`,
    );
  }

  const dependencies: ModelSourceDependency[] = [
    {
      reference: path.basename(sourcePath),
      filePath: sourcePath,
      sizeBytes: sourceStat.size,
      mtimeMs: sourceStat.mtimeMs,
      role: 'primary',
    },
  ];
  let totalSizeBytes = sourceStat.size;
  for (const declaration of declarations) {
    throwIfAborted(input.signal);
    if (!isInsideAnyRoot(declaration.filePath, input.authorizedRoots)) {
      throw sourceError(
        'source-unauthorized',
        `Model dependency is outside authorized roots: ${declaration.reference}`,
      );
    }
    const stat = await readStat(
      fileSystem,
      declaration.filePath,
      input.signal,
      declaration.reference,
    );
    requireSizeWithin(
      stat.size,
      limits.maxDependencyBytes,
      `Model dependency exceeds the size limit: ${declaration.reference}`,
    );
    totalSizeBytes += stat.size;
    if (totalSizeBytes > limits.maxTotalBytes) {
      throw sourceError(
        'dependency-limit-exceeded',
        'Model source graph exceeds the total size limit.',
      );
    }
    dependencies.push({ ...declaration, sizeBytes: stat.size, mtimeMs: stat.mtimeMs });
  }

  const portablePath = createPortableModelPath({
    sourcePath,
    workspaceRoot: input.workspaceRoot,
    pathResolver: input.pathResolver,
    authorizedRoots: input.authorizedRoots,
  });
  const sourceFingerprint = createSourceFingerprint(
    portablePath,
    dependencies.map((dependency) => ({
      reference: dependency.reference,
      sizeBytes: dependency.sizeBytes,
      mtimeMs: dependency.mtimeMs,
    })),
  );
  const sourceRef = createResourceRef({
    scope:
      input.workspaceRoot && isInsideRoot(sourcePath, input.workspaceRoot) ? 'project' : 'global',
    provider: 'model-preview-source',
    kind: 'media',
    source: {
      kind: 'file',
      ...(portablePath.startsWith('${WORKSPACE}/')
        ? { projectRelativePath: portablePath.slice('${WORKSPACE}/'.length) }
        : {}),
      uri: portablePath,
      identity: {
        sizeBytes: sourceStat.size,
        mtimeMs: sourceStat.mtimeMs,
        hash: sourceFingerprint,
      },
      metadata: { format: adapter.format },
    },
    locator: { kind: 'file', uri: portablePath },
    fingerprint: createResourceFingerprint({ strategy: 'mtime-size', value: sourceFingerprint }),
  });

  return {
    format: adapter.format,
    sourcePath,
    sourceRef,
    sourceFingerprint,
    dependencies,
    totalSizeBytes,
  };
}

export function createPortableModelPath(input: {
  readonly sourcePath: string;
  readonly workspaceRoot?: string;
  readonly pathResolver?: PathResolver;
  readonly authorizedRoots: readonly string[];
}): string {
  const contracted = input.pathResolver?.contract(input.sourcePath);
  if (contracted && contracted !== input.sourcePath) return contracted.replaceAll('\\', '/');
  if (input.workspaceRoot && isInsideRoot(input.sourcePath, input.workspaceRoot)) {
    return `\${WORKSPACE}/${path.relative(input.workspaceRoot, input.sourcePath).replaceAll('\\', '/')}`;
  }
  const owningRoot = input.authorizedRoots.find((root) => isInsideRoot(input.sourcePath, root));
  if (!owningRoot) {
    throw sourceError('source-unauthorized', 'Model source is outside authorized roots.');
  }
  const rootId = createHash('sha256').update(path.resolve(owningRoot)).digest('hex').slice(0, 16);
  const relativePath = path.relative(owningRoot, input.sourcePath).replaceAll('\\', '/');
  return `model-preview://authorized/${rootId}/${encodeURI(relativePath)}`;
}

function enumerateGltfDependencies(
  sourcePath: string,
  sourceText: string,
): ModelSourceDependencyDeclaration[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(sourceText);
  } catch {
    throw sourceError('load-failed', 'glTF source is not valid JSON.');
  }
  if (!isRecord(parsed) || !isRecord(parsed['asset']) || parsed['asset']['version'] !== '2.0') {
    throw sourceError('load-failed', 'glTF source must declare asset version 2.0.');
  }
  const declarations: ModelSourceDependencyDeclaration[] = [];
  const seen = new Set<string>();
  collectGltfUriEntries(parsed['buffers'], 'buffer', sourcePath, seen, declarations);
  collectGltfUriEntries(parsed['images'], 'image', sourcePath, seen, declarations);
  return declarations;
}

async function enumerateObjDependencies(input: {
  readonly sourcePath: string;
  readonly sourceText: string;
  readonly authorizedRoots: readonly string[];
  readonly fileSystem: ModelSourceFileSystem;
  readonly limits: ModelSourceLimits;
  readonly signal?: AbortSignal;
}): Promise<ModelSourceDependencyDeclaration[]> {
  if (!hasSupportedObjDeclaration(input.sourceText)) {
    throw sourceError('load-failed', 'OBJ source contains no supported model declarations.');
  }
  const declarations: ModelSourceDependencyDeclaration[] = [];
  const seen = new Set<string>();
  const materialReferences = collectObjMaterialReferences(input.sourceText);
  for (const reference of materialReferences) {
    const material = createDependencyDeclaration(reference, input.sourcePath, 'material');
    addUniqueDeclaration(material, seen, declarations);
    if (!isInsideAnyRoot(material.filePath, input.authorizedRoots)) {
      throw sourceError(
        'source-unauthorized',
        `OBJ material is outside authorized roots: ${reference}`,
      );
    }
    const stat = await readStat(input.fileSystem, material.filePath, input.signal, reference);
    if (stat.size > input.limits.maxTextBytes) {
      throw sourceError('source-too-large', `MTL dependency exceeds the text limit: ${reference}`);
    }
    const materialText = decodeText(
      await input.fileSystem.readFile(material.filePath, input.signal),
      material.filePath,
    );
    for (const textureReference of collectMtlTextureReferences(materialText)) {
      addUniqueDeclaration(
        createDependencyDeclaration(textureReference, material.filePath, 'texture'),
        seen,
        declarations,
      );
    }
  }
  return declarations;
}

function hasSupportedObjDeclaration(sourceText: string): boolean {
  return sourceText.split(/\r?\n/u).some((line) => {
    const normalized = line.trim();
    if (!normalized || normalized.startsWith('#')) return false;
    const [directive] = normalized.split(/\s/u, 1);
    return directive !== undefined && SUPPORTED_OBJ_DECLARATIONS.has(directive);
  });
}

function collectGltfUriEntries(
  value: unknown,
  role: 'buffer' | 'image',
  sourcePath: string,
  seen: Set<string>,
  declarations: ModelSourceDependencyDeclaration[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    throw sourceError('load-failed', `glTF ${role} declarations must be an array.`);
  }
  for (const entry of value) {
    if (!isRecord(entry) || entry['uri'] === undefined) continue;
    if (typeof entry['uri'] !== 'string' || entry['uri'].length === 0) {
      throw sourceError('unsafe-dependency', `glTF ${role} URI must be a non-empty string.`);
    }
    if (entry['uri'].startsWith('data:')) continue;
    addUniqueDeclaration(
      createDependencyDeclaration(entry['uri'], sourcePath, role),
      seen,
      declarations,
    );
  }
}

function collectObjMaterialReferences(sourceText: string): string[] {
  const references: string[] = [];
  for (const line of sourceText.split(/\r?\n/)) {
    const match = line.match(/^\s*mtllib\s+(.+?)\s*$/i);
    if (!match?.[1]) continue;
    const tokens = tokenizeReferenceList(match[1]);
    if (tokens.length === 0) {
      throw sourceError('unsafe-dependency', 'OBJ mtllib declaration is empty.');
    }
    references.push(...tokens);
  }
  return references;
}

function collectMtlTextureReferences(sourceText: string): string[] {
  const references: string[] = [];
  const textureCommand = /^(?:map_Ka|map_Kd|map_Ks|map_Ke|map_d|map_Bump|bump|disp|decal|norm)$/i;
  for (const line of sourceText.split(/\r?\n/)) {
    const tokens = tokenizeReferenceList(line.trim());
    const command = tokens[0];
    if (!command || !textureCommand.test(command)) continue;
    const reference = tokens[tokens.length - 1];
    if (!reference || reference.startsWith('-')) {
      throw sourceError('unsafe-dependency', `MTL texture declaration is invalid: ${line.trim()}`);
    }
    references.push(reference);
  }
  return references;
}

function tokenizeReferenceList(value: string): string[] {
  const tokens: string[] = [];
  const matcher = /"([^"]+)"|'([^']+)'|([^\s]+)/g;
  for (const match of value.matchAll(matcher)) {
    const token = match[1] ?? match[2] ?? match[3];
    if (token) tokens.push(token);
  }
  return tokens;
}

interface ModelSourceDependencyDeclaration {
  readonly reference: string;
  readonly filePath: string;
  readonly role: ModelSourceDependency['role'];
}

function createDependencyDeclaration(
  reference: string,
  declaringPath: string,
  role: ModelSourceDependency['role'],
): ModelSourceDependencyDeclaration {
  const decoded = validateLocalDependencyReference(reference);
  return {
    reference,
    filePath: path.resolve(path.dirname(declaringPath), decoded),
    role,
  };
}

function validateLocalDependencyReference(reference: string): string {
  if (
    !reference ||
    reference.includes('\0') ||
    reference.includes('?') ||
    reference.includes('#')
  ) {
    throw sourceError('unsafe-dependency', `Unsupported model dependency reference: ${reference}`);
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(reference);
  } catch {
    throw sourceError('unsafe-dependency', `Invalid encoded model dependency: ${reference}`);
  }
  if (
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(decoded) ||
    path.isAbsolute(decoded) ||
    /^[A-Za-z]:[\\/]/.test(decoded) ||
    decoded.startsWith('\\\\')
  ) {
    throw sourceError('unsafe-dependency', `Model dependency must be relative: ${reference}`);
  }
  const segments = decoded.replaceAll('\\', '/').split('/');
  if (segments.some((segment) => segment === '..')) {
    throw sourceError(
      'unsafe-dependency',
      `Model dependency traversal is not allowed: ${reference}`,
    );
  }
  return decoded;
}

function addUniqueDeclaration(
  declaration: ModelSourceDependencyDeclaration,
  seen: Set<string>,
  declarations: ModelSourceDependencyDeclaration[],
): void {
  const pathKey = `path:${path.normalize(declaration.filePath)}`;
  const referenceKey = `reference:${declaration.reference}`;
  if (seen.has(pathKey) || seen.has(referenceKey)) {
    throw sourceError('unsafe-dependency', `Duplicate model dependency: ${declaration.reference}`);
  }
  seen.add(pathKey);
  seen.add(referenceKey);
  declarations.push(declaration);
}

function validatePrimarySource(
  format: ModelPreviewFormat,
  bytes: Uint8Array,
  declaredSize: number,
): void {
  if (bytes.byteLength !== declaredSize) {
    throw sourceError('load-failed', 'Model source changed while it was being inspected.');
  }
  switch (format) {
    case 'glb': {
      if (bytes.byteLength < 12 || readAscii(bytes, 0, 4) !== 'glTF') {
        throw sourceError('mime-mismatch', 'GLB source is missing the glTF binary signature.');
      }
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength) {
        throw sourceError('load-failed', 'GLB source has an unsupported version or length.');
      }
      break;
    }
    case 'stl': {
      const textPrefix = readAscii(bytes, 0, Math.min(bytes.byteLength, 256)).trimStart();
      const binaryValid =
        bytes.byteLength >= 84 &&
        84 +
          new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true) *
            50 ===
          bytes.byteLength;
      if (!binaryValid && !(textPrefix.startsWith('solid') && textPrefix.includes('facet'))) {
        throw sourceError('mime-mismatch', 'STL source is neither valid binary nor ASCII STL.');
      }
      break;
    }
    case 'ply':
      if (
        !readAscii(bytes, 0, Math.min(bytes.byteLength, 128)).startsWith('ply\n') &&
        !readAscii(bytes, 0, Math.min(bytes.byteLength, 128)).startsWith('ply\r\n')
      ) {
        throw sourceError('mime-mismatch', 'PLY source is missing the PLY header.');
      }
      break;
    case 'gltf':
    case 'obj':
      if (bytes.byteLength === 0) {
        throw sourceError('load-failed', 'Model source is empty.');
      }
      break;
  }
}

function createSourceFingerprint(
  portablePath: string,
  identities: readonly Record<string, unknown>[],
): string {
  return createHash('sha256').update(JSON.stringify({ portablePath, identities })).digest('hex');
}

function requireAdapter(sourcePath: string, mimeType?: string) {
  try {
    return requireModelFormatAdapter(sourcePath, mimeType);
  } catch {
    throw sourceError(
      'unsupported-format',
      `Unsupported or mismatched model format: ${path.basename(sourcePath)}`,
    );
  }
}

async function readStat(
  fileSystem: ModelSourceFileSystem,
  filePath: string,
  signal?: AbortSignal,
  reference?: string,
): Promise<ModelSourceFileStat> {
  throwIfAborted(signal);
  try {
    const stat = await fileSystem.stat(filePath, signal);
    throwIfAborted(signal);
    if (!stat.isFile) throw new Error('not-file');
    return stat;
  } catch (error) {
    if (signal?.aborted) throw error;
    throw sourceError(
      reference ? 'missing-dependency' : 'source-missing',
      reference
        ? `Model dependency is missing: ${reference}`
        : `Model source is missing: ${path.basename(filePath)}`,
    );
  }
}

function requireSizeWithin(size: number, maximum: number, message: string): void {
  if (!Number.isSafeInteger(size) || size < 0 || size > maximum) {
    throw sourceError('source-too-large', message);
  }
}

function decodeText(bytes: Uint8Array, filePath: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw sourceError(
      'load-failed',
      `Model text source is not valid UTF-8: ${path.basename(filePath)}`,
    );
  }
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return new TextDecoder().decode(bytes.subarray(offset, offset + length));
}

function isInsideAnyRoot(candidate: string, roots: readonly string[]): boolean {
  return roots.some((root) => isInsideRoot(candidate, root));
}

function isInsideRoot(candidate: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  signal?.throwIfAborted();
}

function sourceError(
  code: ModelPreviewDiagnostic['code'],
  message: string,
): ModelSourceInspectionError {
  return new ModelSourceInspectionError({ code, message, severity: 'error' });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const NODE_MODEL_SOURCE_FILE_SYSTEM: ModelSourceFileSystem = {
  async stat(filePath, signal) {
    signal?.throwIfAborted();
    const stat = await fs.stat(filePath);
    signal?.throwIfAborted();
    return { size: stat.size, mtimeMs: stat.mtimeMs, isFile: stat.isFile() };
  },
  async readFile(filePath, signal) {
    return fs.readFile(filePath, signal ? { signal } : undefined);
  },
};
