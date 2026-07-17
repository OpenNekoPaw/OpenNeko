/**
 * Host-owned media import dispatcher.
 *
 * Shared contracts describe import plans; this service owns VSCode/Node-facing
 * orchestration such as ZIP sniffing, controlled extraction, and cross-extension
 * command dispatch.
 */

import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type {
  CharacterAssetMediaKind,
  ImportedAssetDescriptor,
  ImportPlan,
  ImportPlanInput,
  ImportResult,
} from '@neko/shared';
import {
  contractWorkspaceMediaPath,
  normalizeBundleEntryPath,
  validateBundleArchiveMetadata,
} from '@neko/shared';

interface ZipEntryLike {
  readonly entryName: string;
  readonly isDirectory: boolean;
  readonly header?: {
    readonly size?: number;
    readonly compressedSize?: number;
  };
}

interface ZipLike {
  getEntries(): ZipEntryLike[];
  readFile(entry: string | ZipEntryLike): Buffer | null;
  readAsText(entry: string | ZipEntryLike): string;
}

type ZipConstructor = new (data: Buffer) => ZipLike;

export interface ImportDispatcherFileSystem {
  readonly readFile: (filePath: string) => Promise<Uint8Array>;
  readonly writeFile: (filePath: string, data: Uint8Array) => Promise<void>;
  readonly createDirectory: (dirPath: string) => Promise<void>;
  readonly exists?: (filePath: string) => Promise<boolean>;
}

export interface ImportDispatcherCommandBus {
  readonly executeCommand: (command: string, ...args: unknown[]) => Promise<unknown>;
}

export interface ImportDispatcherAssetRegistrar {
  readonly registerImportedAsset: (descriptor: ImportedAssetDescriptor) => Promise<void>;
}

export interface MediaImportDispatcherOptions {
  readonly fs: ImportDispatcherFileSystem;
  readonly commands: ImportDispatcherCommandBus;
  readonly assetRegistrar?: ImportDispatcherAssetRegistrar;
  readonly zipConstructor?: ZipConstructor;
  readonly now?: () => number;
}

export type ZipImportRoute =
  | {
      readonly kind: 'market-bundle';
      readonly manifestEntryPath: string;
      readonly reason: string;
    }
  | {
      readonly kind: 'live2d';
      readonly model3EntryPath: string;
      readonly reason: string;
    }
  | {
      readonly kind: 'gltf-package';
      readonly gltfEntryPath: string;
      readonly reason: string;
    }
  | {
      readonly kind: 'moc3-package';
      readonly moc3EntryPath: string;
      readonly reason: string;
    }
  | {
      readonly kind: 'ambiguous';
      readonly candidates: readonly string[];
      readonly reason: string;
    }
  | {
      readonly kind: 'unsupported';
      readonly reason: string;
    };

export class MediaImportDispatcher {
  private readonly fs: ImportDispatcherFileSystem;
  private readonly commands: ImportDispatcherCommandBus;
  private readonly assetRegistrar: ImportDispatcherAssetRegistrar | undefined;
  private readonly zipConstructor: ZipConstructor;
  private readonly now: () => number;

  constructor(options: MediaImportDispatcherOptions) {
    this.fs = options.fs;
    this.commands = options.commands;
    this.assetRegistrar = options.assetRegistrar;
    this.zipConstructor = options.zipConstructor ?? loadAdmZipConstructor();
    this.now = options.now ?? Date.now;
  }

  validateFormat(filePath: string): {
    supported: boolean;
    detectedMediaKind?: CharacterAssetMediaKind;
    reason?: string;
  } {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.moc3':
        return { supported: true, detectedMediaKind: 'puppet-model' };
      case '.glb':
      case '.gltf':
      case '.vrm':
        return { supported: true, detectedMediaKind: 'model-3d' };
      case '.zip':
        return { supported: true };
      default:
        return { supported: false, reason: `Unsupported import extension: ${ext || '(none)'}` };
    }
  }

  planImport(input: ImportPlanInput): ImportPlan {
    const sourcePath = path.resolve(input.sourcePath);
    const ext = path.extname(sourcePath).toLowerCase();
    if (ext === '.zip') {
      return {
        action: 'bundle-memory',
        sourcePath,
        bundlePath: sourcePath,
        projectRef: this.projectRefForSource(input, sourcePath),
      };
    }

    if (ext === '.moc3') {
      return this.planProjectFileImport(input, sourcePath, 'puppets');
    }

    if (ext === '.glb' || ext === '.gltf' || ext === '.vrm') {
      return this.planProjectFileImport(input, sourcePath, 'models');
    }

    return {
      action: 'useSource',
      sourcePath,
      projectRef: this.projectRefForSource(input, sourcePath),
    };
  }

  async importFile(input: ImportPlanInput): Promise<ImportResult> {
    const validation = this.validateFormat(input.sourcePath);
    if (!validation.supported) {
      throw new Error(validation.reason ?? `Unsupported import: ${input.sourcePath}`);
    }

    const ext = path.extname(input.sourcePath).toLowerCase();
    if (ext === '.zip') {
      return this.importZip(input);
    }

    if (ext === '.moc3') {
      const plan = this.planImport(input);
      const sourceHash = await this.hashFile(plan.sourcePath);
      const puppetPath = await this.materializePlannedFile(plan);
      const originalSourceRef = this.portableOriginalSourceRef(input, plan.sourcePath);
      await this.commands.executeCommand(
        'vscode.openWith',
        uriArg(puppetPath),
        'neko.puppetEditor',
      );
      const importedAssets: ImportedAssetDescriptor[] = [
        {
          dimension: 'model',
          mediaKind: 'puppet-model',
          storageMode: plan.action === 'promote' ? 'disk' : 'workspace',
          path: puppetPath,
          sourceHash,
          metadata: {
            ...(originalSourceRef ? { originalSourcePath: originalSourceRef } : {}),
            durableProjectRef: plan.projectRef,
            ...(plan.action === 'promote' ? { importDestination: puppetPath } : {}),
            ...(plan.action === 'promote'
              ? { importDestinationRef: this.projectRefForSource(input, puppetPath) }
              : {}),
          },
        },
      ];
      await this.registerImportedAssets(importedAssets);
      return {
        projectFilePath: puppetPath,
        openEditorUri: puppetPath,
        importedAssets,
      };
    }

    const plan = this.planImport(input);
    const sourceHash = await this.hashFile(plan.sourcePath);
    const modelPath = await this.materializePlannedFile(plan);
    const originalSourceRef = this.portableOriginalSourceRef(input, plan.sourcePath);
    await this.commands.executeCommand(
      'neko.model.authoring.importAsset',
      createModelAuthoringImportPayload(input, modelPath),
    );
    const importedAssets: ImportedAssetDescriptor[] = [
      {
        dimension: 'model',
        mediaKind: 'model-3d',
        storageMode: plan.action === 'promote' ? 'disk' : 'workspace',
        path: modelPath,
        sourceHash,
        metadata: {
          ...(originalSourceRef ? { originalSourcePath: originalSourceRef } : {}),
          durableProjectRef: plan.projectRef,
          ...(plan.action === 'promote' ? { importDestination: modelPath } : {}),
          ...(plan.action === 'promote'
            ? { importDestinationRef: this.projectRefForSource(input, modelPath) }
            : {}),
        },
      },
    ];
    await this.registerImportedAssets(importedAssets);
    return {
      projectFilePath: modelPath,
      openEditorUri: modelPath,
      importedAssets,
    };
  }

  async sniffZip(filePath: string): Promise<ZipImportRoute> {
    const bytes = await this.fs.readFile(filePath);
    const zip = new this.zipConstructor(Buffer.from(bytes));
    return classifyZipEntries(zip.getEntries());
  }

  async extractGltfZip(input: ImportPlanInput): Promise<ImportResult> {
    const sourcePath = path.resolve(input.sourcePath);
    const bytes = await this.fs.readFile(sourcePath);
    const sourceHash = hashBytes(bytes);
    const zip = new this.zipConstructor(Buffer.from(bytes));
    const route = classifyZipEntries(zip.getEntries());
    if (route.kind !== 'gltf-package') {
      throw new Error(`ZIP is not a glTF package: ${route.reason}`);
    }

    const extractRoot = this.importRoot(input, 'models');
    const targetDir = path.join(extractRoot, `${path.basename(sourcePath, '.zip')}-${this.now()}`);
    const plan: ImportPlan = {
      action: 'extract-promote',
      sourcePath,
      targetDir,
      projectRef: this.projectRefForSource(input, path.join(targetDir, route.gltfEntryPath)),
    };

    await this.fs.createDirectory(targetDir);
    const diagnostics: string[] = [];
    const files: string[] = [];
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const normalized = normalizeBundleEntryPath(entry.entryName);
      if (!normalized.ok) {
        throw new Error(`Unsafe ZIP entry path: ${entry.entryName}`);
      }
      const entryBytes = zip.readFile(entry);
      if (!entryBytes) {
        diagnostics.push(`Skipped unreadable ZIP entry: ${normalized.entryPath}`);
        continue;
      }
      const targetPath = path.join(targetDir, ...normalized.entryPath.split('/'));
      await this.fs.createDirectory(path.dirname(targetPath));
      await this.fs.writeFile(targetPath, entryBytes);
      files.push(normalized.entryPath);
    }

    const modelPath = path.join(targetDir, ...route.gltfEntryPath.split('/'));
    const originalSourceRef = this.portableOriginalSourceRef(input, sourcePath);
    await this.commands.executeCommand(
      'neko.model.authoring.importAsset',
      createModelAuthoringImportPayload(input, modelPath),
    );
    const importedAssets: ImportedAssetDescriptor[] = [
      {
        dimension: 'model',
        mediaKind: 'model-3d',
        storageMode: 'disk',
        path: modelPath,
        sourceHash,
        metadata: {
          ...(originalSourceRef ? { originalSourcePath: originalSourceRef } : {}),
          durableProjectRef: this.projectRefForSource(input, modelPath),
          importDestination: targetDir,
          importDestinationRef: this.projectRefForSource(input, targetDir),
          files,
        },
      },
    ];
    await this.registerImportedAssets(importedAssets);
    return {
      projectFilePath: modelPath,
      openEditorUri: modelPath,
      diagnostics,
      importedAssets,
    };
  }

  private async importZip(input: ImportPlanInput): Promise<ImportResult> {
    const route = await this.sniffZip(input.sourcePath);
    switch (route.kind) {
      case 'market-bundle':
        await this.commands.executeCommand('neko.market.open');
        return {
          projectFilePath: input.sourcePath,
          diagnostics: ['Market bundle ZIP detected; routed to marketplace orchestration.'],
          importedAssets: [],
        };
      case 'live2d':
        const sourceHash = await this.hashFile(path.resolve(input.sourcePath));
        const bundlePlan = this.planProjectFileImport(
          input,
          path.resolve(input.sourcePath),
          'puppets',
        );
        const bundlePath = await this.materializePlannedFile(bundlePlan);
        const originalSourceRef = this.portableOriginalSourceRef(input, bundlePlan.sourcePath);
        await this.commands.executeCommand('neko.puppet.importLive2dBundle', {
          path: bundlePath,
          workspaceFolderPath: input.workspaceFolderPaths[0],
        });
        const importedAssets: ImportedAssetDescriptor[] = [
          {
            dimension: 'model',
            mediaKind: 'puppet-model',
            storageMode: 'bundle-memory',
            path: bundlePath,
            sourceHash,
            metadata: {
              ...(originalSourceRef ? { originalSourcePath: originalSourceRef } : {}),
              durableProjectRef: bundlePlan.projectRef,
            },
          },
        ];
        await this.registerImportedAssets(importedAssets);
        return {
          projectFilePath: bundlePath,
          openEditorUri: bundlePath,
          importedAssets,
        };
      case 'gltf-package':
        return this.extractGltfZip(input);
      case 'moc3-package':
        throw new Error(
          'Bare MOC3 ZIP imports are detected but not yet supported for safe extraction.',
        );
      case 'ambiguous':
        throw new Error(route.reason);
      case 'unsupported':
        throw new Error(route.reason);
    }
  }

  private planProjectFileImport(
    input: ImportPlanInput,
    sourcePath: string,
    kindDir: 'models' | 'puppets',
  ): ImportPlan {
    const projectRef = this.projectRefForSource(input, sourcePath);
    if (isWorkspaceReadable(input, sourcePath)) {
      return { action: 'useSource', sourcePath, projectRef };
    }

    const targetDir = this.importRoot(input, kindDir);
    const targetPath = path.join(targetDir, path.basename(sourcePath));
    return {
      action: 'promote',
      sourcePath,
      targetPath,
      targetDir,
      projectRef: this.projectRefForSource(input, targetPath),
    };
  }

  private projectRefForSource(input: ImportPlanInput, filePath: string): string {
    const workspaceContext = createImportWorkspaceMediaPathContext(input);
    const contracted = contractWorkspaceMediaPath(path.resolve(filePath), workspaceContext);
    if (contracted.format === 'workspace-relative' || contracted.format === 'variable') {
      return contracted.path;
    }

    const basePath = resolveImportFallbackBasePath(input, filePath);
    return formatProjectRef(path.relative(basePath, filePath));
  }

  private portableOriginalSourceRef(input: ImportPlanInput, filePath: string): string | undefined {
    const contracted = contractWorkspaceMediaPath(
      path.resolve(filePath),
      createImportWorkspaceMediaPathContext(input),
    );
    return contracted.format === 'workspace-relative' || contracted.format === 'variable'
      ? contracted.path
      : undefined;
  }

  private importRoot(input: ImportPlanInput, kindDir: 'models' | 'puppets'): string {
    const documentPath = input.documentPath ? path.resolve(input.documentPath) : undefined;
    const workspaceRoot =
      input.owningWorkspaceRoot ??
      (documentPath
        ? findContainingWorkspaceFolder(documentPath, input.workspaceFolderPaths)
        : input.workspaceFolderPaths[0]) ??
      (documentPath ? path.dirname(documentPath) : path.dirname(input.sourcePath));
    return path.join(path.resolve(workspaceRoot), 'media', 'imports', kindDir);
  }

  private async materializePlannedFile(plan: ImportPlan): Promise<string> {
    if (plan.action !== 'promote') return plan.sourcePath;
    const targetPath = await this.resolveAvailableImportPath(plan.targetPath);
    await this.fs.createDirectory(plan.targetDir);
    await this.fs.writeFile(targetPath, await this.fs.readFile(plan.sourcePath));
    return targetPath;
  }

  private async resolveAvailableImportPath(targetPath: string): Promise<string> {
    if (!this.fs.exists || !(await this.fs.exists(targetPath))) {
      return targetPath;
    }
    const parsed = path.parse(targetPath);
    const nonce = this.now();
    for (let attempt = 0; attempt < 100; attempt++) {
      const suffix = attempt === 0 ? `${nonce}` : `${nonce}-${attempt}`;
      const candidate = path.join(parsed.dir, `${parsed.name}-${suffix}${parsed.ext}`);
      if (!(await this.fs.exists(candidate))) return candidate;
    }
    throw new Error(`Could not resolve available import path for ${targetPath}`);
  }

  private async registerImportedAssets(
    descriptors: readonly ImportedAssetDescriptor[],
  ): Promise<void> {
    if (!this.assetRegistrar) return;
    for (const descriptor of descriptors) {
      await this.assetRegistrar.registerImportedAsset(descriptor);
    }
  }

  private async hashFile(filePath: string): Promise<string> {
    return hashBytes(await this.fs.readFile(filePath));
  }
}

export function classifyZipEntries(entries: readonly ZipEntryLike[]): ZipImportRoute {
  const validation = validateBundleArchiveMetadata(
    entries.map((entry) => ({
      entryPath: entry.entryName,
      uncompressedSize: entry.header?.size ?? 0,
      compressedSize: entry.header?.compressedSize,
      directory: entry.isDirectory,
    })),
  );
  if (!validation.ok) {
    return {
      kind: 'unsupported',
      reason: validation.issues
        .map((issue) => `${issue.code}: ${'entryPath' in issue ? issue.entryPath : ''}`)
        .join('; '),
    };
  }

  const fileEntries = validation.normalizedEntries
    .filter((entry) => !entry.directory)
    .map((entry) => entry.entryPath)
    .sort((left, right) => left.localeCompare(right));
  const marketManifest = fileEntries.find(
    (entry) => path.posix.basename(entry) === 'manifest.json',
  );
  if (marketManifest) {
    return {
      kind: 'market-bundle',
      manifestEntryPath: marketManifest,
      reason: 'manifest.json has highest ZIP import priority.',
    };
  }

  const model3 = fileEntries.find((entry) => /(?:^|\/)[^/]+\.model3\.json$/i.test(entry));
  const gltf = fileEntries.find((entry) => /\.gltf$/i.test(entry));
  const moc3 = fileEntries.find((entry) => /\.moc3$/i.test(entry));
  const candidates = [
    ...(model3 ? ['live2d'] : []),
    ...(gltf ? ['gltf-package'] : []),
    ...(moc3 ? ['moc3-package'] : []),
  ];

  if (model3 && gltf) {
    return {
      kind: 'ambiguous',
      candidates,
      reason: `Ambiguous ZIP contains both Live2D model3.json (${model3}) and glTF (${gltf}).`,
    };
  }
  if (model3) {
    return { kind: 'live2d', model3EntryPath: model3, reason: 'Live2D model3.json detected.' };
  }
  if (gltf) {
    return { kind: 'gltf-package', gltfEntryPath: gltf, reason: 'glTF package detected.' };
  }
  if (moc3) {
    return { kind: 'moc3-package', moc3EntryPath: moc3, reason: 'Bare MOC3 package detected.' };
  }

  return { kind: 'unsupported', reason: 'ZIP does not contain a supported import root.' };
}

function loadAdmZipConstructor(): ZipConstructor {
  const loaded = require('adm-zip') as unknown;
  if (typeof loaded !== 'function') {
    throw new Error('adm-zip module did not provide a constructor.');
  }
  return loaded as ZipConstructor;
}

function isWorkspaceReadable(input: ImportPlanInput, sourcePath: string): boolean {
  return getReadableImportRoots(input).some((root) => isPathInsideOrEqual(sourcePath, root));
}

function getReadableImportRoots(input: ImportPlanInput): string[] {
  const roots = [
    ...(input.owningWorkspaceRoot ? [input.owningWorkspaceRoot] : []),
    ...(input.documentPath ? [path.dirname(path.resolve(input.documentPath))] : []),
    ...input.workspaceFolderPaths.map((folderPath) => path.resolve(folderPath)),
    ...[...(input.pathVariables?.entries() ?? [])]
      .filter(([variable]) => variable !== 'WORKSPACE' && variable !== 'PROJECT')
      .map(([, root]) => path.resolve(root)),
  ];
  return uniquePaths(roots);
}

function createImportWorkspaceMediaPathContext(input: ImportPlanInput) {
  const documentPath = input.documentPath ? path.resolve(input.documentPath) : undefined;
  const workspaceRoots = input.workspaceFolderPaths.map((folderPath) => path.resolve(folderPath));
  const owningWorkspaceRoot =
    input.owningWorkspaceRoot ??
    (documentPath ? findContainingWorkspaceFolder(documentPath, workspaceRoots) : undefined) ??
    workspaceRoots[0];
  const pathVariables = new Map(input.pathVariables ?? []);
  if (owningWorkspaceRoot) {
    pathVariables.set('WORKSPACE', owningWorkspaceRoot);
    pathVariables.set('PROJECT', owningWorkspaceRoot);
  }
  return {
    ...(documentPath ? { sourceDocumentUri: `file://${documentPath}` } : {}),
    ...(owningWorkspaceRoot ? { owningWorkspaceRoot } : {}),
    workspaceRoots,
    ...(documentPath ? { documentDir: path.dirname(documentPath) } : {}),
    pathVariables,
    allowedRoots: [
      ...workspaceRoots,
      ...[...pathVariables.entries()]
        .filter(([variable]) => variable !== 'WORKSPACE' && variable !== 'PROJECT')
        .map(([, root]) => root),
    ],
  };
}

function resolveImportFallbackBasePath(input: ImportPlanInput, filePath: string): string {
  const documentPath = input.documentPath ? path.resolve(input.documentPath) : undefined;
  if (documentPath) return path.dirname(documentPath);
  if (input.owningWorkspaceRoot) return path.resolve(input.owningWorkspaceRoot);
  if (input.workspaceFolderPaths[0]) return path.resolve(input.workspaceFolderPaths[0]);
  return path.dirname(filePath);
}

function findContainingWorkspaceFolder(
  filePath: string,
  workspaceFolderPaths: readonly string[],
): string | undefined {
  return workspaceFolderPaths
    .map((folderPath) => path.resolve(folderPath))
    .filter((folderPath) => isPathInsideOrEqual(filePath, folderPath))
    .sort((left, right) => right.length - left.length)[0];
}

function isPathInsideOrEqual(candidatePath: string, rootPath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function uniquePaths(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of paths) {
    const normalized = path.resolve(item);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function formatProjectRef(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/');
  if (normalized.startsWith('./') || normalized.startsWith('../')) return normalized;
  return `./${normalized}`;
}

function uriArg(filePath: string): { readonly fsPath: string; readonly path: string } {
  return { fsPath: filePath, path: filePath };
}

function createModelAuthoringImportPayload(
  input: ImportPlanInput,
  modelPath: string,
): {
  readonly path: string;
  readonly target:
    | {
        readonly kind: 'file';
        readonly documentUri: string;
        readonly reveal: false;
      }
    | {
        readonly kind: 'new';
        readonly reveal: false;
      };
} {
  const documentPath = input.documentPath ? path.resolve(input.documentPath) : undefined;
  return {
    path: modelPath,
    target: documentPath
      ? { kind: 'file', documentUri: pathToFileURL(documentPath).toString(), reveal: false }
      : { kind: 'new', reveal: false },
  };
}

function hashBytes(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(Buffer.from(bytes)).digest('hex')}`;
}
