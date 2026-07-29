import { isDeepStrictEqual } from 'node:util';

export const OPENNEKO_PLATFORM_TARGETS = Object.freeze(['darwin-arm64', 'linux-x64']);

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

export function assertCanonicalOpenNekoManifest(manifest) {
  if (manifest.name !== 'neko-suite' || manifest.publisher !== 'neko') {
    throw new Error('OpenNeko must preserve the neko.neko-suite extension identity.');
  }
  if (manifest.main !== './dist/extension.js') {
    throw new Error('OpenNeko must expose exactly one application Extension Host entry.');
  }
  if (manifest.extensionPack || manifest.extensionDependencies) {
    throw new Error('OpenNeko cannot depend on separately installed feature extensions.');
  }
  if (!manifest.contributes || Object.keys(manifest.contributes).length === 0) {
    throw new Error('OpenNeko app manifest must own all retained contributions.');
  }
  const files = new Set(manifest.files ?? []);
  for (const required of ['dist/**', 'l10n/**', 'package.nls.json', 'package.nls.zh-cn.json']) {
    if (!files.has(required)) throw new Error(`OpenNeko app manifest is missing ${required}.`);
  }
  return Object.freeze({
    contributionSections: Object.keys(manifest.contributes).sort(),
  });
}
