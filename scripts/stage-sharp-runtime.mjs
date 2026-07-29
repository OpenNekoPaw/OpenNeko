#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);

const SHARP_JAVASCRIPT_RUNTIME_PACKAGES = Object.freeze([
  Object.freeze({ packageName: 'sharp', specifier: 'sharp' }),
  Object.freeze({ packageName: '@img/colour', specifier: '@img/colour' }),
  Object.freeze({ packageName: 'detect-libc', specifier: 'detect-libc' }),
  Object.freeze({ packageName: 'semver', specifier: 'semver' }),
]);

const SHARP_TARGET_RUNTIME_PACKAGES = Object.freeze({
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

function resolveSharpRuntimeTarget(platform = process.platform, arch = process.arch) {
  const target = `${platform}-${arch}`;
  if (Object.hasOwn(SHARP_TARGET_RUNTIME_PACKAGES, target)) return target;
  throw new Error(`Unsupported Sharp runtime target: ${target}`);
}

export function getSharpRuntimePackages(target) {
  const targetPackages = SHARP_TARGET_RUNTIME_PACKAGES[target];
  if (!targetPackages) throw new Error(`Unsupported Sharp runtime target: ${target}`);
  return Object.freeze([...SHARP_JAVASCRIPT_RUNTIME_PACKAGES, ...targetPackages]);
}

export function stageSharpRuntime({
  target,
  outputRoot = resolve(process.cwd(), 'dist'),
  resolvePackageRoot = resolveInstalledPackageRoot,
  copyDirectory = copyRuntimePackage,
} = {}) {
  const resolvedTarget = target ?? resolveSharpRuntimeTarget();
  const runtimePackages = getSharpRuntimePackages(resolvedTarget);
  const nodeModulesRoot = join(outputRoot, 'node_modules');
  removePriorSharpClosure(nodeModulesRoot);
  mkdirSync(nodeModulesRoot, { recursive: true });

  for (const runtimePackage of runtimePackages) {
    const sourceRoot = resolvePackageRoot(runtimePackage.packageName, runtimePackage.specifier);
    const destinationRoot = join(nodeModulesRoot, runtimePackage.packageName);
    mkdirSync(dirname(destinationRoot), { recursive: true });
    copyDirectory(sourceRoot, destinationRoot);
  }

  const manifest = Object.freeze({
    schemaVersion: 'openneko.application-runtime-closure.v1',
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

function resolveInstalledPackageRoot(packageName, specifier) {
  let current;
  try {
    const resolvedEntry = realpathSync(require.resolve(specifier));
    current = statSync(resolvedEntry).isDirectory() ? resolvedEntry : dirname(resolvedEntry);
  } catch (error) {
    throw new Error(`Sharp runtime package is not installed: ${packageName}`, { cause: error });
  }

  while (true) {
    const manifestPath = join(current, 'package.json');
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (manifest.name === packageName) return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`Cannot locate Sharp runtime package root: ${packageName}`);
}

function removePriorSharpClosure(nodeModulesRoot) {
  for (const packageName of ['sharp', 'detect-libc', 'semver', '@img']) {
    rmSync(join(nodeModulesRoot, packageName), { recursive: true, force: true });
  }
}

function copyRuntimePackage(sourceRoot, destinationRoot) {
  cpSync(sourceRoot, destinationRoot, { recursive: true, dereference: true });
}

function main() {
  const target = readArgument('--target');
  const outputRoot = readArgument('--output-root');
  const manifest = stageSharpRuntime({
    target,
    ...(outputRoot ? { outputRoot: resolve(process.cwd(), outputRoot) } : {}),
  });
  process.stdout.write(
    `Staged Sharp runtime closure for ${manifest.target} in ${outputRoot ?? 'dist'}.\n`,
  );
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (index >= 0 && !value) throw new Error(`${name} requires a value.`);
  return value;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
