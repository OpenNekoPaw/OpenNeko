/**
 * MarketShaderService — Discovers and manages marketplace-installed shaders.
 *
 * Responsibilities:
 * 1. Scans ~/.neko/shaders/ for installed + enabled shader packages
 * 2. Subscribes to NekoMarketAPI events for hot-reload
 * 3. Registers shaders with EngineClient for GPU rendering
 * 4. Exposes available shader list + change event for webview consumption
 *
 * Graceful degradation: works without neko-market extension (scan only, no events).
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import type { ILogger, InstalledPackageStatus, MarketPackageEvent } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

/** Minimal NekoMarketAPI interface (defined locally to avoid cross-extension dependency). */
interface NekoMarketAPI {
  onDidMarketPackageEvent?: vscode.Event<MarketPackageEvent>;
  onDidInstall: vscode.Event<MarketAssetEvent>;
  onDidUninstall: vscode.Event<MarketAssetEvent>;
  onDidEnable: vscode.Event<MarketAssetEvent>;
  onDidDisable: vscode.Event<MarketAssetEvent>;
  getInstalled(options?: { types?: string[]; enabledOnly?: boolean }): Promise<
    Array<{
      packageId: string;
      installedPath: string;
      enabled: boolean;
      status?: InstalledPackageStatus;
      manifest?: { typeMetadata?: { type: string; data?: { presetKind?: string } } };
    }>
  >;
}

interface MarketAssetEvent {
  packageId: string;
  type: string;
  installedPath: string;
  manifest?: { typeMetadata?: { type: string; data?: { presetKind?: string } } };
}

/** Info about a marketplace-installed shader available for use */
export interface MarketShaderInfo {
  packageId: string;
  name: string;
  shaderId: string;
  description?: string;
  category: string;
  wgslPath: string;
  installedPath: string;
}

/** v4 market routes that can feed cut shader/LUT projections. */
const SHADER_TYPES = new Set(['shader', 'preset']);
const BLOCKING_MARKET_STATUSES = new Set<InstalledPackageStatus>(['expired', 'incompatible']);

const MARKET_EXTENSION_ID = 'neko.neko-market';

// =============================================================================
// Service
// =============================================================================

export class MarketShaderService implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private _shaders: MarketShaderInfo[] = [];
  private readonly _disposables: vscode.Disposable[] = [];

  get marketShaders(): readonly MarketShaderInfo[] {
    return this._shaders;
  }

  constructor(private readonly _logger: ILogger) {
    this._disposables.push(this._onDidChange);
  }

  /**
   * Initialize: scan existing shaders + subscribe to market events.
   * Safe to call at any time — gracefully handles missing market extension.
   */
  async initialize(): Promise<void> {
    // Initial scan
    await this.rescan();

    // Subscribe to market events if available
    this._subscribeToMarket();
  }

  /** Force rescan ~/.neko/shaders/ and rebuild the shader list */
  async rescan(): Promise<void> {
    try {
      const shaders = await scanShaderDirectory(getMarketShadersBase(), this._logger);
      this._shaders = shaders;
      this._logger.info(`Market shaders: found ${shaders.length} shader(s)`);
      this._onDidChange.fire();
    } catch (err) {
      this._logger.warn('Failed to scan market shaders', err);
      this._shaders = [];
    }
  }

  dispose(): void {
    this._disposables.forEach((d) => d.dispose());
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  private _subscribeToMarket(): void {
    const ext = vscode.extensions.getExtension<NekoMarketAPI>(MARKET_EXTENSION_ID);
    if (!ext) {
      this._logger.debug('neko-market not available, shader hot-reload disabled');
      return;
    }

    const subscribe = (api: NekoMarketAPI): void => {
      if (api.onDidMarketPackageEvent) {
        this._disposables.push(
          api.onDidMarketPackageEvent((event) => {
            if (shouldRescanForMarketShaderEvent(event)) {
              this._logger.info(`Market shader projection changed: ${event.packageId}, rescanning`);
              this.rescan();
            }
          }),
        );
        return;
      }

      this._disposables.push(
        api.onDidInstall((e) => {
          if (isShaderProjectionEvent(e)) {
            this._logger.info(`Shader installed: ${e.packageId}, rescanning`);
            this.rescan();
          }
        }),
        api.onDidUninstall((e) => {
          if (isShaderProjectionEvent(e)) {
            this._logger.info(`Shader uninstalled: ${e.packageId}, rescanning`);
            this.rescan();
          }
        }),
        api.onDidEnable((e) => {
          if (isShaderProjectionEvent(e)) {
            this._logger.info(`Shader enabled: ${e.packageId}, rescanning`);
            this.rescan();
          }
        }),
        api.onDidDisable((e) => {
          if (isShaderProjectionEvent(e)) {
            this._logger.info(`Shader disabled: ${e.packageId}, rescanning`);
            this.rescan();
          }
        }),
      );
    };

    if (ext.isActive) {
      subscribe(ext.exports);
    } else {
      // Activate and subscribe when ready
      ext.activate().then(
        (api) => subscribe(api),
        (err) => this._logger.warn('Failed to activate neko-market', err),
      );
    }
  }
}

function getMarketShadersBase(): string {
  return path.join(os.homedir(), '.neko', 'shaders');
}

// =============================================================================
// Scanner
// =============================================================================

/**
 * Scan ~/.neko/shaders/{publisher}/{name}/ for installed shader packages.
 *
 * Each shader package directory is expected to contain:
 * - A .wgsl file (the shader source)
 * - Optionally a manifest.json with metadata
 *
 * Only shaders marked as enabled in the installed registry are included.
 * When no market extension is available, all found shaders are included.
 */
async function scanShaderDirectory(baseDir: string, logger: ILogger): Promise<MarketShaderInfo[]> {
  const shaders: MarketShaderInfo[] = [];

  // Check if base directory exists
  try {
    await fs.access(baseDir);
  } catch {
    return shaders;
  }

  // Get enabled package paths from market API (if available)
  const enabledPaths = await getEnabledShaderPaths(logger);

  for (const pkgDir of await findShaderPackageDirs(baseDir)) {
    if (enabledPaths !== null && !enabledPaths.has(pkgDir)) {
      continue;
    }

    const files = await safeReaddir(pkgDir);
    const wgslFiles = files.filter((f) => f.endsWith('.wgsl'));
    if (wgslFiles.length === 0) continue;

    const manifest = await readManifest(path.join(pkgDir, 'manifest.json'));
    const relativeParts = path.relative(baseDir, pkgDir).split(path.sep);
    const { publisher, packageName } = parseShaderPackageRoute(relativeParts);

    wgslFiles.forEach((wgslFile) => {
      const shaderId = `market:${publisher}/${packageName}/${path.basename(wgslFile, '.wgsl')}`;
      shaders.push({
        packageId: `@${publisher}/${packageName}`,
        name: manifest?.name ?? packageName,
        shaderId,
        description: manifest?.description,
        category: manifest?.category ?? 'market',
        wgslPath: path.join(pkgDir, wgslFile),
        installedPath: pkgDir,
      });
    });
  }

  return shaders;
}

async function findShaderPackageDirs(baseDir: string): Promise<string[]> {
  const packageDirs: string[] = [];
  const firstSegments = await safeReaddir(baseDir);

  for (const first of firstSegments) {
    const firstDir = path.join(baseDir, first);
    const firstStat = await safeStat(firstDir);
    if (!firstStat?.isDirectory()) continue;

    const secondSegments = await safeReaddir(firstDir);
    for (const second of secondSegments) {
      const secondDir = path.join(firstDir, second);
      const secondStat = await safeStat(secondDir);
      if (!secondStat?.isDirectory()) continue;

      if (await containsWgslFile(secondDir)) {
        packageDirs.push(secondDir);
        continue;
      }

      const thirdSegments = await safeReaddir(secondDir);
      for (const third of thirdSegments) {
        const thirdDir = path.join(secondDir, third);
        const thirdStat = await safeStat(thirdDir);
        if (thirdStat?.isDirectory() && (await containsWgslFile(thirdDir))) {
          packageDirs.push(thirdDir);
        }
      }
    }
  }

  return packageDirs;
}

async function containsWgslFile(dir: string): Promise<boolean> {
  const files = await safeReaddir(dir);
  return files.some((file) => file.endsWith('.wgsl'));
}

function parseShaderPackageRoute(parts: readonly string[]): {
  publisher: string;
  packageName: string;
} {
  if (parts.length >= 3) {
    return { publisher: parts[1] ?? 'unknown', packageName: parts[2] ?? 'unknown' };
  }
  return { publisher: parts[0] ?? 'unknown', packageName: parts[1] ?? 'unknown' };
}

/** Get the set of enabled shader install paths from the market API, or null if not available */
async function getEnabledShaderPaths(logger: ILogger): Promise<Set<string> | null> {
  const ext = vscode.extensions.getExtension<NekoMarketAPI>(MARKET_EXTENSION_ID);
  if (!ext?.isActive) return null;

  try {
    const installed = await ext.exports.getInstalled({
      types: ['shader', 'preset'],
      enabledOnly: true,
    });
    return new Set(
      installed.filter((pkg) => isUsableShaderInstall(pkg)).map((pkg) => pkg.installedPath),
    );
  } catch (err) {
    logger.debug('Failed to get enabled shaders from market', err);
    return null;
  }
}

function shouldRescanForMarketShaderEvent(event: MarketPackageEvent): boolean {
  if (!event.type || !SHADER_TYPES.has(event.type)) return false;
  if (event.type === 'preset' && !isLutPreset(event.manifest)) return false;
  return (
    event.kind === 'install' ||
    event.kind === 'uninstall' ||
    event.kind === 'enable' ||
    event.kind === 'disable' ||
    event.kind === 'status-change'
  );
}

function isShaderProjectionEvent(event: MarketAssetEvent): boolean {
  if (!SHADER_TYPES.has(event.type)) return false;
  return event.type !== 'preset' || isLutPreset(event.manifest);
}

function isUsableShaderInstall(
  pkg: Awaited<ReturnType<NekoMarketAPI['getInstalled']>>[number],
): boolean {
  if (!pkg.enabled) return false;
  if (pkg.status && BLOCKING_MARKET_STATUSES.has(pkg.status)) return false;
  const type = pkg.manifest?.typeMetadata?.type;
  if (type === 'preset') return pkg.manifest?.typeMetadata?.data?.presetKind === 'lut';
  return true;
}

function isLutPreset(
  manifest: MarketPackageEvent['manifest'] | MarketAssetEvent['manifest'],
): boolean {
  const metadata = manifest?.typeMetadata;
  return metadata?.type === 'preset' && metadata.data?.presetKind === 'lut';
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

async function safeStat(p: string): Promise<Awaited<ReturnType<typeof fs.stat>> | null> {
  try {
    return await fs.stat(p);
  } catch {
    return null;
  }
}

interface ShaderManifest {
  name?: string;
  description?: string;
  category?: string;
}

async function readManifest(manifestPath: string): Promise<ShaderManifest | null> {
  try {
    const content = await fs.readFile(manifestPath, 'utf-8');
    return JSON.parse(content) as ShaderManifest;
  } catch {
    return null;
  }
}
