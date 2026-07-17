import { randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  createWorkspacePortableLocator,
  NekoStorageContractError,
  parseWorkspaceIdentityDescriptor,
  parseWorkspaceIdentityJson,
  serializeWorkspaceIdentityDescriptor,
  WORKSPACE_IDENTITY_RELATIVE_PATH,
  type WorkspaceIdentityAction,
  type WorkspaceIdentityDescriptor,
  type WorkspacePortableLocator,
} from '../types/storage';
import type { LocalMetadataStore } from './contracts';
import type { WorkspaceRegistryRecord } from './repositories';

export interface NodeWorkspaceIdentityRecoveryReport {
  readonly action: WorkspaceIdentityAction['kind'];
  readonly previousWorkspaceId: string;
  readonly workspace: WorkspaceRegistryRecord;
  readonly descriptorBackupPath: string | null;
  readonly orphanedWorkspaceIds: readonly string[];
}

export async function executeNodeWorkspaceIdentityRecoveryAction(options: {
  readonly workspaceRoot: string;
  readonly metadataStore: LocalMetadataStore;
  readonly action: WorkspaceIdentityAction;
  readonly occurredAt: string;
}): Promise<NodeWorkspaceIdentityRecoveryReport> {
  validateTimestamp(options.occurredAt);
  const descriptorPath = join(options.workspaceRoot, WORKSPACE_IDENTITY_RELATIVE_PATH);
  const currentDescriptor = parseWorkspaceIdentityJson(await readFile(descriptorPath, 'utf8'));
  const locator = validatePortableLocator(options.action.locator);

  if (options.action.kind === 'rebind') {
    assertDescriptorOwner(currentDescriptor, options.action.workspaceId);
    const workspace = await options.metadataStore.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'recover-workspace-rebind' },
      ({ repositories }) =>
        repositories.workspaces.rebind({
          workspaceId: options.action.workspaceId,
          locator,
          reboundAt: options.occurredAt,
        }),
    );
    return {
      action: 'rebind',
      previousWorkspaceId: currentDescriptor.workspaceId,
      workspace,
      descriptorBackupPath: null,
      orphanedWorkspaceIds: [],
    };
  }

  if (options.action.kind === 'select-current') {
    assertDescriptorOwner(currentDescriptor, options.action.workspaceId);
    const conflictingWorkspaceIds = validateConflictSet(
      options.action.workspaceId,
      options.action.conflictingWorkspaceIds,
    );
    const workspace = await options.metadataStore.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'recover-workspace-select-current' },
      async ({ repositories }) => {
        const matches = await repositories.workspaces.findByCurrentLocator(locator);
        assertExactCurrentLocatorConflict(
          matches,
          options.action.workspaceId,
          conflictingWorkspaceIds,
          locator,
        );
        for (const workspaceId of conflictingWorkspaceIds) {
          await repositories.workspaces.markOrphaned(workspaceId, options.occurredAt);
        }
        return repositories.workspaces.markSeen(options.action.workspaceId, options.occurredAt);
      },
    );
    return {
      action: 'select-current',
      previousWorkspaceId: currentDescriptor.workspaceId,
      workspace,
      descriptorBackupPath: null,
      orphanedWorkspaceIds: conflictingWorkspaceIds,
    };
  }

  assertDescriptorOwner(currentDescriptor, options.action.sourceWorkspaceId);
  const nextDescriptor = parseWorkspaceIdentityDescriptor({
    version: 1,
    workspaceId: options.action.newWorkspaceId,
  });
  if (nextDescriptor.workspaceId === currentDescriptor.workspaceId) {
    throw new NekoStorageContractError({
      code: 'duplicate-workspace-identity',
      message: 'Workspace clone action requires a new workspaceId.',
    });
  }
  if (await options.metadataStore.repositories.workspaces.get(nextDescriptor.workspaceId)) {
    throw new NekoStorageContractError({
      code: 'duplicate-workspace-identity',
      message: `Workspace clone target already exists: ${nextDescriptor.workspaceId}`,
    });
  }

  const backupPath = `${descriptorPath}.backup-${timestampSuffix(options.occurredAt)}`;
  await copyFile(descriptorPath, backupPath, fsConstants.COPYFILE_EXCL);
  await replaceDescriptorAtomically(descriptorPath, nextDescriptor);
  try {
    const workspace = await options.metadataStore.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'recover-workspace-clone' },
      ({ repositories }) =>
        repositories.workspaces.bind({
          identity: nextDescriptor,
          locator,
          seenAt: options.occurredAt,
        }),
    );
    return {
      action: 'clone',
      previousWorkspaceId: currentDescriptor.workspaceId,
      workspace,
      descriptorBackupPath: backupPath,
      orphanedWorkspaceIds: [],
    };
  } catch (error) {
    try {
      await replaceDescriptorAtomically(descriptorPath, currentDescriptor);
    } catch (restoreError) {
      throw new AggregateError(
        [error, restoreError],
        `Workspace clone registration failed and descriptor restoration failed; backup remains at ${backupPath}.`,
      );
    }
    throw error;
  }
}

function validateConflictSet(
  workspaceId: string,
  conflictingWorkspaceIds: readonly string[],
): readonly string[] {
  const unique = [...new Set(conflictingWorkspaceIds)].sort();
  if (
    unique.length === 0 ||
    unique.length !== conflictingWorkspaceIds.length ||
    unique.includes(workspaceId)
  ) {
    throw new NekoStorageContractError({
      code: 'ambiguous-workspace-locator',
      message: 'Workspace identity selection requires a non-empty, unique conflict set.',
    });
  }
  return unique;
}

function assertExactCurrentLocatorConflict(
  matches: readonly WorkspaceRegistryRecord[],
  selectedWorkspaceId: string,
  conflictingWorkspaceIds: readonly string[],
  locator: WorkspacePortableLocator,
): void {
  const actualWorkspaceIds = matches.map((workspace) => workspace.workspaceId).sort();
  const expectedWorkspaceIds = [selectedWorkspaceId, ...conflictingWorkspaceIds].sort();
  if (
    actualWorkspaceIds.length !== expectedWorkspaceIds.length ||
    actualWorkspaceIds.some((workspaceId, index) => workspaceId !== expectedWorkspaceIds[index])
  ) {
    throw new NekoStorageContractError({
      code: 'ambiguous-workspace-locator',
      message: `Workspace locator ${locator.value} conflict set changed before recovery.`,
    });
  }
}

function assertDescriptorOwner(
  descriptor: WorkspaceIdentityDescriptor,
  expectedWorkspaceId: string,
): void {
  if (descriptor.workspaceId !== expectedWorkspaceId) {
    throw new NekoStorageContractError({
      code: 'invalid-workspace-identity',
      message: `Workspace identity action expected ${expectedWorkspaceId}, received ${descriptor.workspaceId}.`,
    });
  }
}

function validatePortableLocator(locator: WorkspacePortableLocator): WorkspacePortableLocator {
  const validated = createWorkspacePortableLocator(locator.value);
  if (validated.kind !== locator.kind) {
    throw new NekoStorageContractError({
      code: 'invalid-workspace-identity',
      message: `Workspace locator kind ${locator.kind} does not match ${validated.kind}.`,
    });
  }
  return validated;
}

async function replaceDescriptorAtomically(
  descriptorPath: string,
  descriptor: WorkspaceIdentityDescriptor,
): Promise<void> {
  await mkdir(dirname(descriptorPath), { recursive: true });
  const temporaryPath = `${descriptorPath}.tmp-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, serializeWorkspaceIdentityDescriptor(descriptor), {
      encoding: 'utf8',
      flag: 'wx',
    });
    await rename(temporaryPath, descriptorPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function validateTimestamp(value: string): void {
  if (!value.trim() || Number.isNaN(Date.parse(value))) {
    throw new Error('Workspace identity recovery occurredAt must be an ISO-compatible timestamp.');
  }
}

function timestampSuffix(value: string): string {
  return value.replace(/[^0-9A-Za-z-]/gu, '-');
}
