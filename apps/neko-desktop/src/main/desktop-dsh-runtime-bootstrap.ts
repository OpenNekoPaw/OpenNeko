import { mkdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import type { AgentConversationContext } from '@neko/agent-contracts';
import type { ConversationDshSessionBindingStore } from '@neko/agent-runtime/application';
import type { LocalMetadataStore } from '@neko/local-metadata';

import {
  startDesktopDshAgentRuntime,
  type DesktopDshAgentHandlerAssembly,
  type DesktopDshAgentRuntime,
} from './desktop-dsh-agent-runtime';
import {
  materializeDesktopDshProfile,
  type DesktopDshProfileMaterialization,
} from './desktop-dsh-profile-materializer';
import {
  resolveDesktopDshRuntimeResource,
  type DesktopDshRuntimeResource,
} from './desktop-dsh-runtime-resource';
import { DesktopDshSubprocessSupervisor } from './desktop-dsh-subprocess-supervisor';
import type { DesktopDshProviderRuntimeProjection } from './desktop-dsh-provider-runtime';
import type { DesktopDshExecutionCatalog } from './desktop-dsh-provider-runtime';

const DSH_SHELL_ENVIRONMENT_KEYS = Object.freeze(['PATH', 'TMPDIR', 'LANG', 'LC_ALL']);

export interface PreparedDesktopDshRuntime {
  readonly resource: DesktopDshRuntimeResource;
  readonly profile: DesktopDshProfileMaterialization;
  readonly workingDirectory: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly supervisor: DesktopDshSubprocessSupervisor;
}

export async function prepareDesktopDshRuntime(options: {
  readonly isPackaged: boolean;
  readonly resourcesPath: string;
  readonly userDataRoot: string;
  readonly builtinSkillRoot: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly providers: DesktopDshProviderRuntimeProjection;
  readonly onStderr?: (chunk: string) => void;
}): Promise<PreparedDesktopDshRuntime> {
  const resource = resolveDesktopDshRuntimeResource(options);
  const profile = await materializeDesktopDshProfile({
    userDataRoot: options.userDataRoot,
    runtime: resource,
    profilePatchEntries: options.providers.profilePatchEntries,
    includeExperimentalCreativeCapabilities: !options.isPackaged,
  });
  const workingDirectory = join(profile.dshHome, 'workspace');
  await mkdir(workingDirectory, { recursive: true });
  const builtinSkillRoot = await realpath(options.builtinSkillRoot);
  const environment = Object.freeze({
    ...selectDshShellEnvironment(options.environment),
    ...profile.environment,
    DSH_BUNDLED_SKILL_DIR: builtinSkillRoot,
    ...options.providers.credentialEnvironment,
  });
  return Object.freeze({
    resource,
    profile,
    workingDirectory,
    environment,
    supervisor: new DesktopDshSubprocessSupervisor({
      executable: resource.executable,
      args: resource.args,
      cwd: workingDirectory,
      environment,
      ...(options.onStderr === undefined ? {} : { onStderr: options.onStderr }),
    }),
  });
}

export async function startDesktopDshProductRuntime(options: {
  readonly isPackaged: boolean;
  readonly resourcesPath: string;
  readonly userDataRoot: string;
  readonly builtinSkillRoot: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly providers: () => Promise<DesktopDshProviderRuntimeProjection>;
  readonly metadataStore: LocalMetadataStore;
  readonly resolveWorkspaceSessionCwd: (
    context: Extract<AgentConversationContext, { readonly kind: 'workspace' | 'authoring' }>,
  ) => Promise<string>;
  readonly createHandlers: (input: {
    readonly bindings: ConversationDshSessionBindingStore;
    readonly skillAuthoringBridge: Pick<
      DesktopDshAgentRuntime['client'],
      'validateStagedSkill' | 'observeSkill'
    >;
    readonly personalSkillRoot: string;
  }) => DesktopDshAgentHandlerAssembly;
  readonly onStderr?: (chunk: string) => void;
  readonly onProviderProjection?: (projection: DesktopDshProviderRuntimeProjection) => void;
}): Promise<{
  readonly prepared: PreparedDesktopDshRuntime;
  readonly runtime: DesktopDshAgentRuntime;
  readonly executionCatalog: DesktopDshExecutionCatalog;
  refreshProviders(): Promise<'unchanged' | 'pending'>;
}> {
  const prepareCandidate = async (): Promise<{
    readonly prepared: PreparedDesktopDshRuntime;
    readonly providers: DesktopDshProviderRuntimeProjection;
  }> => {
    const providers = await options.providers();
    options.onProviderProjection?.(providers);
    return {
      prepared: await prepareDesktopDshRuntime({ ...options, providers }),
      providers,
    };
  };
  const initial = await prepareCandidate();
  type RuntimeCandidate = {
    readonly prepared: PreparedDesktopDshRuntime;
    readonly providers: DesktopDshProviderRuntimeProjection;
  };
  let queuedCandidate: RuntimeCandidate | undefined = initial;
  let connectingCandidate: RuntimeCandidate | undefined = queuedCandidate;
  let activeProviders: DesktopDshProviderRuntimeProjection | undefined;
  const executionCatalog: DesktopDshExecutionCatalog = Object.freeze({
    resolve(providerId: string, productModelId: string) {
      return activeProviders?.executionCatalog.resolve(providerId, productModelId);
    },
  });
  const runtime = await startDesktopDshAgentRuntime({
    supervisor: {
      async start() {
        const candidate = queuedCandidate ?? (await prepareCandidate());
        queuedCandidate = undefined;
        connectingCandidate = candidate;
        return candidate.prepared.supervisor.start();
      },
    },
    onInstanceConnected() {
      const candidate = connectingCandidate;
      if (candidate === undefined) {
        throw new Error('Desktop DSH runtime connected without a prepared Provider candidate.');
      }
      activeProviders = candidate.providers;
      connectingCandidate = undefined;
    },
    onInstanceUnavailable() {
      activeProviders = undefined;
      connectingCandidate = undefined;
    },
    virtualCwd: initial.prepared.workingDirectory,
    metadataStore: options.metadataStore,
    resolveSessionCwd: (context) =>
      context.kind === 'workspace' || context.kind === 'authoring'
        ? options.resolveWorkspaceSessionCwd(context)
        : Promise.resolve(initial.prepared.workingDirectory),
    createHandlers: (input) =>
      options.createHandlers({
        ...input,
        personalSkillRoot: join(initial.prepared.profile.dshHome, 'skills'),
      }),
  });
  return Object.freeze({
    prepared: initial.prepared,
    runtime,
    executionCatalog,
    async refreshProviders() {
      const next = await options.providers();
      const unchanged =
        activeProviders !== undefined &&
        isDeepStrictEqual(next.profilePatchEntries, activeProviders.profilePatchEntries) &&
        isDeepStrictEqual(next.credentialEnvironment, activeProviders.credentialEnvironment) &&
        isDeepStrictEqual(next.modelBindings, activeProviders.modelBindings);
      runtime.setSessionConfigurationPending(!unchanged);
      return unchanged ? ('unchanged' as const) : ('pending' as const);
    },
  });
}

function selectDshShellEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string>> {
  const selected: Record<string, string> = {};
  for (const key of DSH_SHELL_ENVIRONMENT_KEYS) {
    const value = environment[key];
    if (value !== undefined) selected[key] = value;
  }
  return selected;
}
