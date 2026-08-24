import { mkdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';

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
  readonly providers: DesktopDshProviderRuntimeProjection;
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
}): Promise<{
  readonly prepared: PreparedDesktopDshRuntime;
  readonly runtime: DesktopDshAgentRuntime;
}> {
  const prepared = await prepareDesktopDshRuntime(options);
  const runtime = await startDesktopDshAgentRuntime({
    supervisor: prepared.supervisor,
    virtualCwd: prepared.workingDirectory,
    metadataStore: options.metadataStore,
    resolveSessionCwd: (context) =>
      context.kind === 'workspace' || context.kind === 'authoring'
        ? options.resolveWorkspaceSessionCwd(context)
        : Promise.resolve(prepared.workingDirectory),
    createHandlers: (input) =>
      options.createHandlers({
        ...input,
        personalSkillRoot: join(prepared.profile.dshHome, 'skills'),
      }),
  });
  return Object.freeze({ prepared, runtime });
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
