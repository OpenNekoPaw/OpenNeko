import { isDeepStrictEqual } from 'node:util';

export const OPENNEKO_FEATURE_PACKAGES = Object.freeze([
  'neko-engine',
  'neko-tools',
  'neko-preview',
  'neko-assets',
  'neko-cut',
  'neko-canvas',
  'neko-agent',
]);

export const OPENNEKO_PLATFORM_TARGETS = Object.freeze(['darwin-arm64', 'linux-x64']);

const INTERNAL_EXTENSION_IDS = new Set(
  OPENNEKO_FEATURE_PACKAGES.map((packageName) => `neko.${packageName}`),
);

const ARRAY_ID_FIELDS = Object.freeze({
  commands: ['command'],
  customEditors: ['viewType'],
  iconThemes: ['id'],
  languages: ['id'],
  submenus: ['id'],
  themes: ['id', 'label', 'path'],
  viewsContainers: ['id'],
  views: ['id'],
  'neko.installTargets': ['id', 'type', 'kind'],
});

export function openNekoArtifactName(target, version) {
  if (!OPENNEKO_PLATFORM_TARGETS.includes(target)) {
    throw new Error(`Unsupported OpenNeko VSIX target: ${target}`);
  }
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(version)) {
    throw new Error(`OpenNeko VSIX version must be numeric SemVer: ${version}`);
  }
  return `OpenNeko-${target}-${version}.vsix`;
}

export function expectedOpenNekoArtifacts(version) {
  return OPENNEKO_PLATFORM_TARGETS.map((target) => openNekoArtifactName(target, version));
}

export function assertOpenNekoReleaseArtifacts(files, version) {
  const actual = [...files].sort();
  const expected = expectedOpenNekoArtifacts(version).sort();
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(
      `Release VSIX set mismatch. Expected ${expected.join(', ')}; received ${actual.join(', ') || '<empty>'}.`,
    );
  }
  return Object.freeze({ files: expected });
}

export function composeOpenNekoManifest({ appManifest, featureManifests }) {
  const entries = normalizeFeatureManifestEntries(featureManifests);
  const actualFeatures = entries.map(([packageName]) => packageName);
  if (!isDeepStrictEqual(actualFeatures, OPENNEKO_FEATURE_PACKAGES)) {
    throw new Error(
      `OpenNeko feature order mismatch. Expected ${OPENNEKO_FEATURE_PACKAGES.join(', ')}; received ${actualFeatures.join(', ')}.`,
    );
  }

  const composed = structuredClone(appManifest);
  delete composed.extensionPack;
  delete composed.extensionDependencies;
  composed.main = './dist/extension.js';
  composed.files = [
    'dist/**',
    'package.nls.json',
    'package.nls.zh-cn.json',
    'README.md',
    'LICENSE',
  ];
  composed.activationEvents = [];
  composed.contributes = {};

  const categories = new Set(composed.categories ?? []);
  const keywords = new Set(composed.keywords ?? []);
  const externalDependencies = new Set();

  for (const [packageName, manifest] of entries) {
    if (manifest.version !== composed.version) {
      throw new Error(
        `${packageName}/package.json declares ${String(manifest.version)}; expected ${String(composed.version)}.`,
      );
    }
    for (const activationEvent of manifest.activationEvents ?? []) {
      if (!composed.activationEvents.includes(activationEvent)) {
        composed.activationEvents.push(activationEvent);
      }
    }
    for (const category of manifest.categories ?? []) categories.add(category);
    for (const keyword of manifest.keywords ?? []) keywords.add(keyword);
    for (const dependency of manifest.extensionDependencies ?? []) {
      if (!INTERNAL_EXTENSION_IDS.has(dependency)) externalDependencies.add(dependency);
    }
    mergeContributes(
      composed.contributes,
      rebaseFeatureContributionResources(manifest.contributes ?? {}, packageName),
      packageName,
    );
  }

  composed.activationEvents.sort();
  composed.categories = [...categories].sort();
  composed.keywords = [...keywords].sort();
  if (externalDependencies.size > 0) {
    composed.extensionDependencies = [...externalDependencies].sort();
  }
  return composed;
}

function rebaseFeatureContributionResources(contributes, packageName) {
  const rebased = structuredClone(contributes);
  for (const section of ['themes', 'iconThemes', 'productIconThemes', 'grammars', 'snippets']) {
    for (const entry of normalizeArray(rebased[section] ?? [])) {
      if (isRecord(entry) && typeof entry.path === 'string') {
        entry.path = rebaseFeatureResourcePath(entry.path, packageName);
      }
    }
  }
  for (const language of normalizeArray(rebased.languages ?? [])) {
    if (!isRecord(language)) continue;
    if (typeof language.configuration === 'string') {
      language.configuration = rebaseFeatureResourcePath(language.configuration, packageName);
    }
    if (language.icon !== undefined) {
      language.icon = rebaseContributionIcon(language.icon, packageName);
    }
  }
  for (const command of normalizeArray(rebased.commands ?? [])) {
    if (isRecord(command) && command.icon !== undefined) {
      command.icon = rebaseContributionIcon(command.icon, packageName);
    }
  }
  for (const section of ['viewsContainers', 'views']) {
    const groups = rebased[section];
    if (!isRecord(groups)) continue;
    for (const entries of Object.values(groups)) {
      for (const entry of normalizeArray(entries)) {
        if (isRecord(entry) && entry.icon !== undefined) {
          entry.icon = rebaseContributionIcon(entry.icon, packageName);
        }
      }
    }
  }
  return rebased;
}

function rebaseContributionIcon(icon, packageName) {
  if (typeof icon === 'string') {
    return icon.startsWith('$(') ? icon : rebaseFeatureResourcePath(icon, packageName);
  }
  if (!isRecord(icon)) {
    throw new Error(
      `${packageName} contribution icon must be a path, ThemeIcon, or light/dark pair.`,
    );
  }
  const rebased = structuredClone(icon);
  for (const variant of ['light', 'dark']) {
    if (typeof rebased[variant] === 'string') {
      rebased[variant] = rebaseFeatureResourcePath(rebased[variant], packageName);
    }
  }
  return rebased;
}

function rebaseFeatureResourcePath(resourcePath, packageName) {
  const normalized = resourcePath.startsWith('./') ? resourcePath.slice(2) : resourcePath;
  if (
    normalized.length === 0 ||
    normalized.startsWith('/') ||
    normalized.split('/').includes('..') ||
    /^[A-Za-z][A-Za-z\d+.-]*:/u.test(normalized)
  ) {
    throw new Error(
      `${packageName} contribution resource must be a package-relative path: ${resourcePath}`,
    );
  }
  return `./dist/features/${packageName}/${normalized}`;
}

export function mergeOpenNekoLocalization(entries) {
  const merged = {};
  const owners = new Map();
  for (const [owner, dictionary] of entries) {
    for (const [key, value] of Object.entries(dictionary)) {
      if (Object.hasOwn(merged, key) && merged[key] !== value) {
        throw new Error(
          `Localization key ${key} conflicts between ${owners.get(key)} and ${owner}.`,
        );
      }
      merged[key] = value;
      owners.set(key, owner);
    }
  }
  return Object.fromEntries(
    Object.entries(merged).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function normalizeFeatureManifestEntries(featureManifests) {
  const entries = featureManifests instanceof Map ? [...featureManifests] : [...featureManifests];
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') {
      throw new Error('Feature manifests must be [packageName, manifest] entries.');
    }
  }
  return entries;
}

function mergeContributes(target, source, owner) {
  for (const [section, value] of Object.entries(source)) {
    if (target[section] === undefined) {
      target[section] = structuredClone(value);
      continue;
    }

    if (section === 'configuration') {
      target[section] = mergeConfiguration(target[section], value, owner);
      continue;
    }

    if (isRecord(target[section]) && isRecord(value)) {
      target[section] = mergeContributionRecord(section, target[section], value, owner);
      continue;
    }

    if (Array.isArray(target[section]) && Array.isArray(value)) {
      target[section] = mergeContributionArray(section, target[section], value, owner);
      continue;
    }

    if (!isDeepStrictEqual(target[section], value)) {
      throw new Error(`Contribution section ${section} conflicts while merging ${owner}.`);
    }
  }
}

function mergeConfiguration(left, right, owner) {
  const merged = [...normalizeArray(left)];
  for (const value of normalizeArray(right)) {
    const identity = contributionIdentity('configuration', value);
    const existing = merged.find(
      (candidate) => contributionIdentity('configuration', candidate) === identity,
    );
    if (existing && !isDeepStrictEqual(existing, value)) {
      throw new Error(`Contribution configuration:${identity} conflicts while merging ${owner}.`);
    }
    if (!existing) merged.push(structuredClone(value));
  }
  return merged;
}

function mergeContributionRecord(section, left, right, owner) {
  const merged = structuredClone(left);
  for (const [key, value] of Object.entries(right)) {
    if (merged[key] === undefined) {
      merged[key] = structuredClone(value);
      continue;
    }
    if (Array.isArray(merged[key]) && Array.isArray(value)) {
      merged[key] = mergeContributionArray(`${section}.${key}`, merged[key], value, owner);
      continue;
    }
    if (!isDeepStrictEqual(merged[key], value)) {
      throw new Error(`Contribution ${section}.${key} conflicts while merging ${owner}.`);
    }
  }
  return merged;
}

function mergeContributionArray(section, left, right, owner) {
  const merged = structuredClone(left);
  const identities = new Map(merged.map((value) => [contributionIdentity(section, value), value]));
  for (const value of right) {
    const identity = contributionIdentity(section, value);
    const existing = identities.get(identity);
    if (existing && !isDeepStrictEqual(existing, value)) {
      throw new Error(`Contribution ${section}:${identity} conflicts while merging ${owner}.`);
    }
    if (!existing) {
      const copy = structuredClone(value);
      merged.push(copy);
      identities.set(identity, copy);
    }
  }
  return merged;
}

function contributionIdentity(section, value) {
  if (!isRecord(value)) return JSON.stringify(value);
  const baseSection = section.split('.')[0];
  const fields = ARRAY_ID_FIELDS[baseSection] ?? ['command', 'submenu', 'id', 'viewType', 'title'];
  const identity = fields
    .filter((field) => value[field] !== undefined)
    .map((field) => `${field}=${String(value[field])}`)
    .join('|');
  return identity || JSON.stringify(value);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [value];
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
