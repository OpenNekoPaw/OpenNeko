#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const PRODUCT_SOURCE_ROOTS = Object.freeze(['apps/neko-desktop/src', 'packages']);

const PROHIBITED_SOURCE_SURFACES = Object.freeze([
  { label: '@neko/neko-client import', pattern: /['"]@neko\/neko-client(?:\/[^'"]*)?['"]/u },
  { label: 'retired Engine command', pattern: /['"]neko\.engine\.[^'"]+['"]/u },
  { label: 'retired Engine extension', pattern: /['"]neko\.neko-engine['"]/u },
  { label: 'EngineClient symbol', pattern: /\bEngineClient\b/u },
  { label: 'MediaPlaybackService symbol', pattern: /\bMediaPlaybackService\b/u },
]);

export async function checkEngineRetirementBoundary(
  readText = (file) => readFile(file, 'utf8'),
  listProductionFiles = listProductSourceFiles,
) {
  const sourceViolations = [];
  const productionFiles = await listProductionFiles();
  for (const file of productionFiles) {
    const source = await readText(file);
    for (const surface of PROHIBITED_SOURCE_SURFACES) {
      if (surface.pattern.test(source)) {
        sourceViolations.push(`${file}: ${surface.label}`);
      }
    }
  }

  if (sourceViolations.length > 0) {
    throw new Error(
      `Production Engine consumers remain:\n${sourceViolations.map((item) => `- ${item}`).join('\n')}`,
    );
  }

  return Object.freeze({
    productionFileCount: productionFiles.length,
    prohibitedSurfaceCount: PROHIBITED_SOURCE_SURFACES.length,
  });
}

async function listProductSourceFiles() {
  const files = [];
  for (const root of PRODUCT_SOURCE_ROOTS) {
    await collectProductionFiles(root, files);
  }
  return files.sort();
}

async function collectProductionFiles(directory, files) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (
      entry.name === 'node_modules' ||
      entry.name === 'dist' ||
      entry.name === 'docs' ||
      entry.name === '__tests__'
    ) {
      continue;
    }
    if (entry.isDirectory()) {
      await collectProductionFiles(file, files);
      continue;
    }
    if (
      entry.isFile() &&
      /\.[cm]?[jt]sx?$/u.test(entry.name) &&
      !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(entry.name)
    ) {
      files.push(file);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = await checkEngineRetirementBoundary();
    process.stdout.write(
      `[quality] Engine retirement boundary passed (${result.productionFileCount} production files, ${result.prohibitedSurfaceCount} prohibited surfaces).\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
