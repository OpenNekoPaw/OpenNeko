import { readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';

const WEBVIEW_DIST_SEGMENTS = ['dist', 'webview'] as const;
const WEBVIEW_ASSET_MANIFEST = 'asset-manifest.json';

interface AgentWebviewAssetPaths {
  readonly script: string;
  readonly style: string;
}

interface ViteManifestEntry {
  readonly file: string;
  readonly isEntry?: boolean;
}

export function readAgentWebviewAssetPaths(extensionPath: string): AgentWebviewAssetPaths {
  const webviewDistPath = path.join(extensionPath, ...WEBVIEW_DIST_SEGMENTS);
  const manifestPath = path.join(webviewDistPath, WEBVIEW_ASSET_MANIFEST);
  const manifest = parseManifest(readFileSync(manifestPath, 'utf8'), manifestPath);
  const script = requireManifestAsset(manifest, 'index.html', 'script', true);
  const style = requireManifestAsset(manifest, 'style.css', 'style', false);

  requireBuiltAsset(webviewDistPath, script);
  requireBuiltAsset(webviewDistPath, style);

  return { script, style };
}

function parseManifest(contents: string, manifestPath: string): Record<string, ViteManifestEntry> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Invalid Agent Webview asset manifest at ${manifestPath}.`, { cause: error });
  }
  if (!isRecord(parsed)) {
    throw new Error(`Agent Webview asset manifest at ${manifestPath} must be an object.`);
  }

  const manifest: Record<string, ViteManifestEntry> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!isRecord(value) || typeof value.file !== 'string') {
      throw new Error(`Agent Webview asset manifest entry "${key}" is invalid.`);
    }
    manifest[key] = {
      file: value.file,
      ...(typeof value.isEntry === 'boolean' ? { isEntry: value.isEntry } : {}),
    };
  }
  return manifest;
}

function requireManifestAsset(
  manifest: Readonly<Record<string, ViteManifestEntry>>,
  key: string,
  kind: 'script' | 'style',
  requireEntry: boolean,
): string {
  const entry = manifest[key];
  if (!entry || (requireEntry && entry.isEntry !== true)) {
    throw new Error(`Agent Webview asset manifest is missing its ${kind} entry "${key}".`);
  }

  const expectedPattern =
    kind === 'script'
      ? /^assets\/assistant-[A-Za-z0-9_-]+\.js$/
      : /^assets\/assistant-style-[A-Za-z0-9_-]+\.css$/;
  if (!expectedPattern.test(entry.file)) {
    throw new Error(
      `Agent Webview ${kind} entry "${key}" must use a content-addressed asset path.`,
    );
  }
  return entry.file;
}

function requireBuiltAsset(webviewDistPath: string, assetPath: string): void {
  const resolvedPath = path.resolve(webviewDistPath, assetPath);
  const relativePath = path.relative(webviewDistPath, resolvedPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Agent Webview asset path escapes the build output: ${assetPath}.`);
  }
  let isFile: boolean;
  try {
    isFile = statSync(resolvedPath).isFile();
  } catch (error) {
    throw new Error(`Agent Webview build asset is missing: ${assetPath}.`, { cause: error });
  }
  if (!isFile) {
    throw new Error(`Agent Webview asset is not a file: ${assetPath}.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
