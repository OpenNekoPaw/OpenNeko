import { randomUUID } from 'node:crypto';
import { access, link, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve as resolvePath } from 'node:path';
import { PathResolver } from '../path/resolver';
import {
  createWorkspacePortableLocator,
  ensureWorkspaceIdentityDescriptor,
  NekoStorageContractError,
  parseWorkspaceIdentityJson,
  serializeWorkspaceIdentityDescriptor,
  WORKSPACE_IDENTITY_RELATIVE_PATH,
  type WorkspaceIdentityDescriptor,
  type WorkspaceIdentityFilePort,
  type WorkspacePortableLocator,
} from '../types/storage';
import type { LocalMetadataStore } from './contracts';
import type { WorkspaceRegistryRecord } from './repositories';

function hasNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && Reflect.get(error, 'code') === code;
}

export function createNodeWorkspaceIdentityFilePort(
  createWorkspaceId: () => string = randomUUID,
): WorkspaceIdentityFilePort {
  return {
    readFileIfExists: async (path) => {
      try {
        return await readFile(path, 'utf8');
      } catch (error) {
        if (hasNodeErrorCode(error, 'ENOENT')) return null;
        throw error;
      }
    },
    ensureParentDirectory: async (path) => {
      await mkdir(dirname(path), { recursive: true });
    },
    writeFileExclusive: async (path, content) => {
      const temporaryPath = `${path}.tmp-${randomUUID()}`;
      try {
        await writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'wx' });
        try {
          await link(temporaryPath, path);
          return 'written';
        } catch (error) {
          if (hasNodeErrorCode(error, 'EEXIST')) return 'exists';
          throw error;
        }
      } finally {
        await rm(temporaryPath, { force: true });
      }
    },
    createWorkspaceId,
  };
}

export function ensureNodeWorkspaceIdentityDescriptor(
  workspaceRoot: string,
  createWorkspaceId?: () => string,
): Promise<WorkspaceIdentityDescriptor> {
  return ensureWorkspaceIdentityDescriptor(
    workspaceRoot,
    createNodeWorkspaceIdentityFilePort(createWorkspaceId),
  );
}

export interface NodeWorkspaceIdentityResolution {
  readonly kind: 'created' | 'moved' | 'registered' | 'restored' | 'seen';
  readonly identity: WorkspaceIdentityDescriptor;
  readonly locator: WorkspacePortableLocator;
  readonly workspace: WorkspaceRegistryRecord;
}

export async function resolveNodeWorkspaceIdentity(options: {
  readonly workspaceRoot: string;
  readonly homedir: string;
  readonly metadataStore: LocalMetadataStore;
  readonly createWorkspaceId?: () => string;
  readonly now?: () => string;
}): Promise<NodeWorkspaceIdentityResolution> {
  const descriptorPath = join(options.workspaceRoot, WORKSPACE_IDENTITY_RELATIVE_PATH);
  const filePort = createNodeWorkspaceIdentityFilePort();
  const locator = createNodeWorkspacePortableLocator(options.workspaceRoot, options.homedir);
  const existing = await filePort.readFileIfExists(descriptorPath);
  if (existing !== null) {
    const identity = parseWorkspaceIdentityJson(existing);
    const workspace = await options.metadataStore.repositories.workspaces.get(identity.workspaceId);
    if (workspace && sameLocator(workspace.currentLocator, locator)) {
      const matches =
        await options.metadataStore.repositories.workspaces.findByCurrentLocator(locator);
      if (matches.length !== 1 || matches[0]?.workspaceId !== identity.workspaceId) {
        throw new NekoStorageContractError({
          code: 'ambiguous-workspace-locator',
          message: `Workspace locator ${locator.value} is registered to multiple identities.`,
        });
      }
      const seenWorkspace = await options.metadataStore.repositories.workspaces.markSeen(
        identity.workspaceId,
        options.now ? options.now() : new Date().toISOString(),
      );
      return { kind: 'seen', identity, locator, workspace: seenWorkspace };
    }
    if (workspace) {
      const currentLocatorMatches =
        await options.metadataStore.repositories.workspaces.findByCurrentLocator(locator);
      if (currentLocatorMatches.length > 0) {
        throw new NekoStorageContractError({
          code: 'ambiguous-workspace-locator',
          message: `Workspace locator ${locator.value} is already registered to ${currentLocatorMatches.map((record) => record.workspaceId).join(', ')}.`,
        });
      }
      if (await isNodeWorkspaceLocatorLive(workspace.currentLocator, options.homedir)) {
        throw new NekoStorageContractError({
          code: 'duplicate-workspace-identity',
          message: `Workspace identity ${identity.workspaceId} remains live at ${workspace.currentLocator.value}; ${locator.value} is a copied checkout.`,
        });
      }
      const movedWorkspace = await options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'move-workspace-identity' },
        ({ repositories }) =>
          repositories.workspaces.rebind({
            workspaceId: identity.workspaceId,
            locator,
            reboundAt: options.now ? options.now() : new Date().toISOString(),
          }),
      );
      return { kind: 'moved', identity, locator, workspace: movedWorkspace };
    }
    const locatorMatches =
      await options.metadataStore.repositories.workspaces.findByCurrentLocator(locator);
    if (locatorMatches.length > 0) {
      throw new NekoStorageContractError({
        code: 'ambiguous-workspace-locator',
        message: `Workspace locator ${locator.value} is already registered to ${locatorMatches.map((record) => record.workspaceId).join(', ')}.`,
      });
    }
    const registeredWorkspace = await options.metadataStore.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'register-workspace-identity' },
      ({ repositories }) =>
        repositories.workspaces.bind({
          identity,
          locator,
          seenAt: options.now ? options.now() : new Date().toISOString(),
        }),
    );
    return { kind: 'registered', identity, locator, workspace: registeredWorkspace };
  }

  const matches = await options.metadataStore.repositories.workspaces.findByCurrentLocator(locator);
  if (matches.length > 1) {
    throw new NekoStorageContractError({
      code: 'ambiguous-workspace-locator',
      message: `Workspace locator ${locator.value} has ${matches.length} registered identities.`,
    });
  }
  if (matches.length === 0) {
    const identity = parseWorkspaceIdentityJson(
      serializeWorkspaceIdentityDescriptor({
        version: 1,
        workspaceId: options.createWorkspaceId ? options.createWorkspaceId() : randomUUID(),
      }),
    );
    await filePort.ensureParentDirectory(descriptorPath);
    const writeResult = await filePort.writeFileExclusive(
      descriptorPath,
      serializeWorkspaceIdentityDescriptor(identity),
    );
    if (writeResult === 'exists') {
      throw new NekoStorageContractError({
        code: 'duplicate-workspace-identity',
        message: `Workspace identity creation raced at ${locator.value}.`,
      });
    }
    try {
      const workspace = await options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'create-workspace-identity' },
        ({ repositories }) =>
          repositories.workspaces.bind({
            identity,
            locator,
            seenAt: options.now ? options.now() : new Date().toISOString(),
          }),
      );
      return { kind: 'created', identity, locator, workspace };
    } catch (error) {
      const current = await filePort.readFileIfExists(descriptorPath);
      if (
        current !== null &&
        parseWorkspaceIdentityJson(current).workspaceId === identity.workspaceId
      ) {
        await rm(descriptorPath);
      }
      throw error;
    }
  }
  const workspace = matches[0]!;
  const identity = parseWorkspaceIdentityJson(
    serializeWorkspaceIdentityDescriptor({ version: 1, workspaceId: workspace.workspaceId }),
  );
  await filePort.ensureParentDirectory(descriptorPath);
  const writeResult = await filePort.writeFileExclusive(
    descriptorPath,
    serializeWorkspaceIdentityDescriptor(identity),
  );
  if (writeResult === 'exists') {
    const winner = await filePort.readFileIfExists(descriptorPath);
    if (
      winner === null ||
      parseWorkspaceIdentityJson(winner).workspaceId !== identity.workspaceId
    ) {
      throw new NekoStorageContractError({
        code: 'duplicate-workspace-identity',
        message: `Workspace identity recovery raced at ${locator.value}.`,
      });
    }
  }
  const seenWorkspace = await options.metadataStore.repositories.workspaces.markSeen(
    identity.workspaceId,
    options.now ? options.now() : new Date().toISOString(),
  );
  return { kind: 'restored', identity, locator, workspace: seenWorkspace };
}

export function createNodeWorkspacePortableLocator(
  workspaceRoot: string,
  homedir: string,
): WorkspacePortableLocator {
  const normalizedHome = normalizePath(homedir);
  const normalizedWorkspaceRoot = normalizePath(workspaceRoot);
  const contracted = new PathResolver(new Map([['HOME', normalizedHome]])).contract(
    normalizedWorkspaceRoot,
  );
  return createWorkspacePortableLocator(
    contracted === normalizedWorkspaceRoot
      ? normalizePath(relative(normalizedHome, normalizedWorkspaceRoot))
      : contracted,
  );
}

function normalizePath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
}

function sameLocator(left: WorkspacePortableLocator, right: WorkspacePortableLocator): boolean {
  return left.kind === right.kind && left.value === right.value;
}

async function isNodeWorkspaceLocatorLive(
  locator: WorkspacePortableLocator,
  homedir: string,
): Promise<boolean> {
  const normalizedHome = normalizePath(homedir);
  const expanded =
    locator.kind === 'variable'
      ? new PathResolver(new Map([['HOME', normalizedHome]])).resolve(locator.value)
      : resolvePath(normalizedHome, locator.value);
  if (expanded.includes('${')) {
    throw new NekoStorageContractError({
      code: 'invalid-workspace-identity',
      message: `Workspace locator cannot be checked without its path variable: ${locator.value}`,
    });
  }
  try {
    await access(expanded);
    return true;
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return false;
    throw error;
  }
}
