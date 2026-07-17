import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type {
  CharacterAssetMediaKind,
  InstalledPackage,
  ProjectAssetDependency,
  ProjectAssetDependencyManifest,
} from '@neko/shared';

export interface ProjectAssetDependencyManifestFileSystem {
  readonly readFile: (filePath: string) => Promise<Uint8Array>;
  readonly writeFile: (filePath: string, data: Uint8Array) => Promise<void>;
  readonly createDirectory: (dirPath: string) => Promise<void>;
  readonly exists: (filePath: string) => Promise<boolean>;
}

export interface ProjectAssetDependencyMarketReader {
  readonly isInstalled: (packageId: string) => boolean | Promise<boolean>;
}

export type ProjectAssetDependencyValidationIssueCode =
  | 'missing-import-source'
  | 'missing-import-destination'
  | 'missing-workspace-source'
  | 'missing-market-package'
  | 'source-hash-mismatch'
  | 'manifest-read-failed';

export interface ProjectAssetDependencyValidationIssue {
  readonly dependencyId: string;
  readonly sourceKind: ProjectAssetDependency['sourceKind'];
  readonly code: ProjectAssetDependencyValidationIssueCode;
  readonly message: string;
  readonly path?: string;
  readonly expectedHash?: string;
  readonly actualHash?: string;
  readonly packageId?: string;
}

export interface ProjectAssetDependencyValidationResult {
  readonly manifestPath: string;
  readonly checkedAt: string;
  readonly issues: readonly ProjectAssetDependencyValidationIssue[];
}

export interface ProjectAssetDependencyManifestServiceOptions {
  readonly projectRoot: string;
  readonly fs: ProjectAssetDependencyManifestFileSystem;
  readonly market?: ProjectAssetDependencyMarketReader;
  readonly now?: () => Date;
}

export class ProjectAssetDependencyManifestService {
  readonly manifestPath: string;

  private readonly projectRoot: string;
  private readonly fs: ProjectAssetDependencyManifestFileSystem;
  private readonly market: ProjectAssetDependencyMarketReader | undefined;
  private readonly now: () => Date;

  constructor(options: ProjectAssetDependencyManifestServiceOptions) {
    this.projectRoot = path.resolve(options.projectRoot);
    this.fs = options.fs;
    this.market = options.market;
    this.now = options.now ?? (() => new Date());
    this.manifestPath = path.join(this.projectRoot, 'neko', 'assets', 'manifest.json');
  }

  async read(): Promise<ProjectAssetDependencyManifest> {
    if (!(await this.fs.exists(this.manifestPath))) {
      return this.createEmptyManifest();
    }

    const bytes = await this.fs.readFile(this.manifestPath);
    return normalizeManifest(JSON.parse(Buffer.from(bytes).toString('utf-8')), this.now());
  }

  async write(manifest: ProjectAssetDependencyManifest): Promise<void> {
    await this.fs.createDirectory(path.dirname(this.manifestPath));
    await this.fs.writeFile(
      this.manifestPath,
      Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf-8'),
    );
  }

  async upsert(dependency: ProjectAssetDependency): Promise<ProjectAssetDependencyManifest> {
    const current = await this.read();
    const dependencies = [
      ...current.dependencies.filter((entry) => entry.id !== dependency.id),
      dependency,
    ].sort((left, right) => left.id.localeCompare(right.id));
    const next: ProjectAssetDependencyManifest = {
      ...current,
      generatedAt: this.now().toISOString(),
      dependencies,
    };
    await this.write(next);
    return next;
  }

  async validate(): Promise<ProjectAssetDependencyValidationResult> {
    let manifest: ProjectAssetDependencyManifest;
    try {
      manifest = await this.read();
    } catch (error) {
      return {
        manifestPath: this.manifestPath,
        checkedAt: this.now().toISOString(),
        issues: [
          {
            dependencyId: '$',
            sourceKind: 'workspace',
            code: 'manifest-read-failed',
            message: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }

    const issues: ProjectAssetDependencyValidationIssue[] = [];
    for (const dependency of manifest.dependencies) {
      issues.push(...(await this.validateDependency(dependency)));
    }

    return {
      manifestPath: this.manifestPath,
      checkedAt: this.now().toISOString(),
      issues,
    };
  }

  createImportDependency(input: {
    readonly id: string;
    readonly originalFile: string;
    readonly mediaKind: ProjectAssetDependency['mediaKind'];
    readonly dimensions: ProjectAssetDependency['dimensions'];
    readonly storageMode: ProjectAssetDependency['storageMode'];
    readonly contentHash?: string;
    readonly importDestination?: string;
    readonly files?: readonly string[];
    readonly assetEntityId?: string;
    readonly variantId?: string;
  }): ProjectAssetDependency {
    return {
      id: input.id,
      sourceKind: 'import',
      originalFile: this.toStoredPath(input.originalFile),
      mediaKind: input.mediaKind,
      dimensions: input.dimensions,
      storageMode: input.storageMode,
      ...(input.contentHash ? { contentHash: input.contentHash } : {}),
      ...(input.importDestination
        ? { importDestination: this.toStoredPath(input.importDestination) }
        : {}),
      ...(input.files ? { files: input.files } : {}),
      ...(input.assetEntityId ? { assetEntityId: input.assetEntityId } : {}),
      ...(input.variantId ? { variantId: input.variantId } : {}),
    };
  }

  createMarketDependency(input: {
    readonly id: string;
    readonly packageId: string;
    readonly version?: string;
    readonly mediaKind: ProjectAssetDependency['mediaKind'];
    readonly dimensions: ProjectAssetDependency['dimensions'];
    readonly storageMode?: ProjectAssetDependency['storageMode'];
    readonly contentHash?: string;
    readonly assetEntityId?: string;
    readonly variantId?: string;
  }): ProjectAssetDependency {
    return {
      id: input.id,
      sourceKind: 'market',
      packageId: input.packageId,
      mediaKind: input.mediaKind,
      dimensions: input.dimensions,
      storageMode: input.storageMode ?? 'market',
      ...(input.version ? { version: input.version } : {}),
      ...(input.contentHash ? { contentHash: input.contentHash } : {}),
      ...(input.assetEntityId ? { assetEntityId: input.assetEntityId } : {}),
      ...(input.variantId ? { variantId: input.variantId } : {}),
    };
  }

  createWorkspaceDependency(input: {
    readonly id: string;
    readonly workspacePath: string;
    readonly mediaKind: ProjectAssetDependency['mediaKind'];
    readonly dimensions: ProjectAssetDependency['dimensions'];
    readonly contentHash?: string;
    readonly assetEntityId?: string;
    readonly variantId?: string;
  }): ProjectAssetDependency {
    return {
      id: input.id,
      sourceKind: 'workspace',
      workspacePath: this.toStoredPath(input.workspacePath),
      mediaKind: input.mediaKind,
      dimensions: input.dimensions,
      storageMode: 'workspace',
      ...(input.contentHash ? { contentHash: input.contentHash } : {}),
      ...(input.assetEntityId ? { assetEntityId: input.assetEntityId } : {}),
      ...(input.variantId ? { variantId: input.variantId } : {}),
    };
  }

  createMarketDependencyFromInstalledPackage(pkg: InstalledPackage): ProjectAssetDependency {
    const metadata = pkg.manifest.typeMetadata;
    const rawMediaKind = metadata?.type === 'media' ? metadata.data.mediaKind : undefined;
    const mediaKind = isCharacterAssetMediaKind(rawMediaKind) ? rawMediaKind : 'puppet-model';
    return this.createMarketDependency({
      id: pkg.packageId,
      packageId: pkg.packageId,
      version: pkg.version,
      mediaKind,
      dimensions: inferDimensions(mediaKind),
      contentHash: pkg.manifest.distribution?.checksum,
    });
  }

  private createEmptyManifest(): ProjectAssetDependencyManifest {
    return {
      version: 1,
      projectRoot: this.projectRoot,
      generatedAt: this.now().toISOString(),
      dependencies: [],
    };
  }

  private async validateDependency(
    dependency: ProjectAssetDependency,
  ): Promise<ProjectAssetDependencyValidationIssue[]> {
    switch (dependency.sourceKind) {
      case 'import':
        return this.validateImportDependency(dependency);
      case 'market':
        return this.validateMarketDependency(dependency);
      case 'workspace':
        return this.validateWorkspaceDependency(dependency);
    }
  }

  private async validateImportDependency(
    dependency: Extract<ProjectAssetDependency, { sourceKind: 'import' }>,
  ): Promise<ProjectAssetDependencyValidationIssue[]> {
    const issues: ProjectAssetDependencyValidationIssue[] = [];
    const originalFile = this.resolveStoredPath(dependency.originalFile);
    if (!(await this.fs.exists(originalFile))) {
      issues.push({
        dependencyId: dependency.id,
        sourceKind: dependency.sourceKind,
        code: 'missing-import-source',
        message: `Original import source is missing: ${dependency.originalFile}`,
        path: dependency.originalFile,
      });
    } else if (dependency.contentHash) {
      const actualHash = await this.hashFile(originalFile);
      if (actualHash !== dependency.contentHash) {
        issues.push({
          dependencyId: dependency.id,
          sourceKind: dependency.sourceKind,
          code: 'source-hash-mismatch',
          message: `Original import source changed: ${dependency.originalFile}`,
          path: dependency.originalFile,
          expectedHash: dependency.contentHash,
          actualHash,
        });
      }
    }

    if (dependency.storageMode === 'disk' && dependency.importDestination) {
      const destination = this.resolveStoredPath(dependency.importDestination);
      if (!(await this.fs.exists(destination))) {
        issues.push({
          dependencyId: dependency.id,
          sourceKind: dependency.sourceKind,
          code: 'missing-import-destination',
          message: `Imported disk destination is missing: ${dependency.importDestination}`,
          path: dependency.importDestination,
        });
      }
    }

    return issues;
  }

  private async validateMarketDependency(
    dependency: Extract<ProjectAssetDependency, { sourceKind: 'market' }>,
  ): Promise<ProjectAssetDependencyValidationIssue[]> {
    const installed = await this.market?.isInstalled(dependency.packageId);
    if (installed !== false) return [];
    return [
      {
        dependencyId: dependency.id,
        sourceKind: dependency.sourceKind,
        code: 'missing-market-package',
        message: `Market package is not installed: ${dependency.packageId}`,
        packageId: dependency.packageId,
      },
    ];
  }

  private async validateWorkspaceDependency(
    dependency: Extract<ProjectAssetDependency, { sourceKind: 'workspace' }>,
  ): Promise<ProjectAssetDependencyValidationIssue[]> {
    const workspacePath = this.resolveStoredPath(dependency.workspacePath);
    if (!(await this.fs.exists(workspacePath))) {
      return [
        {
          dependencyId: dependency.id,
          sourceKind: dependency.sourceKind,
          code: 'missing-workspace-source',
          message: `Workspace asset is missing: ${dependency.workspacePath}`,
          path: dependency.workspacePath,
        },
      ];
    }
    if (!dependency.contentHash) return [];

    const actualHash = await this.hashFile(workspacePath);
    if (actualHash === dependency.contentHash) return [];
    return [
      {
        dependencyId: dependency.id,
        sourceKind: dependency.sourceKind,
        code: 'source-hash-mismatch',
        message: `Workspace asset content changed: ${dependency.workspacePath}`,
        path: dependency.workspacePath,
        expectedHash: dependency.contentHash,
        actualHash,
      },
    ];
  }

  private resolveStoredPath(storedPath: string): string {
    if (storedPath.startsWith('${WORKSPACE}/')) {
      return path.join(this.projectRoot, storedPath.slice('${WORKSPACE}/'.length));
    }
    if (path.isAbsolute(storedPath)) return storedPath;
    return path.join(this.projectRoot, storedPath.replace(/^\.\//, ''));
  }

  private toStoredPath(filePath: string): string {
    const absolutePath = path.resolve(filePath);
    const relativePath = path.relative(this.projectRoot, absolutePath).replace(/\\/g, '/');
    if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
      return `./${relativePath}`;
    }
    return absolutePath;
  }

  private async hashFile(filePath: string): Promise<string> {
    const bytes = await this.fs.readFile(filePath);
    return `sha256:${createHash('sha256').update(Buffer.from(bytes)).digest('hex')}`;
  }
}

function normalizeManifest(value: unknown, now: Date): ProjectAssetDependencyManifest {
  if (!isRecord(value) || value['version'] !== 1 || !Array.isArray(value['dependencies'])) {
    return {
      version: 1,
      generatedAt: now.toISOString(),
      dependencies: [],
    };
  }
  return {
    version: 1,
    ...(typeof value['projectRoot'] === 'string' ? { projectRoot: value['projectRoot'] } : {}),
    generatedAt:
      typeof value['generatedAt'] === 'string' ? value['generatedAt'] : now.toISOString(),
    dependencies: value['dependencies'].filter(isProjectAssetDependency),
  };
}

function isProjectAssetDependency(value: unknown): value is ProjectAssetDependency {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    (value['sourceKind'] === 'import' ||
      value['sourceKind'] === 'market' ||
      value['sourceKind'] === 'workspace') &&
    typeof value['mediaKind'] === 'string' &&
    Array.isArray(value['dimensions']) &&
    typeof value['storageMode'] === 'string'
  );
}

function inferDimensions(mediaKind: string): ProjectAssetDependency['dimensions'] {
  if (mediaKind.endsWith('-motion')) return ['motion'];
  if (mediaKind.endsWith('-config')) return ['config'];
  if (mediaKind === 'voice-pack') return ['audio'];
  return ['model'];
}

function isCharacterAssetMediaKind(value: unknown): value is CharacterAssetMediaKind {
  return (
    value === 'puppet-model' ||
    value === 'puppet-motion' ||
    value === 'puppet-config' ||
    value === 'model-3d' ||
    value === 'model-motion' ||
    value === 'model-config' ||
    value === 'voice-pack' ||
    value === 'character-pack'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
