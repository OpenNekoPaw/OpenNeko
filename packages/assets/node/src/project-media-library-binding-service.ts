import { realpath, stat } from 'node:fs/promises';
import * as path from 'node:path';
import {
  createProjectMediaLibraryRecoveryPlan,
  parseConfirmedProjectMediaLibraryRecovery,
  parseProjectMediaLibraryRequirement,
  type ConfirmedProjectMediaLibraryRecovery,
  type ProjectMediaLibraryBinding,
  type ProjectMediaLibraryRecoveryPlan,
  type ProjectMediaLibraryRequirement,
} from '@neko/assets-domain/contracts';
import {
  createProjectMediaLibraryBindingFingerprint,
  type ProjectMediaLibraryBindingRepository,
} from './project-media-library-binding-repository';
import type { ProjectMediaLibraryConnectionResolver } from './project-media-library-content-handler';

export interface ProjectMediaLibraryRequirementReader {
  read(libraryName: string): Promise<ProjectMediaLibraryRequirement | undefined>;
}

export class ProjectMediaLibraryBindingService {
  constructor(
    private readonly options: {
      readonly projectId: string;
      readonly bindings: Pick<
        ProjectMediaLibraryBindingRepository,
        'read' | 'applyRecovery' | 'remove'
      >;
      readonly connections: ProjectMediaLibraryConnectionResolver;
      readonly requirements: ProjectMediaLibraryRequirementReader;
    },
  ) {}

  async plan(input: {
    readonly libraryName: string;
    readonly connectionId: string;
  }): Promise<Readonly<ProjectMediaLibraryRecoveryPlan>> {
    const requirement = await this.requireCurrentRequirement(input.libraryName);
    const current = await this.options.bindings.read(input.libraryName);
    if (current.status === 'invalid') {
      throw new Error('Invalid Project Media Library binding must be repaired explicitly.');
    }
    await this.validateReferencedDescendants(input.connectionId, requirement.relativePaths);
    return createProjectMediaLibraryRecoveryPlan({
      projectId: this.options.projectId,
      libraryName: input.libraryName,
      connectionId: input.connectionId,
      requirementFingerprint: requirement.requirementFingerprint,
      validatedRelativePaths: requirement.relativePaths,
      expectedBindingFingerprint:
        current.status === 'available' ? current.binding.bindingFingerprint : null,
      replacementBindingFingerprint: createProjectMediaLibraryBindingFingerprint({
        projectId: this.options.projectId,
        libraryName: input.libraryName,
        connectionId: input.connectionId,
      }),
    });
  }

  async apply(
    confirmation: ConfirmedProjectMediaLibraryRecovery | unknown,
  ): Promise<ProjectMediaLibraryBinding> {
    const parsed = parseConfirmedProjectMediaLibraryRecovery(confirmation);
    const plan = parsed.plan;
    if (plan.projectId !== this.options.projectId) {
      throw new Error('Project Media Library recovery belongs to another Project.');
    }
    const requirement = await this.requireCurrentRequirement(plan.libraryName);
    if (
      requirement.requirementFingerprint !== plan.requirementFingerprint ||
      !samePaths(requirement.relativePaths, plan.validatedRelativePaths)
    ) {
      throw new Error('Project Media Library references changed after recovery was planned.');
    }
    await this.validateReferencedDescendants(plan.connectionId, plan.validatedRelativePaths);
    return this.options.bindings.applyRecovery(parsed);
  }

  async remove(input: {
    readonly libraryName: string;
    readonly expectedBindingFingerprint: string;
  }): Promise<void> {
    await this.options.bindings.remove(input);
  }

  private async requireCurrentRequirement(
    libraryName: string,
  ): Promise<ProjectMediaLibraryRequirement> {
    const requirement = await this.options.requirements.read(libraryName);
    if (!requirement) {
      throw new Error('Project Media Library is not required by current project references.');
    }
    const parsed = parseProjectMediaLibraryRequirement(requirement);
    if (parsed.projectId !== this.options.projectId || parsed.libraryName !== libraryName) {
      throw new Error('Project Media Library requirement belongs to another owner.');
    }
    return parsed;
  }

  private async validateReferencedDescendants(
    connectionId: string,
    relativePaths: readonly string[],
  ): Promise<void> {
    let root: string;
    try {
      root = await realpath(await this.options.connections.resolveAuthorizedTarget(connectionId));
    } catch {
      throw new Error('Selected Media Library connection is unavailable.');
    }
    for (const relativePath of relativePaths) {
      try {
        const candidate = path.resolve(root, ...relativePath.split('/'));
        if (!isInside(candidate, root)) throw new Error('escape');
        const resolved = await realpath(candidate);
        if (!isInside(resolved, root) || !(await stat(resolved)).isFile()) {
          throw new Error('unavailable');
        }
      } catch {
        throw new Error(
          `Selected Media Library connection is missing required content '${relativePath}'.`,
        );
      }
    }
  }
}

function samePaths(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (relative !== '..' && !path.isAbsolute(relative) && !relative.startsWith(`..${path.sep}`))
  );
}
