import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

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
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly onStderr?: (chunk: string) => void;
}): Promise<PreparedDesktopDshRuntime> {
  const resource = resolveDesktopDshRuntimeResource(options);
  const profile = await materializeDesktopDshProfile({
    userDataRoot: options.userDataRoot,
    runtime: resource,
  });
  const workingDirectory = join(profile.dshHome, 'workspace');
  await mkdir(workingDirectory, { recursive: true });
  const environment = Object.freeze({
    ...selectDshShellEnvironment(options.environment),
    ...profile.environment,
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
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly metadataStore: LocalMetadataStore;
  readonly createHandlers: (input: {
    readonly bindings: ConversationDshSessionBindingStore;
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
    createHandlers: options.createHandlers,
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
