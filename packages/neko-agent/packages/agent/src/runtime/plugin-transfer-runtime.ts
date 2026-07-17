import {
  buildPluginSlashCommandCommand,
  buildPluginSlashCommandInvocation,
  buildPluginsAvailableMessage,
  NEKO_PLUGIN_EXTENSION_IDS,
  type InvokePluginSlashCommandWebviewMessage,
  type NekoPluginKey,
  type PluginSlashCommandDef,
  type PluginSlashCommandInvocation,
  type PluginTransferPayload,
  type PluginTransferAssetRef,
  type PluginsAvailableMessage,
  type PluginsAvailable,
  type ProjectPluginsAvailableInput,
  type RegisteredPluginSlashCommand,
} from '@neko-agent/types';

type RuntimePluginTransferBuildPayload = Exclude<PluginTransferPayload, { kind: 'assetBatch' }>;

export interface BuildPluginTransferPlanInput {
  readonly target: string;
  readonly assetPath?: string;
  readonly mediaType?: string;
  readonly payload?: RuntimePluginTransferBuildPayload;
}

export interface ExpandPluginTransferInputsInput {
  readonly target: string;
  readonly assetPath?: string;
  readonly mediaType?: string;
  readonly payload?: PluginTransferPayload;
}

export interface RuntimePluginSlashCommandDispatch {
  readonly command: string;
  readonly invocation: PluginSlashCommandInvocation;
}

interface RuntimePluginSlashCommandRegistryEntry {
  readonly extensionId: string;
  readonly commands: readonly PluginSlashCommandDef[];
}

export interface RuntimePluginSlashCommandRegistry {
  register(extensionId: string, commands: readonly PluginSlashCommandDef[]): void;
  unregister(extensionId: string): boolean;
  getAll(): RegisteredPluginSlashCommand[];
  clear(): void;
}

export function createRuntimePluginSlashCommandRegistry(): RuntimePluginSlashCommandRegistry {
  return new DefaultRuntimePluginSlashCommandRegistry();
}

export function expandRuntimePluginTransferInputs(
  input: ExpandPluginTransferInputsInput,
): readonly BuildPluginTransferPlanInput[] {
  if (input.payload?.kind !== 'assetBatch') {
    return [input as BuildPluginTransferPlanInput];
  }
  const batch = input.payload;
  return batch.assets.map((asset) => ({
    target: input.target,
    payload: {
      kind: 'singleAsset',
      asset,
      ...resolveBatchTransferDefaults(asset, batch),
    },
  }));
}

function resolveBatchTransferDefaults(
  asset: PluginTransferAssetRef,
  batch: Extract<PluginTransferPayload, { kind: 'assetBatch' }>,
): Pick<Extract<PluginTransferPayload, { kind: 'singleAsset' }>, 'target' | 'provenance'> {
  return {
    ...(!asset.target && batch.target ? { target: batch.target } : {}),
    ...(!asset.provenance && batch.provenance ? { provenance: batch.provenance } : {}),
  };
}

export function buildRuntimePluginSlashCommandDispatch(
  message: InvokePluginSlashCommandWebviewMessage,
): RuntimePluginSlashCommandDispatch {
  return {
    command: buildPluginSlashCommandCommand(message),
    invocation: buildPluginSlashCommandInvocation(message),
  };
}

export function buildRuntimePluginsAvailableMessage(
  input: ProjectPluginsAvailableInput,
): PluginsAvailableMessage {
  return buildPluginsAvailableMessage(projectRuntimeNekoPluginsAvailable(input));
}

export function projectRuntimeNekoPluginsAvailable(
  input: ProjectPluginsAvailableInput,
): PluginsAvailable {
  return Object.fromEntries(
    Object.entries(NEKO_PLUGIN_EXTENSION_IDS).map(([plugin, extensionId]) => [
      plugin,
      input.hasExtension(extensionId),
    ]),
  ) as Record<NekoPluginKey, boolean>;
}

class DefaultRuntimePluginSlashCommandRegistry implements RuntimePluginSlashCommandRegistry {
  private readonly entries = new Map<string, RuntimePluginSlashCommandRegistryEntry>();

  register(extensionId: string, commands: readonly PluginSlashCommandDef[]): void {
    this.entries.set(extensionId, {
      extensionId,
      commands: commands.map((command) => ({ ...command })),
    });
  }

  unregister(extensionId: string): boolean {
    return this.entries.delete(extensionId);
  }

  getAll(): RegisteredPluginSlashCommand[] {
    return Array.from(this.entries.values())
      .sort((a, b) => a.extensionId.localeCompare(b.extensionId))
      .flatMap((entry) =>
        entry.commands.map((command) => ({
          ...command,
          extensionId: entry.extensionId,
        })),
      );
  }

  clear(): void {
    this.entries.clear();
  }
}

export type { PluginSlashCommandDef, RegisteredPluginSlashCommand };
