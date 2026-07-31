import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { readConfigDocumentFileResult } from '@neko/shared/config/config-reader';
import type {
  DesktopHomeExtensionDiagnosticCode,
  DesktopHomeExtensionItem,
} from '../shared/home-management-contract';

export interface DesktopExtensionCatalogSnapshot {
  readonly records: readonly DesktopHomeExtensionItem[];
  readonly diagnostics: readonly {
    readonly code: DesktopHomeExtensionDiagnosticCode;
    readonly count: number;
  }[];
}

export interface DesktopExtensionCatalogReader {
  readCatalog(): Promise<DesktopExtensionCatalogSnapshot>;
}

export interface CreateDesktopExtensionCatalogReaderOptions {
  readonly codexHome: string;
}

interface PluginRegistration {
  readonly id: string;
  readonly name: string;
  readonly marketplace: string;
}

const MAX_PLUGIN_DOCUMENT_BYTES = 1_000_000;

type CatalogReadResult<T> =
  | { readonly status: 'ok'; readonly value: T }
  | { readonly status: 'error'; readonly code: DesktopHomeExtensionDiagnosticCode };

export function createDesktopExtensionCatalogReader(
  options: CreateDesktopExtensionCatalogReaderOptions,
): DesktopExtensionCatalogReader {
  const codexHome = resolve(options.codexHome);
  return {
    async readCatalog() {
      const config = readConfigDocumentFileResult(join(codexHome, 'config.toml'));
      if (config.status === 'missing') return freezeSnapshot([], []);
      if (config.status !== 'ok') return freezeSnapshot([], ['config_invalid']);

      const registrations = parseEnabledRegistrations(config.document);
      if (registrations.status === 'error') {
        return freezeSnapshot([], [registrations.code]);
      }

      const records: DesktopHomeExtensionItem[] = [];
      const diagnosticCodes: DesktopHomeExtensionDiagnosticCode[] = [];
      const cacheRoot = join(codexHome, 'plugins', 'cache');
      for (const registration of registrations.value.records) {
        const result = await readPluginPackage(cacheRoot, registration);
        if (result.status === 'ok') records.push(result.value);
        else diagnosticCodes.push(result.code);
      }
      diagnosticCodes.push(...registrations.value.diagnostics);
      records.sort((left, right) => left.id.localeCompare(right.id));
      return freezeSnapshot(records, diagnosticCodes);
    },
  };
}

function parseEnabledRegistrations(document: unknown): CatalogReadResult<{
  readonly records: readonly PluginRegistration[];
  readonly diagnostics: readonly DesktopHomeExtensionDiagnosticCode[];
}> {
  if (!isRecord(document)) return { status: 'error', code: 'config_invalid' };
  const plugins = document['plugins'];
  if (plugins === undefined) {
    return { status: 'ok', value: { records: [], diagnostics: [] } };
  }
  if (!isRecord(plugins)) return { status: 'error', code: 'config_invalid' };

  const records: PluginRegistration[] = [];
  const diagnostics: DesktopHomeExtensionDiagnosticCode[] = [];
  for (const [id, settings] of Object.entries(plugins)) {
    if (!isRecord(settings) || typeof settings['enabled'] !== 'boolean') {
      diagnostics.push('registration_invalid');
      continue;
    }
    if (!settings['enabled']) continue;
    const registration = parseRegistrationId(id);
    if (!registration) {
      diagnostics.push('registration_invalid');
      continue;
    }
    records.push(registration);
  }
  records.sort((left, right) => left.id.localeCompare(right.id));
  return { status: 'ok', value: { records, diagnostics } };
}

function parseRegistrationId(id: string): PluginRegistration | undefined {
  const separator = id.lastIndexOf('@');
  if (separator <= 0 || separator === id.length - 1) return undefined;
  const name = id.slice(0, separator);
  const marketplace = id.slice(separator + 1);
  if (!isPathSegment(name) || !isPathSegment(marketplace)) return undefined;
  return Object.freeze({ id, name, marketplace });
}

async function readPluginPackage(
  cacheRoot: string,
  registration: PluginRegistration,
): Promise<CatalogReadResult<DesktopHomeExtensionItem>> {
  const configuredPackageFamilyRoot = join(cacheRoot, registration.marketplace, registration.name);
  let packageFamilyRoot: string;
  let entries;
  try {
    const [canonicalCacheRoot, canonicalPackageFamilyRoot] = await Promise.all([
      realpath(cacheRoot),
      realpath(configuredPackageFamilyRoot),
    ]);
    if (!isInside(canonicalCacheRoot, canonicalPackageFamilyRoot)) {
      return { status: 'error', code: 'package_missing' };
    }
    packageFamilyRoot = canonicalPackageFamilyRoot;
    entries = await readdir(packageFamilyRoot, { withFileTypes: true });
  } catch {
    return { status: 'error', code: 'package_missing' };
  }
  const versions = entries.filter((entry) => entry.isDirectory() && isPathSegment(entry.name));
  if (versions.length === 0) return { status: 'error', code: 'package_missing' };
  if (versions.length !== 1) return { status: 'error', code: 'package_version_ambiguous' };
  const version = versions[0];
  if (!version) return { status: 'error', code: 'package_missing' };
  const pluginRoot = join(packageFamilyRoot, version.name);

  const manifestResult = await readJsonRecord(
    join(pluginRoot, '.codex-plugin', 'plugin.json'),
    pluginRoot,
    'manifest_invalid',
  );
  if (manifestResult.status === 'error') return manifestResult;
  const manifest = manifestResult.value;
  if (
    manifest['name'] !== registration.name ||
    !isNonEmptyString(manifest['version']) ||
    !isOptionalString(manifest['description'])
  ) {
    return { status: 'error', code: 'manifest_invalid' };
  }
  const interfaceMetadata = optionalRecord(manifest['interface']);
  const author = optionalRecord(manifest['author']);
  if (
    interfaceMetadata === null ||
    author === null ||
    !isOptionalString(interfaceMetadata?.['displayName']) ||
    !isOptionalString(interfaceMetadata?.['shortDescription']) ||
    !isOptionalString(interfaceMetadata?.['developerName']) ||
    !isOptionalString(author?.['name'])
  ) {
    return { status: 'error', code: 'manifest_invalid' };
  }

  const mcpServerIds = await readContributionIds(manifest, 'mcpServers', pluginRoot, 'mcpServers');
  if (mcpServerIds.status === 'error') return mcpServerIds;
  const appIds = await readContributionIds(manifest, 'apps', pluginRoot, 'apps');
  if (appIds.status === 'error') return appIds;
  const skills = await readSkillContribution(manifest, pluginRoot);
  if (skills.status === 'error') return skills;

  const canonicalDescription = manifest['description'] ?? '';
  return {
    status: 'ok',
    value: Object.freeze({
      id: registration.id,
      name: registration.name,
      displayName: interfaceMetadata?.['displayName'] ?? registration.name,
      description: interfaceMetadata?.['shortDescription'] ?? canonicalDescription,
      version: manifest['version'],
      developer: interfaceMetadata?.['developerName'] ?? author?.['name'] ?? '',
      marketplace: registration.marketplace,
      mcpServerIds: Object.freeze([...mcpServerIds.value]),
      hasSkills: skills.value,
      appIds: Object.freeze([...appIds.value]),
    }),
  };
}

async function readContributionIds(
  manifest: Record<string, unknown>,
  manifestKey: 'mcpServers' | 'apps',
  pluginRoot: string,
  documentKey: 'mcpServers' | 'apps',
): Promise<CatalogReadResult<readonly string[]>> {
  const locator = manifest[manifestKey];
  if (locator === undefined) return { status: 'ok', value: [] };
  if (!isNonEmptyString(locator)) return { status: 'error', code: 'contribution_invalid' };
  const contributionPath = resolvePackagePath(pluginRoot, locator);
  if (!contributionPath) return { status: 'error', code: 'contribution_invalid' };
  const document = await readJsonRecord(contributionPath, pluginRoot, 'contribution_invalid');
  if (document.status === 'error') return document;
  const contributions = document.value[documentKey];
  if (!isRecord(contributions)) {
    return { status: 'error', code: 'contribution_invalid' };
  }
  const ids = Object.keys(contributions);
  if (
    ids.some((id) => !isExtensionIdentifier(id)) ||
    Object.values(contributions).some((value) => !isRecord(value))
  ) {
    return { status: 'error', code: 'contribution_invalid' };
  }
  return { status: 'ok', value: Object.freeze(ids.sort()) };
}

async function readSkillContribution(
  manifest: Record<string, unknown>,
  pluginRoot: string,
): Promise<CatalogReadResult<boolean>> {
  const locator = manifest['skills'];
  if (locator === undefined) return { status: 'ok', value: false };
  if (!isNonEmptyString(locator)) return { status: 'error', code: 'contribution_invalid' };
  const skillsPath = resolvePackagePath(pluginRoot, locator);
  if (!skillsPath) return { status: 'error', code: 'contribution_invalid' };
  try {
    const [canonicalPluginRoot, canonicalSkillsPath, info] = await Promise.all([
      realpath(pluginRoot),
      realpath(skillsPath),
      lstat(skillsPath),
    ]);
    if (
      !isInside(canonicalPluginRoot, canonicalSkillsPath) ||
      !info.isDirectory() ||
      info.isSymbolicLink()
    ) {
      return { status: 'error', code: 'contribution_invalid' };
    }
  } catch {
    return { status: 'error', code: 'contribution_invalid' };
  }
  return { status: 'ok', value: true };
}

async function readJsonRecord(
  filePath: string,
  pluginRoot: string,
  code: DesktopHomeExtensionDiagnosticCode,
): Promise<CatalogReadResult<Record<string, unknown>>> {
  if (!isInside(pluginRoot, filePath)) return { status: 'error', code };
  try {
    const [canonicalPluginRoot, canonicalFilePath, info] = await Promise.all([
      realpath(pluginRoot),
      realpath(filePath),
      lstat(filePath),
    ]);
    if (
      !isInside(canonicalPluginRoot, canonicalFilePath) ||
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size > MAX_PLUGIN_DOCUMENT_BYTES
    ) {
      return { status: 'error', code };
    }
    const source = await readFile(canonicalFilePath, 'utf8');
    const parsed: unknown = JSON.parse(source);
    return isRecord(parsed) ? { status: 'ok', value: parsed } : { status: 'error', code };
  } catch {
    return { status: 'error', code };
  }
}

function resolvePackagePath(pluginRoot: string, locator: string): string | undefined {
  if (isAbsolute(locator)) return undefined;
  const resolved = resolve(pluginRoot, locator);
  return isInside(pluginRoot, resolved) ? resolved : undefined;
}

function isInside(root: string, target: string): boolean {
  const pathFromRoot = relative(resolve(root), resolve(target));
  return pathFromRoot !== '' && !pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot);
}

function freezeSnapshot(
  records: readonly DesktopHomeExtensionItem[],
  diagnosticCodes: readonly DesktopHomeExtensionDiagnosticCode[],
): DesktopExtensionCatalogSnapshot {
  const counts = new Map<DesktopHomeExtensionDiagnosticCode, number>();
  for (const code of diagnosticCodes) counts.set(code, (counts.get(code) ?? 0) + 1);
  return Object.freeze({
    records: Object.freeze([...records]),
    diagnostics: Object.freeze(
      [...counts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([code, count]) => Object.freeze({ code, count })),
    ),
  });
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined | null {
  if (value === undefined) return undefined;
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPathSegment(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value) && value !== '.' && value !== '..';
}

function isExtensionIdentifier(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value);
}
