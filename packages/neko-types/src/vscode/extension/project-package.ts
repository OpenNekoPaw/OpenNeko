import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as vscode from 'vscode';
import type { ContentAccessService } from './content-access-service';
import { HostContentAccessService } from './content-access-service';
import { SourceFileContentAccessProvider } from './content-access-providers';
import {
  createHostContentMediaPathContext,
  resolveHostContentMediaPath,
} from './content-path-resolver';

export interface ProjectPackageRequest {
  readonly packageId: string;
  readonly title: string;
  readonly sourceUri: vscode.Uri;
  readonly sourceBytes?: Uint8Array;
  readonly metadata?: Record<string, unknown>;
  readonly contentAccess?: ContentAccessService;
}

export interface ProjectPackageResult {
  readonly packagePath: string;
  readonly entries: readonly string[];
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const MAX_REFERENCE_COUNT = 1000;
const MAX_REFERENCE_SCAN_DEPTH = 4;
const LOCAL_FILE_EXTENSIONS = new Set([
  '.aac',
  '.aif',
  '.aiff',
  '.apng',
  '.ass',
  '.avif',
  '.avi',
  '.basis',
  '.bin',
  '.blend',
  '.bmp',
  '.caf',
  '.cbr',
  '.cbz',
  '.cjs',
  '.comp',
  '.css',
  '.csv',
  '.cube',
  '.dae',
  '.dds',
  '.doc',
  '.docx',
  '.exr',
  '.fbx',
  '.fdx',
  '.flac',
  '.fountain',
  '.frag',
  '.gif',
  '.glb',
  '.gltf',
  '.glsl',
  '.gz',
  '.hdr',
  '.heic',
  '.heif',
  '.html',
  '.ico',
  '.js',
  '.json',
  '.jsx',
  '.jxl',
  '.jpeg',
  '.jpg',
  '.ktx',
  '.ktx2',
  '.lrc',
  '.lua',
  '.m4a',
  '.m4v',
  '.md',
  '.mid',
  '.midi',
  '.mjs',
  '.mkv',
  '.moc',
  '.moc3',
  '.mpg',
  '.mov',
  '.mp3',
  '.mp4',
  '.mpeg',
  '.mtl',
  '.mxf',
  '.nkc',
  '.nkchar',
  '.nkcut',
  '.nkeffect',
  '.nkentity',
  '.nkexpr',
  '.nkbind',
  '.nkv',
  '.obj',
  '.ogg',
  '.ogv',
  '.otf',
  '.opus',
  '.pdf',
  '.ply',
  '.png',
  '.psb',
  '.psd',
  '.py',
  '.rar',
  '.safetensors',
  '.srt',
  '.ssa',
  '.story',
  '.stl',
  '.svg',
  '.tar',
  '.tga',
  '.tif',
  '.tiff',
  '.ts',
  '.tsv',
  '.tsx',
  '.txt',
  '.usd',
  '.usda',
  '.usdc',
  '.usdz',
  '.vert',
  '.vtt',
  '.vrm',
  '.wav',
  '.webm',
  '.webp',
  '.wgsl',
  '.wmv',
  '.woff',
  '.woff2',
  '.xml',
  '.yaml',
  '.yml',
  '.zip',
]);

export async function createProjectSnapshotPackage(
  request: ProjectPackageRequest,
): Promise<ProjectPackageResult | undefined> {
  const defaultUri = vscode.Uri.file(defaultPackagePath(request.sourceUri.fsPath));
  const outputUri = await vscode.window.showSaveDialog({
    title: request.title,
    defaultUri,
    filters: {
      'ZIP Archive': ['zip'],
    },
  });
  if (!outputUri) return undefined;

  const sourceFileName = path.basename(request.sourceUri.fsPath);
  const sourceBytes =
    request.sourceBytes ?? (await vscode.workspace.fs.readFile(request.sourceUri));
  const packageAssets = await collectPackageAssets({
    sourceBytes,
    sourcePath: request.sourceUri.fsPath,
    sourceDir: path.dirname(request.sourceUri.fsPath),
    contentAccess:
      request.contentAccess ?? (await createDefaultPackageContentAccessService(request.sourceUri)),
  });

  const manifest = {
    version: 1,
    packageId: request.packageId,
    createdAt: new Date().toISOString(),
    source: {
      fileName: sourceFileName,
      scheme: request.sourceUri.scheme,
    },
    assets: packageAssets.assets,
    missingReferences: packageAssets.missingReferences,
    metadata: request.metadata ?? {},
  };
  const entries = [
    {
      name: 'package-manifest.json',
      data: textEncoder.encode(JSON.stringify(manifest, null, 2)),
    },
    {
      name: sourceFileName,
      data: sourceBytes,
    },
    ...packageAssets.entries,
  ];
  await vscode.workspace.fs.writeFile(outputUri, createZipArchive(entries));

  void vscode.window.showInformationMessage(`Package created: ${outputUri.fsPath}`);
  return {
    packagePath: outputUri.fsPath,
    entries: entries.map((entry) => entry.name),
  };
}

interface ZipEntryInput {
  readonly name: string;
  readonly data: Uint8Array;
}

interface PackageAssetManifestEntry {
  readonly packagePath: string;
  readonly fileName: string;
  readonly source: PackageReferenceManifestSource;
}

interface PackageMissingReference {
  readonly fileName?: string;
  readonly source: PackageReferenceManifestSource;
  readonly reason: 'missing' | 'unsupported-reference' | 'read-failed' | 'runtime-only';
}

type PackageReferenceManifestSource =
  | {
      readonly kind: 'relative';
      readonly reference: string;
    }
  | {
      readonly kind: 'absolute';
      readonly fileName: string;
    }
  | {
      readonly kind: 'file-uri';
      readonly fileName: string;
    }
  | {
      readonly kind: 'variable';
      readonly reference: string;
    };

interface PendingReference {
  readonly raw: string;
  readonly baseDir: string;
  readonly depth: number;
  readonly runtimeOnly?: boolean;
}

interface ResolvedReference {
  readonly filePath: string;
  readonly uri: vscode.Uri;
  readonly source: PackageReferenceManifestSource;
}

interface PackageAssetCollection {
  readonly entries: readonly ZipEntryInput[];
  readonly assets: readonly PackageAssetManifestEntry[];
  readonly missingReferences: readonly PackageMissingReference[];
}

interface PreparedZipEntry extends ZipEntryInput {
  readonly nameBytes: Uint8Array;
  readonly crc32: number;
  readonly localHeaderOffset: number;
}

function createZipArchive(entries: readonly ZipEntryInput[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const preparedEntries: PreparedZipEntry[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = textEncoder.encode(entry.name);
    assertZip32Size(entry.data.length, 'ZIP entry data');
    assertZip16Size(nameBytes.length, 'ZIP entry name');

    const prepared: PreparedZipEntry = {
      ...entry,
      nameBytes,
      crc32: crc32(entry.data),
      localHeaderOffset: offset,
    };
    const header = createLocalFileHeader(prepared);
    chunks.push(header, entry.data);
    offset += header.length + entry.data.length;
    preparedEntries.push(prepared);
  }

  const centralDirectoryOffset = offset;
  for (const entry of preparedEntries) {
    const header = createCentralDirectoryHeader(entry);
    chunks.push(header);
    offset += header.length;
  }
  const centralDirectorySize = offset - centralDirectoryOffset;
  assertZip32Size(centralDirectoryOffset, 'ZIP central directory offset');
  assertZip32Size(centralDirectorySize, 'ZIP central directory size');
  assertZip16Size(preparedEntries.length, 'ZIP entry count');
  chunks.push(
    createEndOfCentralDirectory({
      entryCount: preparedEntries.length,
      centralDirectorySize,
      centralDirectoryOffset,
    }),
  );

  return concatBytes(chunks);
}

async function collectPackageAssets(options: {
  readonly sourceBytes: Uint8Array;
  readonly sourcePath: string;
  readonly sourceDir: string;
  readonly contentAccess: ContentAccessService;
}): Promise<PackageAssetCollection> {
  const entries: ZipEntryInput[] = [];
  const assets: PackageAssetManifestEntry[] = [];
  const missingReferences: PackageMissingReference[] = [];
  const usedEntryNames = new Set(['package-manifest.json', path.basename(options.sourcePath)]);
  const includedFiles = new Set([normalizeFsPath(options.sourcePath)]);
  const reportedMissing = new Set<string>();
  const pending = discoverReferences(options.sourceBytes, options.sourceDir, 0);

  while (pending.length > 0 && includedFiles.size < MAX_REFERENCE_COUNT) {
    const reference = pending.shift();
    if (!reference) break;

    if (reference.runtimeOnly) {
      reportMissingReference(
        missingReferences,
        reportedMissing,
        sourceFromReference(reference.raw),
        'runtime-only',
      );
      continue;
    }

    const resolved = await resolveReference(reference.raw, reference.baseDir);
    if (!resolved) continue;

    if ('reason' in resolved) {
      reportMissingReference(missingReferences, reportedMissing, resolved.source, resolved.reason);
      continue;
    }

    const normalizedPath = normalizeFsPath(resolved.filePath);
    if (includedFiles.has(normalizedPath)) {
      continue;
    }

    const bytes = await readPackageReferenceBytes(options.contentAccess, resolved.filePath);
    if (!bytes) {
      reportMissingReference(missingReferences, reportedMissing, resolved.source, 'read-failed');
      continue;
    }

    const packagePath = allocatePackageEntryPath(
      resolved.filePath,
      options.sourceDir,
      usedEntryNames,
    );
    entries.push({ name: packagePath, data: bytes });
    assets.push({
      packagePath,
      fileName: path.basename(resolved.filePath),
      source: resolved.source,
    });
    includedFiles.add(normalizedPath);

    if (
      reference.depth < MAX_REFERENCE_SCAN_DEPTH &&
      shouldScanNestedReferences(resolved.filePath)
    ) {
      pending.push(
        ...discoverReferences(bytes, path.dirname(resolved.filePath), reference.depth + 1),
      );
    }
  }

  return { entries, assets, missingReferences };
}

function discoverReferences(bytes: Uint8Array, baseDir: string, depth: number): PendingReference[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(textDecoder.decode(bytes));
  } catch {
    return [];
  }

  const refs: PendingReference[] = [];
  const seen = new Set<string>();

  const visit = (value: unknown, keyPath: readonly string[]) => {
    if (typeof value === 'string') {
      if (isArchiveEntryReferenceContext(keyPath)) {
        return;
      }
      const reference = normalizeReferenceCandidate(value);
      if (reference && isLocalFileReferenceCandidate(reference, keyPath)) {
        const key = `${baseDir}\u0000${reference}`;
        if (!seen.has(key)) {
          seen.add(key);
          refs.push({
            raw: reference,
            baseDir,
            depth,
            ...(isRuntimeOnlyReferenceContext(keyPath) ? { runtimeOnly: true } : {}),
          });
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, keyPath));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        visit(item, [...keyPath, key]);
      }
    }
  };

  visit(parsed, []);
  return refs;
}

async function readPackageReferenceBytes(
  contentAccess: ContentAccessService,
  filePath: string,
): Promise<Uint8Array | undefined> {
  const result = await contentAccess.resolve({
    ref: { kind: 'file', path: filePath },
    intent: 'package',
    target: 'bytes',
    caller: 'neko.project-package',
  });
  return result.status === 'ready' ? result.bytes : undefined;
}

async function createDefaultPackageContentAccessService(
  sourceUri: vscode.Uri,
): Promise<ContentAccessService> {
  const projectRoot = path.dirname(sourceUri.fsPath);
  const mediaPathContext = await createHostContentMediaPathContext({
    documentUri: sourceUri,
    workspaceFolders: vscode.workspace.workspaceFolders ?? [],
    getExtension: vscode.extensions.getExtension,
  });
  return new HostContentAccessService({
    providers: [
      new SourceFileContentAccessProvider({
        projectRoot,
        mediaPathContext,
        fileExists: isVSCodeFile,
        fileOps: {
          readFile: async (filePath) => vscode.workspace.fs.readFile(vscode.Uri.file(filePath)),
        },
      }),
    ],
  });
}

function normalizeReferenceCandidate(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 4096 || /[\r\n]/.test(trimmed)) return undefined;
  if (/^(?:data|blob|https?|javascript|vscode|command):/i.test(trimmed)) return undefined;
  return trimmed;
}

function isLocalFileReferenceCandidate(reference: string, keyPath: readonly string[]): boolean {
  const clean = stripQueryAndFragment(reference);
  if (!clean || clean.endsWith('/') || clean.endsWith('\\')) return false;
  const lower = clean.toLowerCase();
  const hasKnownExtension = LOCAL_FILE_EXTENSIONS.has(path.extname(lower));
  if (!hasKnownExtension) return false;
  return (
    isPathLike(clean) ||
    keyPath.some((key) =>
      /(?:asset|audio|canvas|document|file|image|media|model|motion|moc|path|project|script|source|src|texture|thumbnail|uri|video)/i.test(
        key,
      ),
    )
  );
}

function isArchiveEntryReferenceContext(keyPath: readonly string[]): boolean {
  const lastKey = keyPath[keyPath.length - 1];
  if (lastKey !== 'entryPath') return false;
  return keyPath.some((key) =>
    /(?:archive|bundle|documentResourceRef|locator|resourceRef)/i.test(key),
  );
}

function isRuntimeOnlyReferenceContext(keyPath: readonly string[]): boolean {
  const lastKey = keyPath[keyPath.length - 1] ?? '';
  if (
    /^(?:cachePath|thumbnailPath|previewPath|previewUri|previewUrl|runtimeAssetPath|runtimeReferenceImagePath|webviewUri|proxyPath|posterPath|previewToken|engineToken)$/i.test(
      lastKey,
    )
  ) {
    return true;
  }
  return (
    /(?:cache|thumbnail|preview|proxy|runtime|webview|engineToken|streamId)/i.test(lastKey) &&
    /(?:path|uri|url|token|id)$/i.test(lastKey)
  );
}

function sourceFromReference(reference: string): PackageReferenceManifestSource {
  const clean = stripQueryAndFragment(reference);
  if (hasPathVariableReference(clean)) {
    return { kind: 'variable', reference: clean };
  }
  if (/^file:/i.test(clean)) {
    return { kind: 'file-uri', fileName: path.basename(clean) };
  }
  if (isAbsoluteFsPath(clean)) {
    return { kind: 'absolute', fileName: path.basename(clean) };
  }
  return { kind: 'relative', reference: toZipPath(clean) };
}

async function resolveReference(
  reference: string,
  baseDir: string,
): Promise<
  | ResolvedReference
  | {
      readonly source: PackageReferenceManifestSource;
      readonly reason: PackageMissingReference['reason'];
    }
  | undefined
> {
  const clean = stripQueryAndFragment(reference);
  if (!clean) return undefined;

  if (hasPathVariableReference(clean)) {
    return resolvePathVariableReference(clean, baseDir);
  }

  if (/^file:/i.test(clean)) {
    try {
      const filePath = fileURLToPath(clean);
      return {
        filePath,
        uri: vscode.Uri.file(filePath),
        source: { kind: 'file-uri', fileName: path.basename(filePath) },
      };
    } catch {
      return {
        source: { kind: 'file-uri', fileName: path.basename(clean) },
        reason: 'unsupported-reference',
      };
    }
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(clean)) {
    return undefined;
  }

  if (isAbsoluteFsPath(clean)) {
    return {
      filePath: clean,
      uri: vscode.Uri.file(clean),
      source: { kind: 'absolute', fileName: path.basename(clean) },
    };
  }

  const filePath = path.resolve(baseDir, clean);
  return {
    filePath,
    uri: vscode.Uri.file(filePath),
    source: { kind: 'relative', reference: toZipPath(clean) },
  };
}

async function resolvePathVariableReference(
  reference: string,
  baseDir: string,
): Promise<
  | ResolvedReference
  | {
      readonly source: PackageReferenceManifestSource;
      readonly reason: PackageMissingReference['reason'];
    }
> {
  const source: PackageReferenceManifestSource = { kind: 'variable', reference };
  try {
    const resolved = await resolveHostContentMediaPath(reference, {
      workspaceRoot: resolvePackageWorkspaceRoot(baseDir),
      workspaceFolders: vscode.workspace.workspaceFolders ?? [],
      getExtension: vscode.extensions.getExtension,
      fileExists: isVSCodeFile,
    });
    const filePath = resolveCommandFilePath(resolved, baseDir);
    if (filePath) {
      return {
        filePath,
        uri: vscode.Uri.file(filePath),
        source,
      };
    }
  } catch {
    // Shared content policy may be unavailable; unresolved variables are reported in the manifest.
  }

  return { source, reason: 'unsupported-reference' };
}

function resolvePackageWorkspaceRoot(baseDir: string): string | undefined {
  return (
    vscode.workspace.getWorkspaceFolder?.(vscode.Uri.file(baseDir))?.uri.fsPath ??
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  );
}

async function isVSCodeFile(filePath: string): Promise<boolean> {
  try {
    return (
      (await vscode.workspace.fs.stat(vscode.Uri.file(filePath))).type === vscode.FileType.File
    );
  } catch {
    return false;
  }
}

function resolveCommandFilePath(value: string, baseDir: string): string | undefined {
  const clean = stripQueryAndFragment(value.trim());
  if (!clean || hasPathVariableReference(clean)) return undefined;
  if (/^file:/i.test(clean)) {
    try {
      return fileURLToPath(clean);
    } catch {
      return undefined;
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(clean)) return undefined;
  return isAbsoluteFsPath(clean) ? clean : path.resolve(baseDir, clean);
}

function stripQueryAndFragment(value: string): string {
  const hashIndex = value.indexOf('#');
  const queryIndex = value.indexOf('?');
  const indexes = [hashIndex, queryIndex].filter((index) => index >= 0);
  const end = indexes.length > 0 ? Math.min(...indexes) : value.length;
  return value.slice(0, end);
}

function isPathLike(value: string): boolean {
  return (
    value.startsWith('./') ||
    value.startsWith('../') ||
    value.startsWith('file:') ||
    isAbsoluteFsPath(value) ||
    value.includes('/') ||
    value.includes('\\') ||
    hasPathVariableReference(value)
  );
}

function hasPathVariableReference(value: string): boolean {
  return /^\/?\$\{[^}]+}/.test(value);
}

function isAbsoluteFsPath(value: string): boolean {
  return path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value);
}

function shouldScanNestedReferences(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    lower.endsWith('.json') ||
    lower.endsWith('.gltf') ||
    lower.endsWith('.nkc') ||
    lower.endsWith('.nkchar') ||
    lower.endsWith('.nkcut') ||
    lower.endsWith('.nkeffect') ||
    lower.endsWith('.nkentity') ||
    lower.endsWith('.nkexpr') ||
    lower.endsWith('.nkv')
  );
}

function allocatePackageEntryPath(
  filePath: string,
  sourceDir: string,
  usedEntryNames: Set<string>,
): string {
  const relative = path.relative(sourceDir, filePath);
  const candidate =
    relative &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative) &&
    !relative.split(/[\\/]/).includes('..')
      ? toZipPath(relative)
      : toZipPath(
          path.join('assets', 'external', `${hashString(filePath)}-${path.basename(filePath)}`),
        );

  return makeUniqueEntryName(sanitizeZipPath(candidate), usedEntryNames);
}

function makeUniqueEntryName(candidate: string, usedEntryNames: Set<string>): string {
  if (!usedEntryNames.has(candidate)) {
    usedEntryNames.add(candidate);
    return candidate;
  }

  const parsed = path.posix.parse(candidate);
  for (let index = 2; index < Number.MAX_SAFE_INTEGER; index += 1) {
    const next = path.posix.join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`);
    if (!usedEntryNames.has(next)) {
      usedEntryNames.add(next);
      return next;
    }
  }

  throw new Error(`Unable to allocate ZIP entry name for ${candidate}`);
}

function sanitizeZipPath(value: string): string {
  const parts = toZipPath(value)
    .split('/')
    .filter((part) => part.length > 0 && part !== '.' && part !== '..');
  return parts.length > 0 ? parts.join('/') : 'asset';
}

function toZipPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '');
}

function normalizeFsPath(value: string): string {
  return path.normalize(value);
}

function reportMissingReference(
  missingReferences: PackageMissingReference[],
  reportedMissing: Set<string>,
  source: PackageReferenceManifestSource,
  reason: PackageMissingReference['reason'],
): void {
  const key = JSON.stringify({ source, reason });
  if (reportedMissing.has(key)) return;
  reportedMissing.add(key);
  missingReferences.push({
    ...(source.kind === 'relative'
      ? { fileName: path.basename(source.reference) }
      : source.kind === 'variable'
        ? { fileName: path.basename(source.reference) }
        : { fileName: source.fileName }),
    source,
    reason,
  });
}

function hashString(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
}

function createLocalFileHeader(entry: PreparedZipEntry): Uint8Array {
  const header = new Uint8Array(30 + entry.nameBytes.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  writeDosDateTime(view, 10);
  view.setUint32(14, entry.crc32, true);
  view.setUint32(18, entry.data.length, true);
  view.setUint32(22, entry.data.length, true);
  view.setUint16(26, entry.nameBytes.length, true);
  view.setUint16(28, 0, true);
  header.set(entry.nameBytes, 30);
  return header;
}

function createCentralDirectoryHeader(entry: PreparedZipEntry): Uint8Array {
  const header = new Uint8Array(46 + entry.nameBytes.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  writeDosDateTime(view, 12);
  view.setUint32(16, entry.crc32, true);
  view.setUint32(20, entry.data.length, true);
  view.setUint32(24, entry.data.length, true);
  view.setUint16(28, entry.nameBytes.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, entry.localHeaderOffset, true);
  header.set(entry.nameBytes, 46);
  return header;
}

function createEndOfCentralDirectory(options: {
  readonly entryCount: number;
  readonly centralDirectorySize: number;
  readonly centralDirectoryOffset: number;
}): Uint8Array {
  const header = new Uint8Array(22);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, options.entryCount, true);
  view.setUint16(10, options.entryCount, true);
  view.setUint32(12, options.centralDirectorySize, true);
  view.setUint32(16, options.centralDirectoryOffset, true);
  view.setUint16(20, 0, true);
  return header;
}

function writeDosDateTime(view: DataView, offset: number): void {
  const now = new Date();
  const year = Math.max(1980, now.getFullYear());
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((year - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  view.setUint16(offset, dosTime, true);
  view.setUint16(offset + 2, dosDate, true);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function assertZip16Size(value: number, label: string): void {
  if (value > 0xffff) {
    throw new Error(`${label} exceeds ZIP32 limit`);
  }
}

function assertZip32Size(value: number, label: string): void {
  if (value > 0xffffffff) {
    throw new Error(`${label} exceeds ZIP32 limit`);
  }
}

function defaultPackagePath(sourcePath: string): string {
  const parsed = path.parse(sourcePath);
  return path.join(parsed.dir, `${parsed.name}.zip`);
}
