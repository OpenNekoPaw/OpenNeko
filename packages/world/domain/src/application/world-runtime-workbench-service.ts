import {
  parseWorldRuntimeBinding,
  parseWorldRuntimeLaunch,
  parseWorldRuntimeProjection,
  type WorldActionIntent,
  type WorldRuntimeBinding,
  type WorldRuntimeLaunch,
  type WorldRuntimeProjection,
} from '@neko/world-domain/contracts';

import type { WorldRuntimeAggregate, WorldRuntimeRepository } from './world-runtime-service';
import { WorldRuntimeService } from './world-runtime-service';

const TIMELINE_LIMIT = 100;

export class WorldRuntimeWorkbenchError extends Error {
  constructor(
    readonly code:
      | 'world-runtime-publication-unavailable'
      | 'world-runtime-project-mismatch'
      | 'world-runtime-binding-mismatch',
    message: string,
  ) {
    super(message);
    this.name = 'WorldRuntimeWorkbenchError';
  }
}

export class WorldRuntimeWorkbenchService {
  private readonly availableActions: readonly string[];

  constructor(
    private readonly options: {
      readonly runtime: WorldRuntimeService;
      readonly repository: WorldRuntimeRepository;
      readonly availableActions: readonly string[];
    },
  ) {
    if (new Set(options.availableActions).size !== options.availableActions.length) {
      throw new Error('World Runtime Workbench actions require unique exact identities.');
    }
    this.availableActions = Object.freeze([...options.availableActions].sort());
  }

  async launch(input: WorldRuntimeLaunch, signal?: AbortSignal): Promise<WorldRuntimeProjection> {
    const launch = parseWorldRuntimeLaunch(input);
    const publication = await this.options.repository.readPublication(
      launch.worldVersionId,
      signal,
    );
    if (!publication) {
      throw new WorldRuntimeWorkbenchError(
        'world-runtime-publication-unavailable',
        `WorldVersion '${launch.worldVersionId}' is unavailable.`,
      );
    }
    if (publication.worldProjectId !== launch.worldProjectId) {
      throw new WorldRuntimeWorkbenchError(
        'world-runtime-project-mismatch',
        `WorldVersion '${launch.worldVersionId}' belongs to another WorldProject.`,
      );
    }
    await this.options.runtime.createRun(
      {
        worldVersionId: launch.worldVersionId,
        worldRunId: launch.worldRunId,
        worldSaveId: launch.worldSaveId,
        branchId: launch.branchId,
        saveLabel: launch.saveLabel,
      },
      signal,
    );
    return this.read(toBinding(launch), signal);
  }

  async read(input: WorldRuntimeBinding, signal?: AbortSignal): Promise<WorldRuntimeProjection> {
    const binding = parseWorldRuntimeBinding(input);
    const aggregate = await this.options.repository.readRuntime(binding.worldRunId, signal);
    if (!aggregate) {
      throw new WorldRuntimeWorkbenchError(
        'world-runtime-binding-mismatch',
        `WorldRun '${binding.worldRunId}' is unavailable.`,
      );
    }
    assertAggregateBinding(binding, aggregate);
    const view = await this.options.runtime.materializeBindingView(binding, signal);
    const branch = aggregate.save.branches.find(
      (candidate) => candidate.branchId === binding.branchId,
    );
    if (!branch) {
      throw new WorldRuntimeWorkbenchError(
        'world-runtime-binding-mismatch',
        `World branch '${binding.branchId}' is unavailable.`,
      );
    }
    return parseWorldRuntimeProjection({
      binding,
      status: 'ready',
      background: view.background,
      locations: aggregate.publication.definition.locations.map(
        ({ definitionId, name, description }) => ({ definitionId, name, description }),
      ),
      facts: view.facts.map(({ factId, key, value }) => ({ factId, key, value })),
      availableActions: this.availableActions,
      participants: [
        {
          participantId: binding.participantId,
          ...(binding.actorId === undefined ? {} : { actorId: binding.actorId }),
        },
      ],
      worldStateRevision: view.worldStateRevision,
      timepoint: view.timepoint,
      branches: aggregate.save.branches.map((candidate) => ({
        branchId: candidate.branchId,
        active: candidate.branchId === aggregate.save.activeBranchId,
        ...(candidate.parentBranchId === undefined
          ? {}
          : { parentBranchId: candidate.parentBranchId }),
        eventCount: candidate.events.length,
      })),
      timeline: view.events.slice(-TIMELINE_LIMIT).map((event) => ({
        worldEventId: event.worldEventId,
        actorId: event.actorId,
        action: event.action,
        timepoint: event.timepoint,
        committedAt: event.committedAt,
      })),
      diagnostics: [],
    });
  }

  async submitAction(
    input: { readonly binding: WorldRuntimeBinding; readonly intent: WorldActionIntent },
    signal?: AbortSignal,
  ): Promise<WorldRuntimeProjection> {
    const binding = parseWorldRuntimeBinding(input.binding);
    if (
      input.intent.worldRunId !== binding.worldRunId ||
      input.intent.worldSaveId !== binding.worldSaveId ||
      input.intent.branchId !== binding.branchId
    ) {
      throw new WorldRuntimeWorkbenchError(
        'world-runtime-binding-mismatch',
        'World action does not match the exact visible Runtime binding.',
      );
    }
    await this.options.runtime.commitAction(input.intent, signal);
    return this.read(binding, signal);
  }
}

function toBinding(launch: WorldRuntimeLaunch): WorldRuntimeBinding {
  return parseWorldRuntimeBinding({
    worldProjectId: launch.worldProjectId,
    worldVersionId: launch.worldVersionId,
    worldRunId: launch.worldRunId,
    worldSaveId: launch.worldSaveId,
    branchId: launch.branchId,
    participantId: launch.participantId,
    ...(launch.actorId === undefined ? {} : { actorId: launch.actorId }),
  });
}

function assertAggregateBinding(
  binding: WorldRuntimeBinding,
  aggregate: WorldRuntimeAggregate,
): void {
  if (
    aggregate.publication.worldProjectId !== binding.worldProjectId ||
    aggregate.publication.worldVersionId !== binding.worldVersionId ||
    aggregate.run.worldVersionId !== binding.worldVersionId ||
    aggregate.run.worldSaveId !== binding.worldSaveId ||
    aggregate.save.worldSaveId !== binding.worldSaveId ||
    !aggregate.save.branches.some((branch) => branch.branchId === binding.branchId)
  ) {
    throw new WorldRuntimeWorkbenchError(
      'world-runtime-binding-mismatch',
      'World Runtime binding does not match its exact Project, Version, Run, Save and branch.',
    );
  }
}
