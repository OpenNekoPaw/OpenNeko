import { randomUUID } from 'node:crypto';
import type { HostDiagnostic } from '@neko/host/ports';
import {
  DESKTOP_SHELL_CONTRACT_VERSION,
  DesktopShellContractError,
  type DesktopDomainCapabilityProjection,
  type DesktopProfileRequestResult,
  type DesktopProjectCatalogItem,
  type DesktopShellProjection,
  type DesktopShellProjectionEvent,
  type DesktopUnavailableProjectProfile,
} from '../shared/shell-contract';
import type {
  DesktopShellStateRepository,
  DesktopShellStoredState,
  DesktopStoredProject,
  DesktopStoredWindow,
} from './shell-state-repository';
import type {
  DesktopWorkspaceRegistry,
  DesktopWorkspaceResolution,
} from './desktop-workspace-registry';

const DOMAIN_CAPABILITIES: readonly DesktopDomainCapabilityProjection[] = [
  unavailableDomain('agent', 'P1.3'),
  unavailableDomain('media-library', 'P1.4'),
  unavailableDomain('canvas', 'P1.4'),
  unavailableDomain('cut', 'P1.5'),
  unavailableDomain('preview', 'P1.5'),
  unavailableDomain('generation', 'P1.6'),
  unavailableDomain('quality', 'P1.6'),
  unavailableDomain('character', 'P1.6'),
  unavailableDomain('world', 'P1.6'),
  unavailableDomain('tools', 'P1.6'),
];

export interface DesktopShellServiceOptions {
  readonly applicationInstanceId: string;
  readonly stateRepository: DesktopShellStateRepository;
  readonly workspaceRegistry: DesktopWorkspaceRegistry;
  readonly createIdentity?: () => string;
  readonly now?: () => string;
}

interface DesktopWindowRuntime {
  rendererEpoch: number;
  sequence: number;
  readonly subscribers: Set<(event: DesktopShellProjectionEvent) => void>;
}

export class DesktopShellService {
  private readonly activeWindows = new Map<string, DesktopWindowRuntime>();
  private operationTail: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(private readonly options: DesktopShellServiceOptions) {
    requireIdentity(options.applicationInstanceId, 'Desktop application instance identity');
  }

  async claimWindowId(): Promise<string> {
    return this.enqueue(async () => {
      this.requireActive();
      const state = await this.options.stateRepository.read();
      const reusablePrimary =
        state.primaryWindowId !== null && !this.activeWindows.has(state.primaryWindowId)
          ? state.primaryWindowId
          : null;
      const windowId = reusablePrimary ?? this.createIdentity();
      if (!state.windows.some((window) => window.windowId === windowId)) {
        const next = await this.options.stateRepository.commit(state.storageRevision, {
          ...state,
          storageRevision: state.storageRevision + 1,
          primaryWindowId: state.primaryWindowId ?? windowId,
          windows: [
            ...state.windows,
            {
              windowId,
              revision: 0,
              activeTarget: { kind: 'home' },
              tabs: [],
            },
          ],
        });
        this.installWindowRuntime(windowId);
        await this.emitAll(next);
        return windowId;
      }
      this.installWindowRuntime(windowId);
      return windowId;
    });
  }

  releaseWindow(windowId: string): void {
    this.activeWindows.delete(windowId);
  }

  setRendererEpoch(windowId: string, rendererEpoch: number): void {
    const runtime = this.requireWindowRuntime(windowId);
    if (!Number.isSafeInteger(rendererEpoch) || rendererEpoch <= runtime.rendererEpoch) {
      throw new Error(
        `Desktop renderer epoch must advance for Window '${windowId}'; received ${rendererEpoch}.`,
      );
    }
    runtime.rendererEpoch = rendererEpoch;
    runtime.sequence = 0;
  }

  subscribe(
    windowId: string,
    listener: (event: DesktopShellProjectionEvent) => void,
  ): () => void {
    const runtime = this.requireWindowRuntime(windowId);
    runtime.subscribers.add(listener);
    return () => {
      runtime.subscribers.delete(listener);
    };
  }

  async getProjection(windowId: string): Promise<DesktopShellProjection> {
    this.requireActive();
    const runtime = this.requireWindowRuntime(windowId);
    return projectShellState(
      await this.options.stateRepository.read(),
      this.options.applicationInstanceId,
      windowId,
      runtime.rendererEpoch,
    );
  }

  async assertWindowMutationContext(
    windowId: string,
    expectedEndpointEpoch: string,
    expectedWindowRevision: number,
  ): Promise<void> {
    return this.enqueue(async () => {
      this.requireActive();
      this.assertMutationContext(windowId, expectedEndpointEpoch);
      const state = await this.options.stateRepository.read();
      const window = requireStoredWindow(state, windowId);
      if (window.revision !== expectedWindowRevision) {
        throw staleWindowRevision(windowId, expectedWindowRevision, window.revision);
      }
    });
  }

  async openContent(
    windowId: string,
    workspacePath: string,
    expectedEndpointEpoch: string,
    expectedWindowRevision: number,
  ): Promise<DesktopShellProjection> {
    return this.enqueue(async () => {
      this.requireActive();
      this.assertMutationContext(windowId, expectedEndpointEpoch);
      const workspace = await this.options.workspaceRegistry.resolve(workspacePath);
      const state = await this.options.stateRepository.read();
      const currentWindow = requireStoredWindow(state, windowId);
      if (currentWindow.revision !== expectedWindowRevision) {
        throw staleWindowRevision(windowId, expectedWindowRevision, currentWindow.revision);
      }
      this.assertMutationContext(windowId, expectedEndpointEpoch);
      const next = openContentProject(
        state,
        windowId,
        workspace,
        this.now(),
        this.createIdentity,
      );
      const committed =
        next === state
          ? state
          : await this.options.stateRepository.commit(state.storageRevision, next);
      await this.emitAll(committed);
      return this.projectWindow(committed, windowId);
    });
  }

  async requestUnavailableProfile(
    windowId: string,
    requestId: string,
    profile: DesktopUnavailableProjectProfile,
  ): Promise<DesktopProfileRequestResult> {
    const diagnostic: HostDiagnostic & {
      readonly code: 'desktop-project-profile-unavailable';
      readonly severity: 'error';
    } = {
      code: 'desktop-project-profile-unavailable',
      severity: 'error',
      message:
        profile === 'character'
          ? 'Character projects require the P1.6 Character aggregate and are not available yet.'
          : 'World projects require a canonical World aggregate and are not available yet.',
      metadata: { profile, ownerSlice: 'P1.6' },
    };
    return {
      schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
      requestId,
      status: 'unavailable',
      diagnostic,
      projection: await this.getProjection(windowId),
    };
  }

  async activateTab(
    windowId: string,
    tabId: string,
    expectedEndpointEpoch: string,
    expectedWindowRevision: number,
  ): Promise<DesktopShellProjection> {
    return this.mutateWindow(
      windowId,
      expectedEndpointEpoch,
      expectedWindowRevision,
      (window) => {
        if (!window.tabs.some((tab) => tab.tabId === tabId)) {
          throw new Error(`Unknown Desktop Project Tab '${tabId}' for Window '${windowId}'.`);
        }
        if (window.activeTarget.kind === 'project' && window.activeTarget.tabId === tabId) {
          return window;
        }
        return {
          ...window,
          revision: window.revision + 1,
          activeTarget: { kind: 'project', tabId },
        };
      },
    );
  }

  async activateHome(
    windowId: string,
    expectedEndpointEpoch: string,
    expectedWindowRevision: number,
  ): Promise<DesktopShellProjection> {
    return this.mutateWindow(
      windowId,
      expectedEndpointEpoch,
      expectedWindowRevision,
      (window) => {
        if (window.activeTarget.kind === 'home') return window;
        return {
          ...window,
          revision: window.revision + 1,
          activeTarget: { kind: 'home' },
        };
      },
    );
  }

  async closeTab(
    windowId: string,
    tabId: string,
    expectedEndpointEpoch: string,
    expectedWindowRevision: number,
  ): Promise<DesktopShellProjection> {
    return this.mutateWindow(
      windowId,
      expectedEndpointEpoch,
      expectedWindowRevision,
      (window) => {
        const tabIndex = window.tabs.findIndex((tab) => tab.tabId === tabId);
        if (tabIndex < 0) {
          throw new Error(`Unknown Desktop Project Tab '${tabId}' for Window '${windowId}'.`);
        }
        const tabs = window.tabs.filter((tab) => tab.tabId !== tabId);
        const wasActive =
          window.activeTarget.kind === 'project' && window.activeTarget.tabId === tabId;
        const nextActiveTab = tabs[Math.min(tabIndex, tabs.length - 1)];
        return {
          ...window,
          revision: window.revision + 1,
          tabs,
          activeTarget: wasActive
            ? nextActiveTab
              ? { kind: 'project', tabId: nextActiveTab.tabId }
              : { kind: 'home' }
            : window.activeTarget,
        };
      },
    );
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.operationTail;
    this.activeWindows.clear();
    await this.options.workspaceRegistry.dispose();
  }

  private async mutateWindow(
    windowId: string,
    expectedEndpointEpoch: string,
    expectedWindowRevision: number,
    mutate: (window: DesktopStoredWindow) => DesktopStoredWindow,
  ): Promise<DesktopShellProjection> {
    return this.enqueue(async () => {
      this.requireActive();
      this.assertMutationContext(windowId, expectedEndpointEpoch);
      const state = await this.options.stateRepository.read();
      const window = requireStoredWindow(state, windowId);
      if (window.revision !== expectedWindowRevision) {
        throw staleWindowRevision(windowId, expectedWindowRevision, window.revision);
      }
      this.assertMutationContext(windowId, expectedEndpointEpoch);
      const updatedWindow = mutate(window);
      if (updatedWindow === window) return this.projectWindow(state, windowId);
      const committed = await this.options.stateRepository.commit(state.storageRevision, {
        ...state,
        storageRevision: state.storageRevision + 1,
        windows: state.windows.map((candidate) =>
          candidate.windowId === windowId ? updatedWindow : candidate,
        ),
      });
      await this.emitAll(committed);
      return this.projectWindow(committed, windowId);
    });
  }

  private async emitAll(state: DesktopShellStoredState): Promise<void> {
    for (const [windowId, runtime] of this.activeWindows) {
      const projection = projectShellState(
        state,
        this.options.applicationInstanceId,
        windowId,
        runtime.rendererEpoch,
      );
      runtime.sequence += 1;
      const event: DesktopShellProjectionEvent = {
        schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
        applicationInstanceId: this.options.applicationInstanceId,
        windowId,
        rendererEpoch: runtime.rendererEpoch,
        sequence: runtime.sequence,
        projection,
      };
      for (const subscriber of runtime.subscribers) subscriber(event);
    }
  }

  private projectWindow(
    state: DesktopShellStoredState,
    windowId: string,
  ): DesktopShellProjection {
    const runtime = this.requireWindowRuntime(windowId);
    return projectShellState(
      state,
      this.options.applicationInstanceId,
      windowId,
      runtime.rendererEpoch,
    );
  }

  private installWindowRuntime(windowId: string): void {
    if (this.activeWindows.has(windowId)) {
      throw new Error(`Desktop Window '${windowId}' is already active.`);
    }
    this.activeWindows.set(windowId, {
      rendererEpoch: 0,
      sequence: 0,
      subscribers: new Set(),
    });
  }

  private requireWindowRuntime(windowId: string): DesktopWindowRuntime {
    const runtime = this.activeWindows.get(windowId);
    if (!runtime) throw new Error(`Desktop Window '${windowId}' is not attached to Shell state.`);
    return runtime;
  }

  private assertMutationContext(windowId: string, expectedEndpointEpoch: string): void {
    const runtime = this.requireWindowRuntime(windowId);
    const currentEndpointEpoch = `${this.options.applicationInstanceId}:${windowId}:${runtime.rendererEpoch}`;
    if (expectedEndpointEpoch !== currentEndpointEpoch) {
      throw new DesktopShellContractError(
        'desktop-shell-stale-revision',
        `Desktop endpoint '${expectedEndpointEpoch}' is stale; current endpoint is '${currentEndpointEpoch}'.`,
      );
    }
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Desktop Shell service is disposed.');
  }

  private createIdentity = (): string => {
    return this.options.createIdentity ? this.options.createIdentity() : randomUUID();
  };

  private now(): string {
    return this.options.now ? this.options.now() : new Date().toISOString();
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation, operation);
    this.operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

function projectShellState(
  state: DesktopShellStoredState,
  applicationInstanceId: string,
  windowId: string,
  rendererEpoch: number,
): DesktopShellProjection {
  const window = requireStoredWindow(state, windowId);
  const projects: readonly DesktopProjectCatalogItem[] = state.projects.map((project) => ({
    projectId: project.projectId,
    workspaceId: project.workspaceId,
    profile: 'content',
    displayName: project.displayName,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }));
  return {
    schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
    applicationInstanceId,
    endpointEpoch: `${applicationInstanceId}:${windowId}:${rendererEpoch}`,
    projectionRevision: state.storageRevision,
    catalog: {
      revision: state.catalogRevision,
      projects,
    },
    window: {
      windowId: window.windowId,
      revision: window.revision,
      activeTarget: window.activeTarget,
      tabs: window.tabs,
    },
    attention: {
      needsInput: 0,
      needsReview: 0,
      running: 0,
    },
    domains: DOMAIN_CAPABILITIES,
  };
}

function openContentProject(
  state: DesktopShellStoredState,
  windowId: string,
  workspace: DesktopWorkspaceResolution,
  now: string,
  createIdentity: () => string,
): DesktopShellStoredState {
  const window = requireStoredWindow(state, windowId);
  const existingProject = state.projects.find(
    (project) => project.workspaceId === workspace.workspaceId,
  );
  const project = existingProject ?? createStoredProject(workspace, now);
  const projectChanged =
    existingProject !== undefined &&
    (existingProject.workspacePath !== workspace.workspacePath ||
      existingProject.displayName !== workspace.displayName ||
      existingProject.workspaceLocator.kind !== workspace.locator.kind ||
      existingProject.workspaceLocator.value !== workspace.locator.value);
  const projects = existingProject
    ? state.projects.map((candidate) =>
        candidate.projectId === existingProject.projectId && projectChanged
          ? {
              ...candidate,
              displayName: workspace.displayName,
              workspacePath: workspace.workspacePath,
              workspaceLocator: workspace.locator,
              updatedAt: now,
            }
          : candidate,
      )
    : [...state.projects, project];
  const existingTab = window.tabs.find((tab) => tab.projectId === project.projectId);
  const tab =
    existingTab ??
    {
      tabId: `tab:${windowId}:${project.projectId}`,
      projectId: project.projectId,
      viewId: `view:${createIdentity()}`,
      viewEpoch: 1,
    };
  const activeAlready =
    window.activeTarget.kind === 'project' && window.activeTarget.tabId === tab.tabId;
  if (existingProject && !projectChanged && existingTab && activeAlready) return state;
  const updatedWindow: DesktopStoredWindow = {
    ...window,
    revision: window.revision + 1,
    tabs: existingTab ? window.tabs : [...window.tabs, tab],
    activeTarget: { kind: 'project', tabId: tab.tabId },
  };
  return {
    ...state,
    storageRevision: state.storageRevision + 1,
    catalogRevision:
      existingProject && !projectChanged ? state.catalogRevision : state.catalogRevision + 1,
    projects,
    windows: state.windows.map((candidate) =>
      candidate.windowId === windowId ? updatedWindow : candidate,
    ),
  };
}

function createStoredProject(
  workspace: DesktopWorkspaceResolution,
  now: string,
): DesktopStoredProject {
  return {
    projectId: `content:${workspace.workspaceId}`,
    workspaceId: workspace.workspaceId,
    profile: 'content',
    displayName: workspace.displayName,
    workspacePath: workspace.workspacePath,
    workspaceLocator: workspace.locator,
    createdAt: now,
    updatedAt: now,
  };
}

function requireStoredWindow(
  state: DesktopShellStoredState,
  windowId: string,
): DesktopStoredWindow {
  const window = state.windows.find((candidate) => candidate.windowId === windowId);
  if (!window) throw new Error(`Desktop Shell state has no Window '${windowId}'.`);
  return window;
}

function unavailableDomain(
  surface: DesktopDomainCapabilityProjection['surface'],
  ownerSlice: DesktopDomainCapabilityProjection['ownerSlice'],
): DesktopDomainCapabilityProjection {
  return {
    surface,
    status: 'unavailable',
    ownerSlice,
    diagnosticCode: 'desktop-domain-surface-unavailable',
  };
}

function requireIdentity(value: string, label: string): void {
  if (value.trim().length === 0) throw new Error(`${label} is required.`);
}

function staleWindowRevision(
  windowId: string,
  expectedRevision: number,
  currentRevision: number,
): DesktopShellContractError {
  return new DesktopShellContractError(
    'desktop-shell-stale-revision',
    `Desktop Window '${windowId}' revision ${expectedRevision} is stale; current revision is ${currentRevision}.`,
  );
}
