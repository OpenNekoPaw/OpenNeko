/**
 * ProxyService - Video proxy file generation and management
 *
 * Manages low-resolution proxy files for smoother timeline editing.
 * Delegates transcoding to neko-engine via EngineClient.dispatch().
 *
 * Storage layout:
 *   <projectDir>/.neko/proxies/
 *     ├── manifest.json   (ProxyManifest)
 *     └── <hash>_proxy.mp4
 *
 * Design:
 * - Proxy generation is async and non-blocking
 * - Manifest tracks source file identity (size + mtime) for staleness detection
 * - Concurrent generation limited to MAX_CONCURRENT to avoid CPU contention
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { createServiceId } from '../base';
import { EngineClient, type ActionRequest, type ActionResponse } from '@neko/neko-client';
import {
  isExistingLocalFile,
  normalizePathsForSave,
  resolveMediaPath as resolveMediaPathHelper,
  toRelativeIfAbsolute,
} from './tools/helpers';
import type { ProxyManifest, ProxyEntry, ProxyStatus } from '@neko/shared';

// =============================================================================
// Service Identifier
// =============================================================================

export const IProxyService = createServiceId<ProxyService>('proxyService');

// =============================================================================
// Constants
// =============================================================================

/** Project-local proxy cache path, matching resolveStorageLayout().project.local.cache.proxies. */
const PROXY_DIR = '.neko/.cache/proxies';
const MANIFEST_FILE = 'manifest.json';
const MAX_CONCURRENT = 2;

/** Thresholds for auto-proxy (any match triggers proxy generation) */
const AUTO_PROXY_THRESHOLDS = {
  /** Resolution threshold (width * height) — above 1080p */
  pixels: 1920 * 1080,
  /** Bitrate threshold in bps — above 20 Mbps */
  bitrate: 20_000_000,
  /** File size threshold in bytes — above 500 MB */
  fileSize: 500 * 1024 * 1024,
};

// =============================================================================
// Types
// =============================================================================

export interface ProxyGenerateResult {
  resourceId: string;
  proxyPath: string;
  status: ProxyStatus;
  error?: string;
}

// =============================================================================
// ProxyService
// =============================================================================

export class ProxyService implements vscode.Disposable {
  private manifest: ProxyManifest = { version: 1, proxies: {} };
  private projectDir: string | undefined;
  private projectFilePath: string | undefined;
  private documentUri: vscode.Uri | undefined;
  private activeGenerations = 0;
  private readonly queue: Array<() => Promise<void>> = [];
  private disposed = false;

  private readonly _onDidChangeProxy = new vscode.EventEmitter<ProxyEntry>();
  readonly onDidChangeProxy = this._onDidChangeProxy.event;

  constructor(private readonly client: EngineClient) {}

  // =========================================================================
  // Lifecycle
  // =========================================================================

  /**
   * Initialize with project directory and load manifest
   */
  async initialize(
    projectDir: string,
    context?: { readonly projectFilePath?: string; readonly documentUri?: vscode.Uri },
  ): Promise<void> {
    this.projectDir = projectDir;
    this.projectFilePath = context?.projectFilePath;
    this.documentUri = context?.documentUri;
    await this.loadManifest();
  }

  // =========================================================================
  // Public API
  // =========================================================================

  /**
   * Generate a proxy for a media file.
   * Returns immediately if proxy already exists and is fresh.
   */
  async generateProxy(sourcePath: string): Promise<ProxyGenerateResult> {
    this.ensureInitialized();

    const absoluteSource = await this.resolveMediaPath(sourcePath);
    const resourceId = this.computeResourceId(absoluteSource);

    // Check existing proxy
    const existing = this.manifest.proxies[resourceId];
    if (existing && existing.status === 'ready') {
      const isStale = await this.isProxyStale(resourceId, absoluteSource);
      if (!isStale) {
        return {
          resourceId,
          proxyPath: await this.resolveMediaPath(existing.proxy),
          status: 'ready',
        };
      }
    }

    // Generate proxy
    return this.enqueueGeneration(resourceId, absoluteSource);
  }

  /**
   * Check if a media file needs a proxy based on its properties.
   * Probes the file and checks against thresholds.
   */
  async needsProxy(sourcePath: string): Promise<boolean> {
    this.ensureInitialized();

    const absoluteSource = await this.resolveMediaPath(sourcePath);

    // Check file size first (no engine call needed)
    try {
      const stat = await fs.stat(absoluteSource);
      if (stat.size > AUTO_PROXY_THRESHOLDS.fileSize) {
        return true;
      }
    } catch {
      return false;
    }

    // Probe media info via engine
    try {
      const result = await this.dispatch({
        group: 'videos',
        action: 'probe',
        options: { source: absoluteSource },
      });

      const data = result.data as Record<string, unknown>;
      const videoStreams = (data.videoStreams ?? []) as Array<Record<string, unknown>>;
      const primary = videoStreams[0];
      if (!primary) return false;

      const width = (primary.width as number) ?? 0;
      const height = (primary.height as number) ?? 0;
      const bitrate = (primary.bitrate as number) ?? 0;

      if (width * height > AUTO_PROXY_THRESHOLDS.pixels) return true;
      if (bitrate > AUTO_PROXY_THRESHOLDS.bitrate) return true;
    } catch {
      // Probe failed — don't generate proxy
      return false;
    }

    return false;
  }

  /**
   * Get proxy path for a source file, or null if not available.
   */
  async getProxyPath(sourcePath: string): Promise<string | null> {
    if (!this.projectDir) return null;

    const absoluteSource = await this.resolveMediaPath(sourcePath);
    const resourceId = this.computeResourceId(absoluteSource);
    const entry = this.manifest.proxies[resourceId];

    if (entry?.status === 'ready') {
      return await this.resolveMediaPath(entry.proxy);
    }
    return null;
  }

  /**
   * Get proxy status for a source file.
   */
  async getProxyStatus(sourcePath: string): Promise<ProxyStatus | null> {
    if (!this.projectDir) return null;

    const absoluteSource = await this.resolveMediaPath(sourcePath);
    const resourceId = this.computeResourceId(absoluteSource);
    return this.manifest.proxies[resourceId]?.status ?? null;
  }

  /**
   * Remove proxy for a source file.
   */
  async removeProxy(sourcePath: string): Promise<void> {
    this.ensureInitialized();

    const absoluteSource = await this.resolveMediaPath(sourcePath);
    const resourceId = this.computeResourceId(absoluteSource);
    const entry = this.manifest.proxies[resourceId];

    if (entry) {
      // Delete proxy file
      try {
        const proxyAbsolute = await this.resolveMediaPath(entry.proxy);
        await fs.unlink(proxyAbsolute);
      } catch {
        // File may not exist
      }

      delete this.manifest.proxies[resourceId];
      await this.saveManifest();
    }
  }

  /**
   * Remove all proxies and clean up the proxy directory.
   */
  async removeAllProxies(): Promise<void> {
    this.ensureInitialized();

    const proxyDir = path.join(this.projectDir!, PROXY_DIR);
    try {
      await fs.rm(proxyDir, { recursive: true, force: true });
    } catch {
      // Directory may not exist
    }

    this.manifest = { version: 1, proxies: {} };
  }

  /**
   * Get all proxy entries.
   */
  getAllProxies(): Record<string, ProxyEntry> {
    return { ...this.manifest.proxies };
  }

  // =========================================================================
  // Generation Queue
  // =========================================================================

  private async enqueueGeneration(
    resourceId: string,
    absoluteSource: string,
  ): Promise<ProxyGenerateResult> {
    return new Promise((resolve) => {
      const task = async () => {
        const result = await this.doGenerate(resourceId, absoluteSource);
        resolve(result);
      };

      if (this.activeGenerations < MAX_CONCURRENT) {
        this.activeGenerations++;
        task().finally(() => {
          this.activeGenerations--;
          this.drainQueue();
        });
      } else {
        this.queue.push(async () => {
          this.activeGenerations++;
          await task();
          this.activeGenerations--;
        });
      }
    });
  }

  private drainQueue(): void {
    while (this.queue.length > 0 && this.activeGenerations < MAX_CONCURRENT) {
      const next = this.queue.shift();
      if (next) {
        next().finally(() => this.drainQueue());
      }
    }
  }

  private async doGenerate(
    resourceId: string,
    absoluteSource: string,
  ): Promise<ProxyGenerateResult> {
    const proxyDir = path.join(this.projectDir!, PROXY_DIR);
    await fs.mkdir(proxyDir, { recursive: true });

    const proxyFileName = `${resourceId}_proxy.mp4`;
    const proxyAbsolute = path.join(proxyDir, proxyFileName);
    const proxyRelative = path.join(PROXY_DIR, proxyFileName);

    // Get source file stats for staleness tracking
    let sourceSize = 0;
    let sourceModified = 0;
    try {
      const stat = await fs.stat(absoluteSource);
      sourceSize = stat.size;
      sourceModified = stat.mtimeMs;
    } catch {
      return {
        resourceId,
        proxyPath: proxyAbsolute,
        status: 'failed',
        error: 'Source file not found',
      };
    }

    // Update manifest: generating
    this.updateEntry(resourceId, {
      source: await this.contractSourcePath(absoluteSource),
      proxy: proxyRelative,
      sourceSize,
      sourceModified,
      proxyResolution: '',
      status: 'generating',
      createdAt: Date.now(),
    });

    try {
      // Call engine: videos:proxy
      const result = await this.dispatch({
        group: 'videos',
        action: 'proxy',
        options: {
          source: absoluteSource,
          output: proxyAbsolute,
        },
      });

      // Probe proxy to get actual resolution
      let proxyResolution = '';
      try {
        const probeResult = await this.dispatch({
          group: 'videos',
          action: 'probe',
          options: { source: proxyAbsolute },
        });
        const probeData = probeResult.data as Record<string, unknown>;
        const videoStreams = (probeData.videoStreams ?? []) as Array<Record<string, unknown>>;
        const primary = videoStreams[0];
        if (primary) {
          proxyResolution = `${primary.width}x${primary.height}`;
        }
      } catch {
        // Non-critical
      }

      // Update manifest: ready
      this.updateEntry(resourceId, {
        source: await this.contractSourcePath(absoluteSource),
        proxy: proxyRelative,
        sourceSize,
        sourceModified,
        proxyResolution,
        status: 'ready',
        createdAt: Date.now(),
      });

      return {
        resourceId,
        proxyPath: proxyAbsolute,
        status: 'ready',
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      this.updateEntry(resourceId, {
        source: await this.contractSourcePath(absoluteSource),
        proxy: proxyRelative,
        sourceSize,
        sourceModified,
        proxyResolution: '',
        status: 'failed',
        error: errorMsg,
        createdAt: Date.now(),
      });

      return {
        resourceId,
        proxyPath: proxyAbsolute,
        status: 'failed',
        error: errorMsg,
      };
    }
  }

  // =========================================================================
  // Manifest Persistence
  // =========================================================================

  private async loadManifest(): Promise<void> {
    const manifestPath = path.join(this.projectDir!, PROXY_DIR, MANIFEST_FILE);
    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      const parsed = JSON.parse(content) as ProxyManifest;
      if (parsed.version === 1 && parsed.proxies) {
        this.manifest = parsed;
      }
    } catch {
      // No manifest yet — start fresh
      this.manifest = { version: 1, proxies: {} };
    }
  }

  private async saveManifest(): Promise<void> {
    const proxyDir = path.join(this.projectDir!, PROXY_DIR);
    await fs.mkdir(proxyDir, { recursive: true });

    const manifestPath = path.join(proxyDir, MANIFEST_FILE);
    await fs.writeFile(manifestPath, JSON.stringify(this.manifest, null, 2), 'utf-8');
  }

  private updateEntry(resourceId: string, entry: ProxyEntry): void {
    this.manifest.proxies[resourceId] = entry;
    this.saveManifest().catch(() => {});
    this._onDidChangeProxy.fire(entry);
  }

  // =========================================================================
  // Staleness Detection
  // =========================================================================

  private async isProxyStale(resourceId: string, absoluteSource: string): Promise<boolean> {
    const entry = this.manifest.proxies[resourceId];
    if (!entry) return true;

    try {
      const stat = await fs.stat(absoluteSource);
      if (stat.size !== entry.sourceSize) return true;
      if (Math.abs(stat.mtimeMs - entry.sourceModified) > 1000) return true;
    } catch {
      return true;
    }

    // Check proxy file exists
    try {
      const proxyAbsolute = await this.resolveMediaPath(entry.proxy);
      await fs.access(proxyAbsolute);
    } catch {
      return true;
    }

    return false;
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private computeResourceId(absolutePath: string): string {
    return crypto.createHash('sha256').update(absolutePath).digest('hex').slice(0, 16);
  }

  private async resolveMediaPath(mediaPath: string): Promise<string> {
    return resolveMediaPathHelper(mediaPath, this.projectDir ?? '', {
      ...(this.projectFilePath ? { projectFilePath: this.projectFilePath } : {}),
      ...(this.documentUri ? { documentUri: this.documentUri } : {}),
      fileExists: isExistingLocalFile,
    });
  }

  private async contractSourcePath(absoluteSource: string): Promise<string> {
    if (!this.projectFilePath) {
      return toRelativeIfAbsolute(absoluteSource, this.projectDir!);
    }
    const normalizedProject = await normalizePathsForSave(
      {
        version: '1',
        name: 'Proxy manifest contraction',
        resolution: { width: 1, height: 1 },
        fps: 1,
        tracks: [
          {
            id: 'track',
            name: 'Proxy',
            type: 'video',
            elements: [
              {
                id: 'source',
                name: 'Source',
                type: 'media',
                src: absoluteSource,
                mediaType: 'video',
                startTime: 0,
                duration: 1,
                trimStart: 0,
                trimEnd: 0,
                transform: {
                  x: 0,
                  y: 0,
                  scaleX: 1,
                  scaleY: 1,
                  rotation: 0,
                  anchorX: 0.5,
                  anchorY: 0.5,
                },
                opacity: 1,
                blendMode: 'normal',
                effects: [],
                muted: false,
                hidden: false,
                locked: false,
              },
            ],
            muted: false,
            locked: false,
            hidden: false,
            isMain: true,
          },
        ],
      },
      this.projectFilePath,
      this.documentUri ? { documentUri: this.documentUri } : {},
    );
    const first = normalizedProject.tracks[0]?.elements[0];
    return typeof first === 'object' && first && 'src' in first && typeof first.src === 'string'
      ? first.src
      : toRelativeIfAbsolute(absoluteSource, this.projectDir!);
  }

  private async dispatch(req: ActionRequest): Promise<ActionResponse> {
    const response = await this.client.dispatch(req);

    if (response.status === 'error') {
      const errMsg = response.error?.message ?? `${req.group}:${req.action} failed`;
      throw new Error(errMsg);
    }

    return response;
  }

  private ensureInitialized(): void {
    if (!this.projectDir) {
      throw new Error('ProxyService not initialized. Call initialize() first.');
    }
  }

  // =========================================================================
  // Disposal
  // =========================================================================

  dispose(): void {
    this.disposed = true;
    this._onDidChangeProxy.dispose();
    this.queue.length = 0;
  }
}
