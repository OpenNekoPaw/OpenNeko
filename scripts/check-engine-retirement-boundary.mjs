#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const PRODUCT_FEATURE_MANIFESTS = Object.freeze([
  'apps/neko-vscode/package.json',
]);

const RETIRED_COMMANDS = Object.freeze([
  'neko.engine.ensureFrameServer',
  'neko.engine.extractThumbnail',
  'neko.engine.probeInternal',
]);

const PRODUCT_SOURCE_ROOTS = Object.freeze([
  'apps/neko-vscode/src/features',
]);

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
  const [groupsText, compositionText, contractText, packagerText, turboText, ...manifestTexts] =
    await Promise.all([
      readText('scripts/package-groups.json'),
      readText('apps/neko-vscode/src/extension.ts'),
      readText('scripts/openneko-vsix-contract.mjs'),
      readText('scripts/package-openneko-platform.mjs'),
      readText('turbo.json'),
      ...PRODUCT_FEATURE_MANIFESTS.map((file) => readText(file)),
    ]);

  const groups = JSON.parse(groupsText);
  assertAbsent(
    groups.packages?.buildRelease ?? [],
    'neko-engine',
    'scripts/package-groups.json buildRelease',
  );
  assertAbsent(
    groups.packages?.tsExtensions ?? [],
    'neko-engine',
    'scripts/package-groups.json tsExtensions',
  );

  if (/^\s*['"]neko-engine['"],?\s*$/mu.test(compositionText)) {
    throw new Error('OpenNeko FEATURE_ORDER still activates neko-engine.');
  }
  if (/^\s*['"]neko-engine['"],?\s*$/mu.test(contractText)) {
    throw new Error('OpenNeko VSIX feature contract still embeds neko-engine.');
  }
  if (/--engine-vsix|resolveEngineVsix|packages[/\\]neko-engine/u.test(packagerText)) {
    throw new Error('OpenNeko packager still accepts or resolves an Engine payload.');
  }
  const turbo = JSON.parse(turboText);
  for (const [task, definition] of Object.entries(turbo.tasks ?? {})) {
    if ((definition.dependsOn ?? []).includes('neko-engine#compile')) {
      throw new Error(`${task} still schedules the retired Engine.`);
    }
  }

  for (const [index, text] of manifestTexts.entries()) {
    const manifest = JSON.parse(text);
    assertAbsent(
      manifest.extensionDependencies ?? [],
      'neko.neko-engine',
      PRODUCT_FEATURE_MANIFESTS[index] ?? 'unknown manifest',
    );
  }

  if (!compositionText.includes("'neko.neko-engine'")) {
    throw new Error('OpenNeko does not reject a separately installed retired Engine extension.');
  }
  for (const command of RETIRED_COMMANDS) {
    if (!compositionText.includes(`'${command}'`)) {
      throw new Error(`OpenNeko does not poison retired media command ${command}.`);
    }
  }
  if (!compositionText.includes('Retired media command ${command} cannot be used')) {
    throw new Error('Retired Engine commands do not fail with the canonical diagnostic.');
  }

  const sourceViolations = [];
  for (const file of await listProductionFiles()) {
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
    featureManifestCount: PRODUCT_FEATURE_MANIFESTS.length,
    retiredCommandCount: RETIRED_COMMANDS.length,
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

function assertAbsent(values, prohibited, owner) {
  if (values.includes(prohibited)) {
    throw new Error(`${owner} still contains retired value ${prohibited}.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = await checkEngineRetirementBoundary();
    process.stdout.write(
      `[quality] Engine product retirement boundary passed (${result.featureManifestCount} manifests, ${result.retiredCommandCount} poisoned commands).\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
