import {
  parseProjectGlobalReferenceFact,
  parseProjectTargetMembershipFact,
  type ProjectGlobalReferenceFact,
  type ProjectTargetMembershipFact,
} from '../contracts/project-persistence';

export interface ProjectCompositionRepositoryPort {
  commitTarget(fact: ProjectTargetMembershipFact, signal?: AbortSignal): Promise<void>;
  commitGlobalReference(fact: ProjectGlobalReferenceFact, signal?: AbortSignal): Promise<void>;
  replaceGlobalReference(
    input: {
      readonly previous: ProjectGlobalReferenceFact;
      readonly next: ProjectGlobalReferenceFact;
    },
    signal?: AbortSignal,
  ): Promise<void>;
  removeGlobalReference(fact: ProjectGlobalReferenceFact, signal?: AbortSignal): Promise<void>;
}

export class ProjectCompositionCommitService {
  constructor(
    private readonly ports: {
      readonly repository: ProjectCompositionRepositoryPort;
    },
  ) {}

  async addTarget(
    fact: ProjectTargetMembershipFact,
    signal?: AbortSignal,
  ): Promise<ProjectTargetMembershipFact> {
    signal?.throwIfAborted();
    const canonical = parseProjectTargetMembershipFact(fact);
    await this.ports.repository.commitTarget(canonical, signal);
    return canonical;
  }

  async addGlobalReference(
    fact: ProjectGlobalReferenceFact,
    signal?: AbortSignal,
  ): Promise<ProjectGlobalReferenceFact> {
    signal?.throwIfAborted();
    const canonical = parseProjectGlobalReferenceFact(fact);
    await this.ports.repository.commitGlobalReference(canonical, signal);
    return canonical;
  }

  async updateGlobalReference(
    input: {
      readonly previous: ProjectGlobalReferenceFact;
      readonly next: ProjectGlobalReferenceFact;
    },
    signal?: AbortSignal,
  ): Promise<ProjectGlobalReferenceFact> {
    signal?.throwIfAborted();
    const previous = parseProjectGlobalReferenceFact(input.previous);
    const next = parseProjectGlobalReferenceFact(input.next);
    if (previous.projectId !== next.projectId) {
      throw new Error('Project global reference update crosses Project authority.');
    }
    await this.ports.repository.replaceGlobalReference({ previous, next }, signal);
    return next;
  }

  async removeGlobalReference(
    fact: ProjectGlobalReferenceFact,
    signal?: AbortSignal,
  ): Promise<ProjectGlobalReferenceFact> {
    signal?.throwIfAborted();
    const canonical = parseProjectGlobalReferenceFact(fact);
    await this.ports.repository.removeGlobalReference(canonical, signal);
    return canonical;
  }
}
