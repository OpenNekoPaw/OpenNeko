export class ProjectEntityRetiredAuthorityError extends Error {
  readonly code = 'project-entity-migration-required' as const;

  constructor() {
    super(
      'Fragmented Project Entity authority is retired; use the canonical Project Entity document and explicit migration inspection.',
    );
    this.name = 'ProjectEntityRetiredAuthorityError';
  }
}

export function rejectRetiredProjectEntityAuthority(): never {
  throw new ProjectEntityRetiredAuthorityError();
}
