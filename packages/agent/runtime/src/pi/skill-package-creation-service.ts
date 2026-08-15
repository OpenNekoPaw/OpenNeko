import { randomUUID } from 'node:crypto';
import { lstat, mkdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';

import type {
  CreateSkillInput,
  CreateSkillResult,
  PortableSkillDefinition,
  SkillResourceInput,
} from '@neko/agent-contracts';
import { stringify as stringifyYaml } from 'yaml';
import { createNodePiSkillHost } from './skill-host';

const MAX_RESOURCE_COUNT = 2_000;
const MAX_PACKAGE_BYTES = 20_000_000;
const RESERVED_RESOURCE_PATHS = new Set(['skill.md']);

export interface SkillPackageCreationService {
  create(input: {
    readonly skillRoot: string;
    readonly authorityRoot: string;
    readonly request: CreateSkillInput;
    readonly signal?: AbortSignal;
  }): Promise<CreateSkillResult>;
}

export function createNodeSkillPackageCreationService(): SkillPackageCreationService {
  return {
    async create({ skillRoot, authorityRoot, request, signal }) {
      signal?.throwIfAborted();
      if (!isAbsolute(skillRoot)) throw new Error('Skill package root must be absolute.');
      if (!isAbsolute(authorityRoot))
        throw new Error('Skill package authority root must be absolute.');
      const skill = validateSkillDefinition(request.skill);
      const resources = validateResources(request.resources ?? []);
      const skillDocument = serializeSkill(skill);
      const totalBytes =
        Buffer.byteLength(skillDocument, 'utf8') +
        resources.reduce((sum, resource) => sum + decodeResource(resource).byteLength, 0);
      if (totalBytes > MAX_PACKAGE_BYTES) {
        throw new Error(`Skill package exceeds ${MAX_PACKAGE_BYTES} bytes.`);
      }

      const canonicalRoot = resolve(skillRoot);
      await mkdir(canonicalRoot, { recursive: true });
      const physicalAuthorityRoot = await realpath(resolve(authorityRoot));
      const physicalSkillRoot = await realpath(canonicalRoot);
      if (!isWithinRoot(physicalAuthorityRoot, physicalSkillRoot)) {
        throw new Error('Skill package root escapes its authorized filesystem root.');
      }
      const target = join(physicalSkillRoot, skill.name);
      await requireMissingTarget(target, skill.name);
      signal?.throwIfAborted();

      const stagingRoot = join(
        dirname(physicalSkillRoot),
        `.openneko-skill-staging-${randomUUID()}`,
      );
      const stagedPackage = join(stagingRoot, skill.name);
      try {
        await mkdir(stagedPackage, { recursive: true });
        await writeFile(join(stagedPackage, 'SKILL.md'), skillDocument, 'utf8');
        for (const resource of resources) {
          signal?.throwIfAborted();
          const destination = join(stagedPackage, resource.path);
          await mkdir(dirname(destination), { recursive: true });
          await writeFile(destination, decodeResource(resource));
        }
        const snapshot = await createNodePiSkillHost({
          cwd: stagingRoot,
          policy: { isTrusted: () => true, isEnabled: () => true },
        }).discover([{ path: stagingRoot, source: { kind: request.target } }]);
        const record = snapshot.records[0];
        if (
          snapshot.records.length !== 1 ||
          record?.name !== skill.name ||
          snapshot.diagnostics.length > 0 ||
          snapshot.warnings.length > 0
        ) {
          throw new Error('Generated Skill package failed canonical SkillHost validation.');
        }
        signal?.throwIfAborted();
        await requireMissingTarget(target, skill.name);
        await rename(stagedPackage, target);
        return {
          name: skill.name,
          source: request.target,
          fingerprint: record.fingerprint,
        };
      } finally {
        await rm(stagingRoot, { recursive: true, force: true });
      }
    },
  };
}

function validateSkillDefinition(value: PortableSkillDefinition): PortableSkillDefinition {
  const name = value.name.trim();
  if (name.length > 64 || !isPortableSkillName(name)) {
    throw new Error('Skill name must be at most 64 lowercase letters, digits and hyphens.');
  }
  return {
    name,
    description: requireNonEmptyText(value.description, 'Skill description'),
    body: requireNonEmptyText(value.body, 'Skill body'),
    ...(value.license === undefined
      ? {}
      : { license: requireNonEmptyText(value.license, 'Skill license') }),
    ...(value.compatibility === undefined
      ? {}
      : { compatibility: requireNonEmptyText(value.compatibility, 'Skill compatibility') }),
    ...(value.metadata === undefined ? {} : { metadata: { ...value.metadata } }),
    ...(value.allowedTools === undefined ? {} : { allowedTools: [...value.allowedTools] }),
  };
}

function serializeSkill(skill: PortableSkillDefinition): string {
  const frontmatter = {
    name: skill.name,
    description: skill.description,
    ...(skill.license === undefined ? {} : { license: skill.license }),
    ...(skill.compatibility === undefined ? {} : { compatibility: skill.compatibility }),
    ...(skill.metadata === undefined ? {} : { metadata: skill.metadata }),
    ...(skill.allowedTools === undefined ? {} : { 'allowed-tools': skill.allowedTools }),
  };
  return `---\n${stringifyYaml(frontmatter).trimEnd()}\n---\n${skill.body.trim()}\n`;
}

function requireNonEmptyText(value: string, label: string): string {
  const text = value.trim();
  if (!text) throw new Error(`${label} must be non-empty.`);
  return text;
}

function isPortableSkillName(value: string): boolean {
  if (!value || value.startsWith('-') || value.endsWith('-') || value.includes('--')) return false;
  return [...value].every(
    (character) =>
      character === '-' ||
      (character >= 'a' && character <= 'z') ||
      (character >= '0' && character <= '9'),
  );
}

function validateResources(values: readonly SkillResourceInput[]): readonly SkillResourceInput[] {
  if (values.length > MAX_RESOURCE_COUNT) {
    throw new Error(`Skill package exceeds ${MAX_RESOURCE_COUNT} resource files.`);
  }
  const seen = new Set<string>();
  return values.map((resource) => {
    const value = resource.path.trim();
    if (
      !value ||
      value.includes('\\') ||
      isAbsolute(value) ||
      value.split('/').some((segment) => segment === '..' || segment === '.' || segment === '')
    ) {
      throw new Error(`Skill resource path '${resource.path}' must be a normalized relative path.`);
    }
    const normalized = normalize(value);
    if (
      RESERVED_RESOURCE_PATHS.has(normalized.toLocaleLowerCase()) ||
      normalized.startsWith(`..${sep}`)
    ) {
      throw new Error(`Skill resource path '${resource.path}' is reserved or escapes the package.`);
    }
    if (seen.has(normalized)) throw new Error(`Duplicate Skill resource '${normalized}'.`);
    seen.add(normalized);
    return { ...resource, path: normalized };
  });
}

function decodeResource(resource: SkillResourceInput): Uint8Array {
  if (resource.encoding === 'utf8') return Buffer.from(resource.content, 'utf8');
  const compact = [...resource.content].filter((character) => character.trim() !== '').join('');
  const decoded = Buffer.from(compact, 'base64');
  if (compact.length === 0 || compact.length % 4 !== 0 || decoded.toString('base64') !== compact) {
    throw new Error(`Skill resource '${resource.path}' contains invalid base64 content.`);
  }
  return decoded;
}

async function requireMissingTarget(target: string, name: string): Promise<void> {
  try {
    await lstat(target);
    throw new Error(`Skill '${name}' already exists in the selected destination.`);
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }
}

function isWithinRoot(root: string, target: string): boolean {
  const fromRoot = relative(root, target);
  return fromRoot === '' || (!fromRoot.startsWith(`..${sep}`) && fromRoot !== '..');
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'ENOENT'
  );
}
