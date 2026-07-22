#!/usr/bin/env node

import { cpSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const agentRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SHARP_RUNTIME_PACKAGES = Object.freeze({
  'darwin-arm64': Object.freeze([
    Object.freeze({
      packageName: '@img/sharp-darwin-arm64',
      specifier: '@img/sharp-darwin-arm64/sharp.node',
    }),
    Object.freeze({
      packageName: '@img/sharp-libvips-darwin-arm64',
      specifier: '@img/sharp-libvips-darwin-arm64/lib',
    }),
  ]),
  'linux-x64': Object.freeze([
    Object.freeze({
      packageName: '@img/sharp-linux-x64',
      specifier: '@img/sharp-linux-x64/sharp.node',
    }),
    Object.freeze({
      packageName: '@img/sharp-libvips-linux-x64',
      specifier: '@img/sharp-libvips-linux-x64/lib',
    }),
  ]),
});

export function resolveSharpRuntimeTarget(platform = process.platform, arch = process.arch) {
  const target = `${platform}-${arch}`;
  if (Object.hasOwn(SHARP_RUNTIME_PACKAGES, target)) return target;
  throw new Error(`Unsupported Sharp runtime target: ${target}`);
}

export function getSharpRuntimePackages(target) {
  const packages = SHARP_RUNTIME_PACKAGES[target];
  if (!packages) throw new Error(`Unsupported Sharp runtime target: ${target}`);
  return packages;
}

export function stageSharpRuntime({
  target,
  outputRoot = join(agentRoot, 'dist'),
  resolvePackageRoot = resolveInstalledPackageRoot,
  copyDirectory = copyRuntimePackage,
} = {}) {
  const resolvedTarget = target ?? resolveSharpRuntimeTarget();
  const runtimePackages = getSharpRuntimePackages(resolvedTarget);
  const nodeModulesRoot = join(outputRoot, 'node_modules', '@img');
  rmSync(nodeModulesRoot, { recursive: true, force: true });
  mkdirSync(nodeModulesRoot, { recursive: true });

  for (const runtimePackage of runtimePackages) {
    const sourceRoot = resolvePackageRoot(runtimePackage.packageName);
    const destinationRoot = join(nodeModulesRoot, runtimePackage.packageName.slice('@img/'.length));
    copyDirectory(sourceRoot, destinationRoot);
  }

  const manifest = Object.freeze({
    schemaVersion: 'openneko.embedded-runtime-closure.v1',
    target: resolvedTarget,
    modules: runtimePackages.map(({ packageName, specifier }) => ({ packageName, specifier })),
  });
  writeFileSync(
    join(outputRoot, 'runtime-closure.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  return manifest;
}

function resolveInstalledPackageRoot(packageName) {
  try {
    return realpathSync(dirname(require.resolve(`${packageName}/package`)));
  } catch (error) {
    throw new Error(`Sharp runtime package is not installed: ${packageName}`, { cause: error });
  }
}

function copyRuntimePackage(sourceRoot, destinationRoot) {
  cpSync(sourceRoot, destinationRoot, { recursive: true, dereference: true });
}

function main() {
  const targetIndex = process.argv.indexOf('--target');
  const target = targetIndex >= 0 ? process.argv[targetIndex + 1] : undefined;
  if (targetIndex >= 0 && !target) throw new Error('--target requires a platform target.');
  const manifest = stageSharpRuntime({ target });
  process.stdout.write(`Staged Sharp runtime closure for ${manifest.target}.\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
