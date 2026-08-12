import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(__dirname, '../..');
const repositoryRoot = resolve(packageRoot, '../../..');

describe('neko-entity architecture boundaries', () => {
  it('keeps core and provider modules independent from feature packages and host APIs', () => {
    const files = [
      ...listTypeScriptFiles(resolve(packageRoot, 'src/core')),
      ...listTypeScriptFiles(resolve(packageRoot, 'src/providers')),
    ];

    const forbidden = [
      /from ['"]vscode['"]/,
      /from ['"]@neko\/search/,
      /from ['"]@neko\/agent/,
      /from ['"]@neko-agent\//,
      /from ['"]@neko-story\//,
      /from ['"]neko-story/,
      /from ['"]@neko\/asset/,
      /from ['"]@neko-assets/,
      /from ['"]neko-assets/,
      /from ['"]@neko-dashboard/,
      /from ['"]neko-dashboard/,
      /from ['"]react/,
    ];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of forbidden) {
        expect(source, `${relative(packageRoot, file)} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('keeps projection modules independent from Agent, feature implementations, and UI APIs', () => {
    const files = listTypeScriptFiles(resolve(packageRoot, 'src/projections'));

    const forbidden = [
      /from ['"]vscode['"]/,
      /from ['"]@neko\/agent/,
      /from ['"]@neko-agent\//,
      /from ['"]@neko-story\//,
      /from ['"]neko-story/,
      /from ['"]@neko-assets/,
      /from ['"]neko-assets/,
      /from ['"]@neko-dashboard/,
      /from ['"]neko-dashboard/,
      /from ['"]react/,
      /from ['"][^'"]*webview[^'"]*['"]/i,
      /from ['"][^'"]*extension[^'"]*['"]/i,
    ];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of forbidden) {
        expect(source, `${relative(packageRoot, file)} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('keeps retired Entity Asset and legacy composition paths unreachable', () => {
    const retiredFiles = [
      'src/contracts/character-registry.ts',
      'src/contracts/creative-entity-asset-composition.ts',
      'src/contracts/creative-entity-graph.ts',
      'src/contracts/creativeEntityLineage.ts',
      'src/contracts/entity-asset-projection.ts',
      'src/contracts/entity-representation-binding.ts',
      'src/contracts/project-entity-assets.ts',
      'src/core/ProjectEntityAssetInstantiationService.ts',
      'src/core/ProjectEntityAssetPublicationService.ts',
      'src/core/ProjectEntityAssetUpdateService.ts',
      'src/core/adapters.ts',
      'src/core/paths.ts',
      'src/core/ports.ts',
      'src/core/representationAccess.ts',
      'src/core/representationResolver.ts',
      'src/projections/projectEntityAssetLifecycleProjection.ts',
    ];
    for (const path of retiredFiles) {
      expect(existsSync(resolve(packageRoot, path)), path).toBe(false);
    }

    const productionFiles = [
      ...listProductionTypeScriptFiles(resolve(repositoryRoot, 'packages')),
      ...listProductionTypeScriptFiles(resolve(repositoryRoot, 'apps')),
    ];
    const retiredMarkers = [
      /\bCreativeEntityAsset(?:Composition|Graph|Lineage)\b/u,
      /\bEntityAssetProjection/u,
      /\bProjectEntityAsset(?:Instantiation|Publication|Update|Lifecycle)/u,
      /creative-entity-(?:asset-composition|capability-provider|graph)/u,
      /entity-(?:asset-projection|representation-binding)/u,
      /node-workspace-entity-asset-metadata-binding/u,
      /project-entity-assets/u,
      /projectEntityAssetLifecycleProjection/u,
      /entity_asset_projections/u,
      /asset-graph-(?:node|edge)/u,
    ];

    for (const file of productionFiles) {
      const source = readFileSync(file, 'utf8');
      for (const marker of retiredMarkers) {
        expect(source, `${relative(repositoryRoot, file)} matches ${marker}`).not.toMatch(marker);
      }
    }
  });

  it('keeps destructive Entity operations independent from rebuildable usage projections', () => {
    const productionFiles = [
      ...listProductionTypeScriptFiles(resolve(repositoryRoot, 'packages/entity')),
      ...listProductionTypeScriptFiles(resolve(repositoryRoot, 'apps/neko-desktop/src/main')),
    ];
    const forbiddenMarkers = [
      /ResourceUsageProjection/u,
      /resourceUsageProjections/u,
      /resource_usage_projections/u,
    ];

    for (const file of productionFiles) {
      const source = readFileSync(file, 'utf8');
      for (const marker of forbiddenMarkers) {
        expect(source, `${relative(repositoryRoot, file)} matches ${marker}`).not.toMatch(marker);
      }
    }
  });
});

function listTypeScriptFiles(dir: string): string[] {
  if (!exists(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return listTypeScriptFiles(fullPath);
    return fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') ? [fullPath] : [];
  });
}

function exists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

function listProductionTypeScriptFiles(dir: string): string[] {
  if (!exists(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      return IGNORED_SCAN_DIRECTORIES.has(entry) ? [] : listProductionTypeScriptFiles(fullPath);
    }
    if (!fullPath.endsWith('.ts') && !fullPath.endsWith('.tsx')) return [];
    return /(?:^|\/)(?:__tests__|functional)(?:\/|$)/u.test(fullPath) ||
      /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(fullPath)
      ? []
      : [fullPath];
  });
}

const IGNORED_SCAN_DIRECTORIES = new Set([
  '.vite',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'reports',
]);
