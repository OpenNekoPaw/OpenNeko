import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join, relative } from 'node:path';

import { OPENNEKO_PLATFORM_TARGETS } from './openneko-vsix-contract.mjs';

const RUNTIME_CLOSURE_SCHEMA = 'openneko.application-runtime-closure.v1';
const INTERNAL_BARE_IMPORT_PATTERN =
  /\b(?:require|import)\(\s*['"](@(?:neko|neko-agent)\/[^'"]+)['"]\s*\)/gu;
const VARIABLE_PACKAGE_IMPORT_PATTERN = /\bimport\(packageName\)/u;

export function assertApplicationRuntimeClosure(stageRoot, target) {
  const applicationBundlePath = join(stageRoot, 'dist', 'extension.js');
  if (!existsSync(applicationBundlePath)) {
    throw new Error(`Embedded application bundle is missing: ${applicationBundlePath}`);
  }
  const applicationSource = readFileSync(applicationBundlePath, 'utf8');
  assertNoProhibitedRuntimeImports(applicationSource, 'neko-suite');
  const applicationModules = assertRuntimeManifest(stageRoot, applicationBundlePath, target);
  return Object.freeze({
    packageName: 'neko-suite',
    runtimeModuleCount: applicationModules.length,
  });
}

function assertNoProhibitedRuntimeImports(bundleSource, packageName) {
  const internalImports = [...bundleSource.matchAll(INTERNAL_BARE_IMPORT_PATTERN)].map(
    (match) => match[1],
  );
  if (internalImports.length > 0) {
    throw new Error(
      `Application ${packageName} retains internal bare runtime imports: ${[...new Set(internalImports)].join(', ')}.`,
    );
  }
  if (VARIABLE_PACKAGE_IMPORT_PATTERN.test(bundleSource)) {
    throw new Error(
      `Application ${packageName} retains import(packageName), which cannot be closed offline.`,
    );
  }
}

function assertRuntimeManifest(packageRoot, bundlePath, target) {
  const manifestPath = join(packageRoot, 'dist', 'runtime-closure.json');
  if (!existsSync(manifestPath)) return [];

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== RUNTIME_CLOSURE_SCHEMA) {
    throw new Error(
      `Application runtime closure has unsupported schema in ${manifestPath}: ${JSON.stringify(manifest.schemaVersion)}.`,
    );
  }
  if (manifest.target !== target) {
    throw new Error(
      `Application runtime closure target mismatch in ${manifestPath}: expected ${target}, received ${JSON.stringify(manifest.target)}.`,
    );
  }
  if (!Array.isArray(manifest.modules) || manifest.modules.length === 0) {
    throw new Error(`Application runtime closure has no modules: ${manifestPath}.`);
  }

  const canonicalPackageRoot = realpathSync(packageRoot);
  const featureRequire = createRequire(bundlePath);
  const seenSpecifiers = new Set();
  for (const entry of manifest.modules) {
    const packageName = readRequiredString(entry, 'packageName', manifestPath);
    const specifier = readRequiredString(entry, 'specifier', manifestPath);
    if (seenSpecifiers.has(specifier)) {
      throw new Error(`Application runtime closure repeats module ${specifier}: ${manifestPath}.`);
    }
    seenSpecifiers.add(specifier);
    assertNoCrossTargetSpecifier(specifier, target, manifestPath);

    let resolvedPath;
    try {
      resolvedPath = realpathSync(featureRequire.resolve(specifier));
    } catch (error) {
      throw new Error(
        `Application runtime module cannot be resolved from ${bundlePath}: ${specifier} (${packageName}).`,
        { cause: error },
      );
    }
    const relativePath = relative(canonicalPackageRoot, resolvedPath);
    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new Error(
        `Embedded runtime module resolved outside payload ${packageRoot}: ${specifier} -> ${resolvedPath}.`,
      );
    }
  }

  return manifest.modules;
}

function readRequiredString(value, property, manifestPath) {
  if (typeof value !== 'object' || value === null) {
      throw new Error(`Application runtime closure module is invalid in ${manifestPath}.`);
  }
  const propertyValue = Reflect.get(value, property);
  if (typeof propertyValue !== 'string' || propertyValue.length === 0) {
    throw new Error(`Application runtime closure module.${property} is invalid in ${manifestPath}.`);
  }
  return propertyValue;
}

function assertNoCrossTargetSpecifier(specifier, target, manifestPath) {
  for (const supportedTarget of OPENNEKO_PLATFORM_TARGETS) {
    if (supportedTarget !== target && specifier.includes(supportedTarget)) {
      throw new Error(
        `Application runtime closure contains ${supportedTarget} module for ${target}: ${specifier} (${manifestPath}).`,
      );
    }
  }
}
