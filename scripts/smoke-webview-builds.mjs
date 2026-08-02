#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const requested = new Set(
  (process.env.NEKO_WEBVIEW_SMOKE_PACKAGES ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const listOnly = process.argv.includes('--list');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const webviews = discoverWebviews(repoRoot, requested);

  if (webviews.length === 0) {
    throw new Error('No first-level Webview packages with build scripts were found.');
  }

  console.log(`[smoke] building ${webviews.length} webview package(s)`);

  if (listOnly) {
    for (const webview of webviews) {
      console.log(`[smoke] webview package: ${webview.name} (${relative(repoRoot, webview.dir)})`);
    }
  } else {
    for (const webview of webviews) {
      const label = `${webview.name} (${relative(repoRoot, webview.dir)})`;
      console.log(`[smoke] webview build start: ${label}`);

      const result = spawnSync('pnpm', ['--dir', webview.dir, 'run', 'build'], {
        cwd: repoRoot,
        stdio: 'inherit',
      });

      if (result.error) {
        throw result.error;
      }

      if (result.status !== 0) {
        process.exit(result.status ?? 1);
      }

      const distDir = join(webview.dir, 'dist');
      if (!existsSync(distDir)) {
        throw new Error(`Expected build output directory missing: ${distDir}`);
      }

      console.log(`[smoke] webview build ok: ${label}`);
    }
  }
}

export function discoverWebviews(repositoryRoot, selectedPackages = new Set()) {
  const packagesDir = join(repositoryRoot, 'packages');
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packagesDir, entry.name, 'webview', 'package.json'))
    .filter((packageJsonPath) => existsSync(packageJsonPath))
    .map((packageJsonPath) => {
      const raw = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      return {
        name: raw.name ?? basename(dirname(packageJsonPath)),
        dir: dirname(packageJsonPath),
        scripts: raw.scripts ?? {},
      };
    })
    .filter((pkg) => typeof pkg.scripts.build === 'string')
    .filter((pkg) => {
      if (selectedPackages.size === 0) return true;
      const relativeDir = relative(repositoryRoot, pkg.dir).split(/[/\\]/).join('/');
      const parentPackage = relativeDir.split('/')[1];
      return (
        selectedPackages.has(pkg.name) ||
        selectedPackages.has(parentPackage ?? '') ||
        selectedPackages.has(relativeDir)
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
